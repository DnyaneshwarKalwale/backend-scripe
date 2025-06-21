#!/usr/bin/env python3
# Direct test for YouTube Transcript API

import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

# Video to test
video_id = 'dQw4w9WgXcQ'

try:
    print("=== YouTube Transcript API Test ===")
    print(f"Testing with video ID: {video_id}")
    print("\nGetting transcript list...")
    
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    
    print("\nAvailable transcripts:")
    for transcript in transcript_list:
        print(f" - {transcript.language} ({transcript.language_code}), {'auto-generated' if transcript.is_generated else 'manually created'}")
    
    print("\nGetting English transcript...")
    try:
        transcript = transcript_list.find_transcript(['en'])
        print(f"Found English transcript: {transcript.language_code}")
    except Exception as e:
        print(f"Error finding English transcript: {str(e)}")
        print("Trying to get first available transcript")
        transcript = list(transcript_list)[0]
    
    print(f"\nSelected transcript: {transcript.language} ({transcript.language_code})")
    
    print("\nFetching transcript data...")
    transcript_data = transcript.fetch()
    
    print(f"Fetched {len(transcript_data)} transcript segments")
    
    print("\nFirst 3 segments:")
    for i, segment in enumerate(transcript_data[:3]):
        print(f"  {i+1}. {segment}")
    
    # Join the text to create a complete transcript
    transcript_text = ""
    for segment in transcript_data:
        if isinstance(segment, dict) and 'text' in segment:
            transcript_text += segment['text'] + " "
        elif hasattr(segment, 'text'):
            transcript_text += str(segment.text) + " "
        else:
            transcript_text += str(segment) + " "
    
    print(f"\nComplete transcript length: {len(transcript_text)} characters")
    print(f"First 100 characters: {transcript_text[:100]}...")
    
    print("\nTest completed successfully!")
    
except Exception as e:
    print(f"\nERROR: {str(e)}")
    import traceback
    traceback.print_exc() 