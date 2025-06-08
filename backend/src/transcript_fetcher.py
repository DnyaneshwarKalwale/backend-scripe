#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos

import sys
import json
import traceback
import time
import random
import os
import gzip
from urllib.request import urlopen, Request, HTTPCookieProcessor, build_opener, ProxyHandler
from urllib.parse import urlencode
from http.cookiejar import MozillaCookieJar
import re

# Debug mode (when run with --debug flag)
DEBUG = False
if len(sys.argv) > 1 and sys.argv[1] == "--debug":
    DEBUG = True
    sys.argv.pop(1)  # Remove the debug flag

def debug_print(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs, flush=True)

# Cookie handling
def load_cookies():
    """Load cookies from the cookies file."""
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        cookies_path = os.path.join(script_dir, '..', 'cookies', 'www.youtube.com_cookies.txt')
        
        if os.path.exists(cookies_path):
            debug_print(f"Loading cookies from: {cookies_path}")
            cookie_jar = MozillaCookieJar(cookies_path)
            cookie_jar.load(ignore_discard=True, ignore_expires=True)
            debug_print(f"Loaded {len(cookie_jar)} cookies")
            return cookie_jar
        else:
            debug_print(f"Cookies file not found at: {cookies_path}")
            return None
    except Exception as e:
        debug_print(f"Error loading cookies: {e}")
        return None

# First try using the youtube_transcript_api (primary method)
try_ytapi = True
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
    from youtube_transcript_api.proxies import WebshareProxyConfig
    debug_print("YouTube Transcript API imported successfully with proxy support")
except ImportError as e:
    debug_print(f"Failed to import YouTube Transcript API: {e}")
    try_ytapi = False

def get_transcript_with_api(video_id):
    """Fetch transcript using the youtube_transcript_api library with enhanced anti-detection, cookies, and Webshare proxies."""
    try:
        debug_print(f"Using YouTube Transcript API for video ID: {video_id}")
        
        # Add a small random delay to appear more human-like
        delay = random.uniform(0.5, 2.0)
        debug_print(f"Adding anti-detection delay: {delay:.2f}s")
        time.sleep(delay)
        
        # Initialize YouTubeTranscriptApi with Webshare proxy configuration
        proxy_config = WebshareProxyConfig(
            proxy_username="tzlgbidr",
            proxy_password="p2gjh6cl2hq6"
        )
        
        debug_print("Initializing YouTube Transcript API with Webshare proxy...")
        ytt_api = YouTubeTranscriptApi(proxy_config=proxy_config)
        
        # Get transcript list
        debug_print("Getting transcript list...")
        transcript_list = ytt_api.list_transcripts(video_id)
        
        # Try to find English transcript
        try:
            debug_print("Looking for English transcript...")
            transcript = transcript_list.find_transcript(['en'])
            debug_print(f"Found English transcript: {transcript.language_code}")
        except NoTranscriptFound:
            debug_print("No English transcript found, trying any available language")
            available_transcripts = list(transcript_list)
            if not available_transcripts:
                raise Exception("No transcripts available")
            transcript = available_transcripts[0]
            debug_print(f"Using {transcript.language} transcript")
            
        # Add another small delay before fetching
        time.sleep(random.uniform(0.3, 1.0))
            
        # Get transcript data
        debug_print("Fetching transcript data...")
        transcript_data = transcript.fetch()
        debug_print(f"Got {len(transcript_data)} transcript segments")
        
        # Join the text parts - properly handle FetchedTranscriptSnippet objects
        transcript_text = ''
        for segment in transcript_data:
            try:
                # Check if it's a FetchedTranscriptSnippet object (has text attribute)
                if hasattr(segment, 'text'):
                    transcript_text += segment.text + ' '
                # Or if it's a dictionary with 'text' key
                elif isinstance(segment, dict) and 'text' in segment:
                    transcript_text += segment['text'] + ' '
                # Last resort: convert to string
                else:
                    transcript_text += str(segment) + ' '
            except Exception as e:
                debug_print(f"Error extracting text from segment: {e}")
                continue
        
        debug_print(f"Successfully extracted transcript with {len(transcript_text)} characters using Webshare proxy")
        
        # Try to get video metadata with enhanced headers and cookies
        channel_title = "Unknown Channel"
        
        try:
            # Load cookies for authenticated requests
            cookie_jar = load_cookies()
            
            # Use rotating user agents for better success rate
            user_agents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
            ]
            user_agent = random.choice(user_agents)
            
            headers = {
                'User-Agent': user_agent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            # Create opener with cookies if available
            if cookie_jar:
                opener = build_opener(HTTPCookieProcessor(cookie_jar))
                request = Request(f"https://www.youtube.com/watch?v={video_id}", headers=headers)
                response = opener.open(request)
            else:
                request = Request(f"https://www.youtube.com/watch?v={video_id}", headers=headers)
                response = urlopen(request)
            
            # Handle gzip encoding
            raw_data = response.read()
            if response.info().get('Content-Encoding') == 'gzip':
                html = gzip.decompress(raw_data).decode('utf-8')
            else:
                html = raw_data.decode('utf-8')
            
            # Extract channel name using regex
            channel_match = re.search(r'"channelName":"([^"]+)"', html)
            if channel_match:
                channel_title = channel_match.group(1)
            else:
                # Alternative pattern
                channel_match = re.search(r'<link itemprop="name" content="([^"]+)"', html)
                if channel_match:
                    channel_title = channel_match.group(1)
            
            debug_print(f"Found channel name: {channel_title}")
        except Exception as e:
            debug_print(f"Error fetching channel name: {e}")
        
        return {
            'success': True,
            'transcript': transcript_text.strip(),
            'language': transcript.language,
            'language_code': transcript.language_code,
            'is_generated': transcript.is_generated,
            'video_id': video_id,
            'channelTitle': channel_title,
            'source': 'youtube_transcript_api_with_webshare_proxy'
        }
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        debug_print(f"YouTube Transcript API specific error: {e}")
        return {
            'success': False,
            'error': str(e),
            'video_id': video_id,
            'source': 'youtube_transcript_api_with_webshare_proxy'
        }
    except Exception as e:
        debug_print(f"Error in get_transcript_with_api: {e}")
        debug_print(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'youtube_transcript_api_with_webshare_proxy'
        }

def fetch_transcript_manually(video_id):
    """Fetch transcript for a YouTube video using basic HTTP requests with enhanced anti-detection, cookies, and Webshare proxies."""
    try:
        debug_print(f"Using manual scraping for video ID: {video_id}")
        
        # Load cookies for authenticated requests
        cookie_jar = load_cookies()
        
        # Enhanced anti-detection headers
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
        
        headers = {
            'User-Agent': random.choice(user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        }
        
        # Setup proxy handler for Webshare
        try:
            # Webshare proxy configuration - they use rotating residential proxies
            proxy_handler = ProxyHandler({
                'http': 'http://tzlgbidr-rotate:p2gjh6cl2hq6@p.webshare.io:80',
                'https': 'http://tzlgbidr-rotate:p2gjh6cl2hq6@p.webshare.io:80'
            })
            
            # Create opener with proxy and cookies
            if cookie_jar:
                opener = build_opener(proxy_handler, HTTPCookieProcessor(cookie_jar))
            else:
                opener = build_opener(proxy_handler)
            
            debug_print("Manual scraping will use Webshare proxy")
        except Exception as proxy_error:
            debug_print(f"Failed to setup proxy, using direct connection: {proxy_error}")
            # Fallback to direct connection
            if cookie_jar:
                opener = build_opener(HTTPCookieProcessor(cookie_jar))
            else:
                opener = build_opener()
        
        # Add random delay
        time.sleep(random.uniform(1.0, 3.0))
        
        # First try to get video info to check if transcripts are available
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Use the opener (with or without proxy)
        request = Request(url, headers=headers)
        response = opener.open(request)
        
        # Handle gzip encoding - improved detection
        raw_data = response.read()
        
        # Check for gzip magic number (1f 8b) or Content-Encoding header
        is_gzipped = (response.info().get('Content-Encoding') == 'gzip' or 
                     (len(raw_data) >= 2 and raw_data[0] == 0x1f and raw_data[1] == 0x8b))
        
        if is_gzipped:
            try:
                html = gzip.decompress(raw_data).decode('utf-8')
                debug_print("Successfully decompressed gzip data")
            except gzip.BadGzipFile:
                debug_print("Gzip decompression failed, trying as plain text")
                html = raw_data.decode('utf-8', errors='ignore')
        else:
            try:
                html = raw_data.decode('utf-8')
            except UnicodeDecodeError:
                # If UTF-8 fails, try with error handling
                html = raw_data.decode('utf-8', errors='ignore')
                debug_print("Used UTF-8 decoding with error handling")
        
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
        
        # Try to find duration with multiple patterns
        duration = "N/A"
        duration_match = re.search(r'"lengthSeconds":"(\d+)"', html)
        if not duration_match:
            # Try alternative patterns
            duration_match = re.search(r'"approxDurationMs":"(\d+)"', html)
            if duration_match:
                seconds = int(duration_match.group(1)) // 1000  # Convert milliseconds to seconds
            else:
                # Try meta duration pattern
                duration_match = re.search(r'<meta itemprop="duration" content="PT(\d+)M(\d+)S"', html)
                if duration_match:
                    minutes = int(duration_match.group(1))
                    seconds = int(duration_match.group(2))
                    seconds = minutes * 60 + seconds
                else:
                    # Try JSON-LD structured data
                    duration_match = re.search(r'"duration":"PT(\d+)M(\d+)S"', html)
                    if duration_match:
                        minutes = int(duration_match.group(1))
                        secs = int(duration_match.group(2))
                        seconds = minutes * 60 + secs
                    else:
                        seconds = None
        else:
            seconds = int(duration_match.group(1))
            
        if seconds:
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
                'source': 'manual_scraping_with_webshare_proxy'
            }
        
        # Extract caption track info - safer approach
        caption_parts = html.split('"captionTracks":')[1].split(',"translationLanguages"')
        if not caption_parts:
            debug_print("Could not parse caption tracks")
            return {
                'success': False,
                'error': 'Could not parse caption tracks',
                'video_id': video_id,
                'source': 'manual_scraping_with_webshare_proxy'
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
                'source': 'manual_scraping_with_webshare_proxy'
            }
        
        # Add delay before fetching captions
        time.sleep(random.uniform(0.5, 1.5))
        
        # Get caption data in text format
        try:
            debug_print("Fetching captions as text...")
            caption_url = base_url + '&fmt=txt'
            
            # Use the same opener (with proxy) for caption requests
            request = Request(caption_url, headers=headers)
            response = opener.open(request)
            
            # Handle gzip encoding for captions - improved detection
            raw_data = response.read()
            
            # Check for gzip magic number (1f 8b) or Content-Encoding header
            is_gzipped = (response.info().get('Content-Encoding') == 'gzip' or 
                         (len(raw_data) >= 2 and raw_data[0] == 0x1f and raw_data[1] == 0x8b))
            
            if is_gzipped:
                try:
                    transcript = gzip.decompress(raw_data).decode('utf-8')
                    debug_print("Successfully decompressed gzip caption data")
                except gzip.BadGzipFile:
                    debug_print("Gzip decompression failed for captions, trying as plain text")
                    transcript = raw_data.decode('utf-8', errors='ignore')
            else:
                try:
                    transcript = raw_data.decode('utf-8')
                except UnicodeDecodeError:
                    transcript = raw_data.decode('utf-8', errors='ignore')
                    debug_print("Used UTF-8 decoding with error handling for captions")
            
            debug_print(f"Successfully fetched transcript with {len(transcript)} characters using proxy")
            return {
                'success': True,
                'transcript': transcript.strip(),
                'language': language,
                'language_code': language_code,
                'is_generated': is_generated,
                'video_id': video_id,
                'channelTitle': channel_title,
                'duration': duration,
                'source': 'manual_scraping_with_webshare_proxy'
            }
        except Exception as e:
            debug_print(f"Error fetching text captions: {e}")
            # Try to get raw JSON
            try:
                debug_print("Trying to fetch captions as JSON...")
                caption_url = base_url + '&fmt=json3'
                
                # Use the same opener (with proxy) for JSON caption requests
                request = Request(caption_url, headers=headers)
                response = opener.open(request)
                
                # Handle gzip encoding for JSON captions - improved detection
                raw_data = response.read()
                
                # Check for gzip magic number (1f 8b) or Content-Encoding header
                is_gzipped = (response.info().get('Content-Encoding') == 'gzip' or 
                             (len(raw_data) >= 2 and raw_data[0] == 0x1f and raw_data[1] == 0x8b))
                
                if is_gzipped:
                    try:
                        caption_text = gzip.decompress(raw_data).decode('utf-8')
                        debug_print("Successfully decompressed gzip JSON caption data")
                    except gzip.BadGzipFile:
                        debug_print("Gzip decompression failed for JSON captions, trying as plain text")
                        caption_text = raw_data.decode('utf-8', errors='ignore')
                else:
                    try:
                        caption_text = raw_data.decode('utf-8')
                    except UnicodeDecodeError:
                        caption_text = raw_data.decode('utf-8', errors='ignore')
                        debug_print("Used UTF-8 decoding with error handling for JSON captions")
                    
                caption_data = json.loads(caption_text)
                
                # Extract transcript from JSON
                transcript_pieces = []
                if 'events' in caption_data:
                    for event in caption_data['events']:
                        if 'segs' in event:
                            for seg in event['segs']:
                                if 'utf8' in seg:
                                    transcript_pieces.append(seg['utf8'])
                
                transcript = ' '.join(transcript_pieces).strip()
                
                debug_print(f"Successfully fetched JSON transcript with {len(transcript)} characters using proxy")
                return {
                    'success': True,
                    'transcript': transcript,
                    'language': language,
                    'language_code': language_code,
                    'is_generated': is_generated,
                    'video_id': video_id,
                    'channelTitle': channel_title,
                    'duration': duration,
                    'source': 'manual_scraping_with_webshare_proxy'
                }
            except Exception as json_err:
                debug_print(f"Error fetching JSON captions: {json_err}")
                return {
                    'success': False,
                    'error': f"Failed to parse caption data: {str(json_err)}",
                    'video_id': video_id,
                    'source': 'manual_scraping_with_webshare_proxy'
                }
    except Exception as e:
        debug_print(f"Error in fetch_transcript_manually: {e}")
        debug_print(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'manual_scraping_with_webshare_proxy'
        }

def get_transcript(video_id):
    """Main function that tries multiple methods to get a transcript."""
    debug_print(f"Getting transcript for video ID: {video_id}")
    
    # First try the YouTube Transcript API if available
    if try_ytapi:
        debug_print("Trying YouTube Transcript API method...")
        result = get_transcript_with_api(video_id)
        if result['success']:
            debug_print("YouTube Transcript API method succeeded")
            return result
        debug_print(f"YouTube Transcript API method failed: {result.get('error')}")

    # Fallback to manual method if YouTube Transcript API fails or is not available
    debug_print("Trying manual scraping method...")
    result = fetch_transcript_manually(video_id)
    if result['success']:
        debug_print("Manual scraping method succeeded")
    else:
        debug_print(f"Manual scraping method failed: {result.get('error')}")
    
    return result

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Missing video ID. Usage: transcript_fetcher.py VIDEO_ID'
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    result = get_transcript(video_id)
    # Ensure encoding issues don't break the JSON output
    try:
        json_result = json.dumps(result)
        print(json_result)
    except UnicodeEncodeError as e:
        # If encoding issues occur, try to sanitize the transcript
        if 'transcript' in result and result['success']:
            result['transcript'] = result['transcript'].encode('utf-8', errors='ignore').decode('utf-8')
            print(json.dumps(result))
        else:
            print(json.dumps({
                'success': False,
                'error': f"Encoding error: {str(e)}",
                'video_id': video_id
            })) 