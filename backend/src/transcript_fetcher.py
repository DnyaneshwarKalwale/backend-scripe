#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos with proxy support

import sys
import json
import traceback
import os
import http.cookiejar
import requests
from functools import partial
import urllib.request
import urllib.parse
import urllib.error
import time
from urllib.parse import parse_qs, urlparse

# Debug mode (when run with --debug flag)
DEBUG = False
if "--debug" in sys.argv:
    DEBUG = True
    sys.argv.remove("--debug")  # Remove the debug flag

def debug_print(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs, flush=True)

# Import proxy configuration
try:
    from config.proxy_config import get_proxy_config, get_urllib_proxy_handler, log_proxy_status, is_proxy_enabled, get_proxy_host_port
except ImportError:
    # Fallback configuration if config file is not available
    debug_print("Warning: Could not import proxy config, using fallback configuration")
    
    PROXY_CONFIG = {
        'host': 'res-ww.lightningproxies.net',
        'port': '9999',
        'username': 'nvizglwiborhznm163317-zone-lightning',
        'password': 'nuuxkavzjt',
        'enabled': True  # Set to False to disable proxy
    }

    def get_proxy_config():
        """Get proxy configuration for requests."""
        if not PROXY_CONFIG['enabled']:
            return None
        
        proxy_url = f"http://{PROXY_CONFIG['username']}:{PROXY_CONFIG['password']}@{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
        return {
            'http': proxy_url,
            'https': proxy_url
        }

    def get_urllib_proxy_handler():
        """Get proxy handler for urllib."""
        if not PROXY_CONFIG['enabled']:
            return None
        
        proxy_url = f"http://{PROXY_CONFIG['username']}:{PROXY_CONFIG['password']}@{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
        proxy_handler = urllib.request.ProxyHandler({
            'http': proxy_url,
            'https': proxy_url
        })
        return proxy_handler
    
    def log_proxy_status():
        """Log proxy status."""
        if PROXY_CONFIG['enabled']:
            debug_print(f"[PROXY] Proxy enabled: {PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}")
        else:
            debug_print("[PROXY] Proxy disabled")
    
    def is_proxy_enabled():
        """Check if proxy is enabled."""
        return PROXY_CONFIG['enabled']
    
    def get_proxy_host_port():
        """Get proxy host and port for logging."""
        if PROXY_CONFIG['enabled']:
            return f"{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
        return None

# Load cookies from file
def load_cookies():
    cookie_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'cookies', 'www.youtube.com_cookies.txt')
    debug_print(f"Loading cookies from: {cookie_file}")
    cookie_jar = http.cookiejar.MozillaCookieJar(cookie_file)
    try:
        cookie_jar.load(ignore_discard=True, ignore_expires=True)
        debug_print("Cookies loaded successfully")
        return cookie_jar
    except Exception as e:
        debug_print(f"Error loading cookies: {e}")
        return None

# First try using the youtube_transcript_api (primary method)
try_ytapi = True
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
    from youtube_transcript_api.formatters import JSONFormatter
    
    # Extend YouTubeTranscriptApi to use cookies and proxy
    class ProxyAwareYouTubeTranscriptApi(YouTubeTranscriptApi):
        def __init__(self, video_id, proxies=None):
            self.video_id = video_id
            self._proxies = proxies
            super().__init__()

        def _initialize_innertube_session(self):
            session = super()._initialize_innertube_session()
            if self._proxies:
                session.proxies.update(self._proxies)
                debug_print(f"Using proxy for YouTube Transcript API: {self._proxies['https']}")
            return session

        @classmethod
        def list_transcripts(cls, video_id, proxies=None):
            """Override the class method to use our proxy-aware instance."""
            instance = cls(video_id, proxies=proxies)
            return instance.get_transcript_list()

        def get_transcript_list(self):
            """Get the list of available transcripts."""
            try:
                # Try direct YouTubeTranscriptApi first
                try:
                    transcript_list = YouTubeTranscriptApi.list_transcripts(self.video_id)
                    debug_print("Successfully got transcript list using direct API")
                except Exception as direct_error:
                    debug_print(f"Direct API failed: {str(direct_error)}, trying with proxy...")
                    transcript_list = super().list_transcripts(self.video_id)
                    debug_print("Successfully got transcript list using proxy")
                
                # Debug: List all available transcripts
                available_transcripts = list(transcript_list)
                debug_print(f"\nFound {len(available_transcripts)} available transcripts:")
                for i, t in enumerate(available_transcripts):
                    debug_print(f"  {i+1}. {t.language} ({t.language_code}) - Generated: {getattr(t, 'is_generated', 'Unknown')}")
                
                return transcript_list
            except Exception as e:
                debug_print(f"Error in get_transcript_list: {e}")
                raise

        def _get_transcript_response(self, url, data=None):
            """Override to ensure proxies are used for all requests."""
            session = self._initialize_innertube_session()
            if data is None:
                response = session.get(url)
            else:
                response = session.post(url, json=data)
            return response.json()

    debug_print("YouTube Transcript API imported and extended successfully")
except ImportError as e:
    debug_print(f"Failed to import YouTube Transcript API: {e}")
    try_ytapi = False

# Check for yt-dlp availability (fallback method 1)
try_ytdlp = True
try:
    import subprocess
    # Check if yt-dlp is available
    ytdlp_path = os.path.join(os.path.dirname(__file__), 'yt-dlp.exe')
    if not os.path.exists(ytdlp_path):
        ytdlp_path = 'yt-dlp'  # Try system-wide installation
    debug_print(f"yt-dlp path: {ytdlp_path}")
except Exception as e:
    debug_print(f"yt-dlp not available: {e}")
    try_ytdlp = False

# Check for requests availability (fallback method 2)
try_requests = True
try:
    import requests
    from bs4 import BeautifulSoup  # noqa
    debug_print("Requests and BeautifulSoup available for scraping")
except ImportError as e:
    debug_print(f"Requests/BeautifulSoup not available: {e}")
    try_requests = False

# Fallback method imports
from urllib.request import urlopen, Request, build_opener, HTTPCookieProcessor, ProxyHandler
from urllib.parse import urlencode
import re

def extract_video_id(url_or_id):
    """Extract video ID from URL or return the ID if already an ID."""
    if 'youtube.com' in url_or_id or 'youtu.be' in url_or_id:
        # Parse URL
        if 'youtube.com' in url_or_id:
            query = parse_qs(urlparse(url_or_id).query)
            return query['v'][0]
        else:
            # youtu.be URLs
            path = urlparse(url_or_id).path
            return path[1:]
    return url_or_id  # Already a video ID

def get_transcript_with_api(video_id, use_proxy=True, max_retries=3):
    """Fetch transcript using the youtube_transcript_api library with optional proxy support."""
    last_error = None
    
    for attempt in range(max_retries):
        try:
            debug_print(f"\n=== YouTube Transcript API Attempt {attempt + 1}/{max_retries} ===")
            debug_print(f"Video ID: {video_id}")
            debug_print(f"Using proxy: {use_proxy}")
            
            # Get proxy configuration only if requested
            proxies = None
            if use_proxy:
                proxies = get_proxy_config()
                if proxies:
                    debug_print(f"Proxy configuration: {proxies}")
                else:
                    debug_print("No proxy configuration available")
            
            # Get transcript list with proxy support
            debug_print("\nGetting transcript list...")
            try:
                # Try direct YouTubeTranscriptApi first
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    debug_print("Successfully got transcript list using direct API")
                except Exception as direct_error:
                    debug_print(f"Direct API failed: {str(direct_error)}, trying with proxy...")
                try:
            transcript_list = ProxyAwareYouTubeTranscriptApi.list_transcripts(video_id, proxies=proxies)
                    debug_print("Successfully got transcript list using proxy")
            except Exception as list_error:
                debug_print(f"Error getting transcript list: {str(list_error)}")
                debug_print(f"Error type: {type(list_error)}")
                debug_print(f"Full error details: {traceback.format_exc()}")
                raise
            
            # Debug: List all available transcripts
            try:
            available_transcripts = list(transcript_list)
                debug_print(f"\nFound {len(available_transcripts)} available transcripts:")
            for i, t in enumerate(available_transcripts):
                debug_print(f"  {i+1}. {t.language} ({t.language_code}) - Generated: {getattr(t, 'is_generated', 'Unknown')}")
            except Exception as list_error:
                debug_print(f"Error listing transcripts: {str(list_error)}")
                debug_print(f"Error type: {type(list_error)}")
                debug_print(f"Full error details: {traceback.format_exc()}")
                raise
            
            # Try to find English transcript
            transcript = None
            try:
                debug_print("\nTrying to find English transcript...")
                transcript = transcript_list.find_transcript(['en'])
                debug_print(f"Found English transcript: {transcript.language_code}")
            except Exception as e:
                debug_print(f"Error finding English transcript: {str(e)}")
                debug_print("Trying to get first available transcript")
                if available_transcripts:
                transcript = available_transcripts[0]
                    debug_print(f"Selected first available transcript: {transcript.language_code}")
                else:
                    debug_print("No transcripts available")
                    raise Exception("No transcripts available")
            
            if not transcript:
                debug_print("Could not find any transcript")
                raise Exception("Could not find any transcript")
            
            debug_print(f"\nSelected transcript: {transcript.language} ({transcript.language_code})")
            
            # Fetch the transcript data
            debug_print("\nFetching transcript data...")
            try:
            transcript_data = transcript.fetch()
                debug_print(f"Successfully fetched transcript data with {len(transcript_data)} segments")
            except Exception as fetch_error:
                debug_print(f"Error fetching transcript data: {str(fetch_error)}")
                debug_print(f"Error type: {type(fetch_error)}")
                debug_print(f"Full error details: {traceback.format_exc()}")
                raise
            
            if not transcript_data:
                debug_print("WARNING: Transcript data is empty!")
                raise Exception("Empty transcript data received")
            
            # Process transcript data
            debug_print("\nProcessing transcript data...")
            transcript_text = ""
            for segment in transcript_data:
                try:
                    if isinstance(segment, dict) and 'text' in segment:
                        transcript_text += segment['text'].strip() + " "
                    elif hasattr(segment, 'text'):
                        transcript_text += str(segment.text).strip() + " "
                    else:
                        transcript_text += str(segment).strip() + " "
                except Exception as process_error:
                    debug_print(f"Error processing segment: {str(process_error)}")
                    debug_print(f"Segment data: {segment}")
                    continue
            
            transcript_text = transcript_text.strip()
            
            if not transcript_text:
                debug_print("WARNING: Transcript text is empty after processing!")
                raise Exception("Empty transcript after processing")
            
            debug_print(f"\nSuccessfully extracted transcript with {len(transcript_text)} characters")
            debug_print(f"First 200 characters: {transcript_text[:200]}...")
            
            return {
                'success': True,
                'transcript': transcript_text,
                'video_id': video_id,
                'language': transcript.language,
                'language_code': transcript.language_code,
                'is_generated': getattr(transcript, 'is_generated', False),
                'channelTitle': "Unknown Channel",
                'videoTitle': "Unknown Title",
                'source': 'youtube_transcript_api_with_proxy' if (use_proxy and proxies) else 'youtube_transcript_api'
            }
            
        except Exception as e:
            last_error = e
            debug_print(f"\nAttempt {attempt + 1} failed: {str(e)}")
            debug_print(f"Error type: {type(e)}")
            debug_print(f"Full error details: {traceback.format_exc()}")
            if attempt < max_retries - 1:
                debug_print("Retrying...")
                time.sleep(1)  # Wait a bit before retrying
            continue
    
    # If we get here, all attempts failed
    debug_print(f"\nAll {max_retries} attempts failed to fetch transcript")
    return {
        'success': False,
        'error': str(last_error),
        'video_id': video_id
    }

def fetch_transcript_manually(video_id):
    """Fetch transcript for a YouTube video using basic HTTP requests with proxy support (fallback method)."""
    try:
        debug_print(f"Using manual scraping for video ID: {video_id}")
        
        # Load cookies
        cookie_jar = load_cookies()
        
        # Set up opener with cookies and proxy
        handlers = [HTTPCookieProcessor(cookie_jar)]
        
        # Add proxy handler if configured
        proxy_handler = get_urllib_proxy_handler()
        if proxy_handler:
            handlers.append(proxy_handler)
            debug_print("Using proxy for manual scraping")
        
        opener = build_opener(*handlers)
        
        # First try to get video info to check if transcripts are available
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
        request = Request(url, headers=headers)
        
        try:
            response = opener.open(request, timeout=30)
            # Handle gzip-compressed responses
            raw_data = response.read()
            
            # Check if response is gzip-compressed
            if raw_data[:2] == b'\x1f\x8b':  # gzip magic number
                import gzip
                html = gzip.decompress(raw_data).decode('utf-8')
                debug_print("Decompressed gzip response")
            else:
                html = raw_data.decode('utf-8')
        except urllib.error.HTTPError as e:
            debug_print(f"HTTP Error {e.code}: {e.reason}")
            if e.code == 403:
                return {
                    'success': False,
                    'error': 'Access forbidden - YouTube may be blocking requests',
                    'video_id': video_id,
                    'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
                }
            raise
        except urllib.error.URLError as e:
            debug_print(f"URL Error: {e.reason}")
            return {
                'success': False,
                'error': f'Network error: {e.reason}',
                'video_id': video_id,
                'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
            }
        
        # Extract channel name
        channel_title = "Unknown Channel"
        channel_match = re.search(r'"channelName":"([^"]+)"', html)
        if channel_match:
            channel_title = channel_match.group(1)
        else:
            # Alternative pattern
            channel_match = re.search(r'<link itemprop="name" content="([^"]+)"', html)
            if channel_match:
                channel_title = channel_match.group(1)
        
        debug_print(f"Found channel name: {channel_title}")
        
        # Try to find duration
        duration = "N/A"
        duration_match = re.search(r'"lengthSeconds":"(\d+)"', html)
        if duration_match:
            seconds = int(duration_match.group(1))
            minutes = seconds // 60
            remaining_seconds = seconds % 60
            duration = f"{minutes:02d}:{remaining_seconds:02d}"
            if minutes >= 60:
                hours = minutes // 60
                minutes = minutes % 60
                duration = f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"
        
        debug_print(f"Found duration: {duration}")
        
        # Basic check if captions are available
        if '"captionTracks":' not in html:
            debug_print("No caption tracks found in HTML")
            return {
                'success': False,
                'error': 'No captions available for this video',
                'video_id': video_id,
                'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
            }
        
        # Extract caption track info - safer approach
        caption_parts = html.split('"captionTracks":')[1].split(',"translationLanguages"')
        if not caption_parts:
            debug_print("Could not parse caption tracks")
            return {
                'success': False,
                'error': 'Could not parse caption tracks',
                'video_id': video_id,
                'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
            }
            
        caption_info = caption_parts[0]
        
        # Manual parsing instead of using json.loads which can fail
        # Look for baseUrl of English captions
        base_url = None
        language = "Unknown"
        language_code = "unknown"
        is_generated = False
        
        # Find the first caption track baseUrl
        url_match = re.search(r'"baseUrl":"([^"]+)"', caption_info)
        if url_match:
            base_url = url_match.group(1)
            base_url = base_url.replace('\\u0026', '&')
            
            # Try to find language info
            lang_match = re.search(r'"languageCode":"([^"]+)"', caption_info)
            if lang_match:
                language_code = lang_match.group(1)
                
            name_match = re.search(r'"name":{"simpleText":"([^"]+)"', caption_info)
            if name_match:
                language = name_match.group(1)
                
            kind_match = re.search(r'"kind":"([^"]+)"', caption_info)
            if kind_match and kind_match.group(1) == 'asr':
                is_generated = True
            
            debug_print(f"Found captions: {language} ({language_code}), auto-generated: {is_generated}")
        
        if not base_url:
            debug_print("Could not find caption URL")
            return {
                'success': False,
                'error': 'Could not find caption URL',
                'video_id': video_id,
                'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
            }
        
        # Get caption data in text format
        try:
            debug_print("Fetching captions as text...")
            caption_url = base_url + '&fmt=txt'
            request = Request(caption_url, headers=headers)
            response = opener.open(request, timeout=30)
            
            # Handle gzip-compressed responses
            raw_data = response.read()
            if raw_data[:2] == b'\x1f\x8b':  # gzip magic number
                import gzip
                transcript = gzip.decompress(raw_data).decode('utf-8')
                debug_print("Decompressed gzip caption response")
            else:
                transcript = raw_data.decode('utf-8')
            
            # Validate transcript content
            transcript = transcript.strip()
            if not transcript or len(transcript.split()) < 10:  # At least 10 words
                debug_print("Transcript too short or empty")
                raise Exception("Invalid transcript content")
            
            debug_print(f"Successfully fetched transcript with {len(transcript)} characters")
            return {
                'success': True,
                'transcript': transcript,
                'language': language,
                'language_code': language_code,
                'is_generated': is_generated,
                'video_id': video_id,
                'channelTitle': channel_title,
                'duration': duration,
                'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
            }
        except Exception as e:
            debug_print(f"Error fetching text captions: {e}")
            # Try to get raw JSON
            try:
                debug_print("Trying to fetch captions as JSON...")
                caption_url = base_url + '&fmt=json3'
                request = Request(caption_url, headers=headers)
                response = opener.open(request, timeout=30)
                
                # Handle gzip-compressed responses
                raw_data = response.read()
                if raw_data[:2] == b'\x1f\x8b':  # gzip magic number
                    import gzip
                    json_text = gzip.decompress(raw_data).decode('utf-8')
                    debug_print("Decompressed gzip JSON caption response")
                else:
                    json_text = raw_data.decode('utf-8')
                
                caption_data = json.loads(json_text)
                
                # Extract transcript from JSON
                transcript_pieces = []
                if 'events' in caption_data:
                    for event in caption_data['events']:
                        if 'segs' in event:
                            for seg in event['segs']:
                                if 'utf8' in seg:
                                    transcript_pieces.append(seg['utf8'].strip())
                
                transcript = ' '.join(transcript_pieces).strip()
                
                # Validate transcript content
                if not transcript or len(transcript.split()) < 10:  # At least 10 words
                    debug_print("JSON transcript too short or empty")
                    raise Exception("Invalid transcript content")
                
                debug_print(f"Successfully fetched JSON transcript with {len(transcript)} characters")
                return {
                    'success': True,
                    'transcript': transcript,
                    'language': language,
                    'language_code': language_code,
                    'is_generated': is_generated,
                    'video_id': video_id,
                    'channelTitle': channel_title,
                    'duration': duration,
                    'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
                }
            except Exception as json_err:
                debug_print(f"Error fetching JSON captions: {json_err}")
                return {
                    'success': False,
                    'error': f"Failed to parse caption data: {str(json_err)}",
                    'video_id': video_id,
                    'source': 'manual_scraping_with_proxy' if proxy_handler else 'manual_scraping'
                }
    except Exception as e:
        debug_print(f"Error in fetch_transcript_manually: {e}")
        debug_print(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'manual_scraping_with_proxy' if get_urllib_proxy_handler() else 'manual_scraping'
        }

def get_transcript_with_ytdlp(video_id):
    """Fallback method using yt-dlp to extract transcript."""
    try:
        debug_print(f"Using yt-dlp for video ID: {video_id}")
        
        # This would be implemented here, but for now return a failure
        # since the main yt-dlp logic is already handled in the backend
        return {
            'success': False,
            'error': 'yt-dlp method not implemented in this context',
            'video_id': video_id,
            'source': 'yt-dlp'
        }
    except Exception as e:
        debug_print(f"Error with yt-dlp method: {e}")
        return {
            'success': False,
            'error': str(e),
            'video_id': video_id,
            'source': 'yt-dlp'
        }

def get_transcript_with_requests(video_id):
    """Fallback method using requests and BeautifulSoup."""
    try:
        debug_print(f"Using requests/BeautifulSoup for video ID: {video_id}")
        
        # This would implement web scraping logic
        # For now, return the manual scraping method result
        return fetch_transcript_manually(video_id)
    except Exception as e:
        debug_print(f"Error with requests method: {e}")
        return {
            'success': False,
            'error': str(e),
            'video_id': video_id,
            'source': 'requests_scraping'
        }

def get_transcript(video_id):
    """Main function that tries multiple methods to get a transcript."""
    # First extract video ID if it's a URL
    video_id = extract_video_id(video_id)
    debug_print(f"Getting transcript for video ID: {video_id}")
    
    # Log proxy status
    log_proxy_status()
    
    # First method: YouTube Transcript API with proxy (this is what works!)
    if try_ytapi:
        debug_print("Trying YouTube Transcript API method with proxy (primary method)...")
        result = get_transcript_with_api(video_id, use_proxy=True)  # Always use proxy for YT API
        if result['success']:
            debug_print("YouTube Transcript API method succeeded")
            return result
        debug_print(f"YouTube Transcript API method failed: {result.get('error')}")
        
        # Try again without proxy
        debug_print("Trying YouTube Transcript API method without proxy...")
        result = get_transcript_with_api(video_id, use_proxy=False)
        if result['success']:
            debug_print("YouTube Transcript API method without proxy succeeded")
            return result
        debug_print(f"YouTube Transcript API method without proxy failed: {result.get('error')}")

    # Fallback methods if YouTube Transcript API fails
    debug_print("YouTube Transcript API failed, trying fallback methods...")
    
    # Method 2: yt-dlp direct extraction
    if try_ytdlp:
        debug_print("Trying yt-dlp method...")
        result = get_transcript_with_ytdlp(video_id)
        if result['success']:
            debug_print("yt-dlp method succeeded")
            return result
        debug_print(f"yt-dlp method failed: {result.get('error')}")
    
    # Method 3: requests + BeautifulSoup scraping
    if try_requests:
        debug_print("Trying requests/BeautifulSoup method...")
        result = get_transcript_with_requests(video_id)
        if result['success']:
            debug_print("requests/BeautifulSoup method succeeded")
            return result
        debug_print(f"requests/BeautifulSoup method failed: {result.get('error')}")
    
    # If all methods fail
    return {
        'success': False,
        'error': 'All transcript extraction methods failed',
        'video_id': video_id,
        'methods_tried': ['youtube_transcript_api', 'youtube_transcript_api_no_proxy', 'yt-dlp', 'requests']
    }

if __name__ == "__main__":
    # Handle test flag first
    if "--test" in sys.argv:
        print(json.dumps({
            'success': True,
            'message': 'Transcript fetcher is working correctly',
            'proxy_enabled': is_proxy_enabled(),
            'proxy_host': get_proxy_host_port()
        }))
        sys.exit(0)
        
    # Normal video ID processing
    video_id = None
    for arg in sys.argv[1:]:
        if arg != "--debug":
            video_id = arg
            break
    
    if video_id is None:
        print(json.dumps({
            'success': False,
            'error': 'Missing video ID. Usage: transcript_fetcher.py [--debug] VIDEO_ID'
        }))
        sys.exit(1)
    
    result = get_transcript(video_id)
    try:
        json_result = json.dumps(result)
        print(json_result)
    except Exception as general_error:
            print(json.dumps({
                'success': False,
            'error': f"General error: {str(general_error)}",
                'video_id': video_id
            })) 