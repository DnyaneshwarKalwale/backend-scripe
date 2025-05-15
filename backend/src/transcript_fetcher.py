#!/usr/bin/env python3
# transcript_fetcher.py - Fetches transcripts from YouTube videos

import sys
import json
from urllib.request import urlopen, Request
from urllib.parse import urlencode
import re
import traceback

def fetch_transcript(video_id):
    """Fetch transcript for a YouTube video using basic HTTP requests."""
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
                'video_id': video_id
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
                'video_id': video_id
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
            'video_id': video_id
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'video_id': video_id
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Missing video ID. Usage: transcript_fetcher.py VIDEO_ID'
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    result = fetch_transcript(video_id)
    print(json.dumps(result)) 