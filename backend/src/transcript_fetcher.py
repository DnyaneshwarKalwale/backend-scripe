#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos

import sys
import json
import traceback

# First try using the youtube_transcript_api (primary method)
try_ytapi = True
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api.formatters import JSONFormatter
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
    print("YouTube Transcript API loaded successfully")
except ImportError:
    print("YouTube Transcript API not available, falling back to manual method")
    try_ytapi = False

# Fallback method imports
from urllib.request import urlopen, Request
from urllib.parse import urlencode
import re

def get_transcript_with_api(video_id):
    """Fetch transcript using the youtube_transcript_api library."""
    try:
        # First try to get English transcript
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            transcript = transcript_list.find_transcript(['en'])
        except NoTranscriptFound:
            # If no English transcript, get the first available one
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available_transcripts = list(transcript_list)
            if not available_transcripts:
                raise Exception("No transcripts available")
            transcript = available_transcripts[0]
            
        # Get transcript data
        transcript_data = transcript.fetch()
        
        # Join the text parts
        transcript_text = ' '.join([item['text'] for item in transcript_data])
        
        return {
            'success': True,
            'transcript': transcript_text,
            'language': transcript.language,
            'language_code': transcript.language_code,
            'is_generated': transcript.is_generated,
            'video_id': video_id,
            'source': 'youtube_transcript_api'
        }
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        print(f"YouTube Transcript API specific error: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'video_id': video_id,
            'source': 'youtube_transcript_api'
        }
    except Exception as e:
        print(f"Error in get_transcript_with_api: {str(e)}")
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
        # First try to get video info to check if transcripts are available
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        request = Request(url, headers=headers)
        response = urlopen(request)
        html = response.read().decode('utf-8')
        
        # Basic check if captions are available (this is a simplified approach)
        if '"captionTracks":' not in html:
            return {
                'success': False,
                'error': 'No captions available for this video',
                'video_id': video_id,
                'source': 'manual_scraping'
            }
        
        # Extract caption track info
        caption_info = html.split('"captionTracks":')[1].split(',"translationLanguages')[0]
        
        # Find English or auto-generated English captions
        caption_tracks = json.loads('[' + caption_info + ']')
        
        target_lang = 'en'
        base_url = None
        is_generated = False
        language = 'English'
        language_code = 'en'
        
        # Find English captions or auto-generated captions
        for track in caption_tracks:
            current_lang = track.get('languageCode', '')
            if current_lang == target_lang:
                if not track.get('kind', '') == 'asr':  # Not auto-generated
                    base_url = track.get('baseUrl', '')
                    name = track.get('name', {}).get('simpleText', 'English')
                    language = name
                    language_code = current_lang
                    is_generated = False
                    break
                elif not base_url:  # Auto-generated is backup
                    base_url = track.get('baseUrl', '')
                    name = track.get('name', {}).get('simpleText', 'English (auto-generated)')
                    language = name
                    language_code = current_lang
                    is_generated = True
        
        # If no English captions found, use the first available caption
        if not base_url and caption_tracks:
            track = caption_tracks[0]
            base_url = track.get('baseUrl', '')
            name = track.get('name', {}).get('simpleText', 'Unknown Language')
            language = name
            language_code = track.get('languageCode', 'unknown')
            is_generated = track.get('kind', '') == 'asr'
        
        if not base_url:
            return {
                'success': False,
                'error': 'Could not find caption URL',
                'video_id': video_id,
                'source': 'manual_scraping'
            }
        
        # Get caption data in JSON format
        caption_url = base_url + '&fmt=json3'
        request = Request(caption_url, headers=headers)
        response = urlopen(request)
        caption_data = json.loads(response.read().decode('utf-8'))
        
        # Extract and combine all transcript pieces
        transcript_pieces = []
        if 'events' in caption_data:
            for event in caption_data['events']:
                if 'segs' in event:
                    for seg in event['segs']:
                        if 'utf8' in seg:
                            transcript_pieces.append(seg['utf8'])
        
        transcript = ' '.join(transcript_pieces).strip()
        
        return {
            'success': True,
            'transcript': transcript,
            'language': language,
            'language_code': language_code,
            'is_generated': is_generated,
            'video_id': video_id,
            'source': 'manual_scraping'
        }
    
    except Exception as e:
        print(f"Error in fetch_transcript_manually: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id,
            'source': 'manual_scraping'
        }

def get_transcript(video_id):
    """Main function that tries multiple methods to get a transcript."""
    
    # First try the YouTube Transcript API if available
    if try_ytapi:
        print(f"Trying to fetch transcript with YouTube Transcript API for video {video_id}")
        result = get_transcript_with_api(video_id)
        if result['success']:
            print(f"Successfully fetched transcript with YouTube Transcript API for video {video_id}")
            return result
        print(f"YouTube Transcript API failed: {result.get('error')}")

    # Fallback to manual method if YouTube Transcript API fails or is not available
    print(f"Trying to fetch transcript manually for video {video_id}")
    result = fetch_transcript_manually(video_id)
    if result['success']:
        print(f"Successfully fetched transcript manually for video {video_id}")
    else:
        print(f"Manual transcript fetching failed: {result.get('error')}")
    
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
    print(json.dumps(result)) 