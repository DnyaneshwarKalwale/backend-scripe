#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos

import sys
import json
import traceback
import os
from http.cookiejar import MozillaCookieJar

# Debug mode (when run with --debug flag)
DEBUG = False
if len(sys.argv) > 1 and sys.argv[1] == "--debug":
    DEBUG = True
    sys.argv.pop(1)  # Remove the debug flag

def debug_print(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs, flush=True)

# First try using the youtube_transcript_api (primary method)
try_ytapi = True
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
    debug_print("YouTube Transcript API imported successfully")
    
    # Try to import requests session for better cookie handling
    try:
        import requests
        HAS_REQUESTS = True
        debug_print("Requests library available for enhanced cookie support")
    except ImportError:
        HAS_REQUESTS = False
        debug_print("Requests library not available, using urllib only")
except ImportError as e:
    debug_print(f"Failed to import YouTube Transcript API: {e}")
    try_ytapi = False
    HAS_REQUESTS = False

# Fallback method imports
from urllib.request import urlopen, Request, HTTPCookieProcessor, build_opener
from urllib.parse import urlencode
import re

def load_cookies():
    """Load cookies from the YouTube cookies file."""
    try:
        # Look for cookies file in the expected location
        cookies_path = os.path.join(os.path.dirname(__file__), '..', 'toutube_cookies', 'www.youtube.com_cookies.txt')
        
        if not os.path.exists(cookies_path):
            debug_print(f"Cookies file not found at: {cookies_path}")
            return None
            
        debug_print(f"Loading cookies from: {cookies_path}")
        cookie_jar = MozillaCookieJar(cookies_path)
        cookie_jar.load(ignore_discard=True, ignore_expires=True)
        debug_print(f"Loaded {len(cookie_jar)} cookies")
        return cookie_jar
    except Exception as e:
        debug_print(f"Error loading cookies: {e}")
        return None

def create_requests_session_with_cookies():
    """Create a requests session with YouTube cookies if available."""
    if not HAS_REQUESTS:
        return None
    
    try:
        import requests
        session = requests.Session()
        
        cookies = load_cookies()
        if cookies:
            # Convert cookie jar to requests session cookies
            for cookie in cookies:
                session.cookies.set(cookie.name, cookie.value, domain=cookie.domain, path=cookie.path)
            
            # Set realistic headers that match a real browser
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            })
            
            debug_print(f"Created requests session with {len(session.cookies)} cookies")
            return session
        else:
            debug_print("No cookies available for requests session")
            return session
    except Exception as e:
        debug_print(f"Error creating requests session: {e}")
        return None

def get_transcript_with_api(video_id):
    """Fetch transcript using the youtube_transcript_api library."""
    try:
        debug_print(f"Using YouTube Transcript API for video ID: {video_id}")
        
        # Load cookies for the API
        session = create_requests_session_with_cookies()
        
        # Set up urllib opener as backup
        cookies = load_cookies()
        if cookies:
            debug_print("Using cookies for YouTube Transcript API")
            # Set up cookie processor for requests - this helps with the underlying HTTP requests
            import urllib.request
            cookie_processor = HTTPCookieProcessor(cookies)
            opener = build_opener(cookie_processor)
            urllib.request.install_opener(opener)
            
            # Also try to set up session headers that might help with authentication
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
        # If we have requests session, try to monkey-patch the youtube_transcript_api to use it
        if session and HAS_REQUESTS:
            debug_print("Attempting to use requests session for YouTube Transcript API")
            # This is a bit hacky but might help with cookie authentication
            try:
                import youtube_transcript_api._api as yt_api
                original_get = getattr(yt_api, '_get', None)
                if original_get:
                    def patched_get(url, headers=None):
                        debug_print(f"Making request to: {url}")
                        response = session.get(url, headers=headers or {})
                        return response.text
                    yt_api._get = patched_get
                    debug_print("Successfully patched YouTube Transcript API to use session")
            except Exception as patch_error:
                debug_print(f"Could not patch YouTube Transcript API: {patch_error}")
                # Continue with default behavior
        
        # Get transcript list
        debug_print("Getting transcript list...")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
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
        
        debug_print(f"Successfully extracted transcript with {len(transcript_text)} characters")
        
        # Try to get video metadata
        channel_title = "Unknown Channel"
        
        try:
            # Simple fetch of the video page to get the channel name
            request = Request(f"https://www.youtube.com/watch?v={video_id}", 
                             headers={'User-Agent': 'Mozilla/5.0'})
            response = urlopen(request)
            html = response.read().decode('utf-8')
            
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
            'source': 'youtube_transcript_api'
        }
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        debug_print(f"YouTube Transcript API specific error: {e}")
        return {
            'success': False,
            'error': str(e),
            'video_id': video_id,
            'source': 'youtube_transcript_api'
        }
    except Exception as e:
        debug_print(f"Error in get_transcript_with_api: {e}")
        debug_print(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'youtube_transcript_api'
        }

def fetch_transcript_manually(video_id):
    """Fetch transcript for a YouTube video using basic HTTP requests (fallback method)."""
    try:
        debug_print(f"Using manual scraping for video ID: {video_id}")
        
        # Try to use requests session first, fallback to urllib
        session = create_requests_session_with_cookies()
        
        # Load cookies for manual scraping (urllib fallback)
        cookies = load_cookies()
        if cookies:
            debug_print("Using cookies for manual scraping")
            cookie_processor = HTTPCookieProcessor(cookies)
            opener = build_opener(cookie_processor)
        else:
            debug_print("No cookies available, using default opener")
            opener = build_opener()
        
        # First try to get video info to check if transcripts are available
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        # Try requests session first if available
        if session and HAS_REQUESTS:
            debug_print("Using requests session for manual scraping")
            # Add a small delay to appear more human-like
            import time
            time.sleep(1)
            response = session.get(url)
            html = response.text
        else:
            debug_print("Using urllib for manual scraping")
            request = Request(url, headers=headers)
            response = opener.open(request)
            html = response.read().decode('utf-8')
        
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
                'source': 'manual_scraping'
            }
        
        # Extract caption track info - safer approach
        caption_parts = html.split('"captionTracks":')[1].split(',"translationLanguages"')
        if not caption_parts:
            debug_print("Could not parse caption tracks")
            return {
                'success': False,
                'error': 'Could not parse caption tracks',
                'video_id': video_id,
                'source': 'manual_scraping'
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
                'source': 'manual_scraping'
            }
        
        # Get caption data in text format
        try:
            debug_print("Fetching captions as text...")
            caption_url = base_url + '&fmt=txt'
            
            # Use requests session if available
            if session and HAS_REQUESTS:
                # Add referer header for caption requests
                caption_headers = {
                    'Referer': url,
                    'Origin': 'https://www.youtube.com'
                }
                response = session.get(caption_url, headers=caption_headers)
                transcript = response.text
            else:
                request = Request(caption_url, headers=headers)
                response = opener.open(request)
                transcript = response.read().decode('utf-8')
            
            debug_print(f"Successfully fetched transcript with {len(transcript)} characters")
            return {
                'success': True,
                'transcript': transcript.strip(),
                'language': language,
                'language_code': language_code,
                'is_generated': is_generated,
                'video_id': video_id,
                'channelTitle': channel_title,
                'duration': duration,
                'source': 'manual_scraping'
            }
        except Exception as e:
            debug_print(f"Error fetching text captions: {e}")
            # Try to get raw JSON
            try:
                debug_print("Trying to fetch captions as JSON...")
                caption_url = base_url + '&fmt=json3'
                
                # Use requests session if available
                if session and HAS_REQUESTS:
                    # Add referer header for caption requests
                    caption_headers = {
                        'Referer': url,
                        'Origin': 'https://www.youtube.com'
                    }
                    response = session.get(caption_url, headers=caption_headers)
                    caption_data = response.json()
                else:
                    request = Request(caption_url, headers=headers)
                    response = opener.open(request)
                    caption_data = json.loads(response.read().decode('utf-8'))
                
                # Extract transcript from JSON
                transcript_pieces = []
                if 'events' in caption_data:
                    for event in caption_data['events']:
                        if 'segs' in event:
                            for seg in event['segs']:
                                if 'utf8' in seg:
                                    transcript_pieces.append(seg['utf8'])
                
                transcript = ' '.join(transcript_pieces).strip()
                
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
                    'source': 'manual_scraping'
                }
            except Exception as json_err:
                debug_print(f"Error fetching JSON captions: {json_err}")
                return {
                    'success': False,
                    'error': f"Failed to parse caption data: {str(json_err)}",
                    'video_id': video_id,
                    'source': 'manual_scraping'
                }
    except Exception as e:
        debug_print(f"Error in fetch_transcript_manually: {e}")
        debug_print(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'manual_scraping'
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