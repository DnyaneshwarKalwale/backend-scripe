#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos

import sys
import json
import traceback
import os
import http.cookiejar
import requests
from functools import partial

# Debug mode (when run with --debug flag)
DEBUG = False
if len(sys.argv) > 1 and sys.argv[1] == "--debug":
    DEBUG = True
    sys.argv.pop(1)  # Remove the debug flag

def debug_print(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs, flush=True)

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
    
    # Extend YouTubeTranscriptApi to use cookies
    class CookieAwareYouTubeTranscriptApi(YouTubeTranscriptApi):
        def __init__(self, video_id, cookie_jar=None):
            self.video_id = video_id
            self._cookie_jar = cookie_jar
            super().__init__()

        def _initialize_innertube_session(self):
            session = super()._initialize_innertube_session()
            if self._cookie_jar:
                session.cookies = self._cookie_jar
            return session

    debug_print("YouTube Transcript API imported and extended successfully")
except ImportError as e:
    debug_print(f"Failed to import YouTube Transcript API: {e}")
    try_ytapi = False

# Fallback method imports
from urllib.request import urlopen, Request, build_opener, HTTPCookieProcessor
from urllib.parse import urlencode
import re

def get_transcript_with_api(video_id):
    """Fetch transcript using the youtube_transcript_api library with cookie support."""
    try:
        debug_print(f"Using YouTube Transcript API for video ID: {video_id}")
        
        # Load cookies
        cookie_jar = load_cookies()
        debug_print("Cookies loaded for YouTube Transcript API")
        
        # Create cookie-aware API instance
        transcript_api = CookieAwareYouTubeTranscriptApi(video_id, cookie_jar)
        
        # Get transcript list
        debug_print("Getting transcript list...")
        transcript_list = transcript_api.list_transcripts(video_id)
        
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
        
        # Join the text parts
        transcript_text = ' '.join(
            segment.get('text', '') if isinstance(segment, dict) else 
            getattr(segment, 'text', str(segment))
            for segment in transcript_data
        ).strip()
        
        debug_print(f"Successfully extracted transcript with {len(transcript_text)} characters")
        
        # Try to get video metadata using cookies
        channel_title = "Unknown Channel"
        
        try:
            # Create session with cookies
            session = requests.Session()
            if cookie_jar:
                session.cookies = cookie_jar
            
            response = session.get(
                f"https://www.youtube.com/watch?v={video_id}",
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            html = response.text
            
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
            'transcript': transcript_text,
            'language': transcript.language,
            'language_code': transcript.language_code,
            'is_generated': getattr(transcript, 'is_generated', False),
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
        
        # Load cookies
        cookie_jar = load_cookies()
        opener = build_opener(HTTPCookieProcessor(cookie_jar))
        
        # First try to get video info to check if transcripts are available
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
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
    # Parse command line arguments
    args = sys.argv[1:]  # Remove script name from args
    
    # Check for test flag
    if "--test" in args:
        print(json.dumps({
            'success': True,
            'message': 'YouTube transcript fetcher test successful'
        }))
        sys.exit(0)
    
    # Check for debug flag
    if "--debug" in args:
        DEBUG = True
        args.remove("--debug")
    
    # After removing flags, we should have exactly one argument (video_id)
    if len(args) != 1:
        print(json.dumps({
            'success': False,
            'error': 'Usage: transcript_fetcher.py [--debug] [--test] VIDEO_ID'
        }))
        sys.exit(1)
    
    # Only process video if not in test mode
    if "--test" not in sys.argv:
        video_id = args[0]
        result = get_transcript(video_id)
        try:
            json_result = json.dumps(result)
            print(json_result)
        except UnicodeEncodeError as e:
            if 'transcript' in result and result['success']:
                result['transcript'] = result['transcript'].encode('utf-8', errors='ignore').decode('utf-8')
                print(json.dumps(result))
            else:
                print(json.dumps({
                    'success': False,
                    'error': f"Encoding error: {str(e)}",
                    'video_id': video_id
                }))