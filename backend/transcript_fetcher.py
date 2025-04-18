#!/usr/bin/env python3
import sys
import json
import traceback

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Required libraries not installed. Please install with: pip install youtube-transcript-api"
    }))
    sys.exit(1)

def main():
    """Main function to handle command line arguments and fetch transcript."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID is required"
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    
    try:
        # Get available transcripts
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to get English transcript first
        try:
            transcript = transcript_list.find_transcript(['en'])
        except Exception:
            try:
                # If English not available, get auto-generated English transcript
                transcript = transcript_list.find_generated_transcript(['en'])
            except Exception:
                # If that also fails, get the first available transcript
                available_transcripts = list(transcript_list)
                if not available_transcripts:
                    raise Exception("No transcripts available for this video")
                transcript = available_transcripts[0]
        
        # Get transcript data
        transcript_data = transcript.fetch()
        
        # Format transcript to plain text
        full_text = ""
        for entry in transcript_data:
            full_text += entry['text'] + " "
        
        # Return result as JSON
        result = {
            "success": True,
            "transcript": full_text.strip(),
            "language": transcript.language,
            "language_code": transcript.language_code,
            "is_generated": transcript.is_generated,
            "videoId": video_id
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_details = traceback.format_exc()
        print(json.dumps({
            "success": False,
            "error": str(e),
            "details": error_details,
            "videoId": video_id
        }))
        sys.exit(1)

if __name__ == "__main__":
    main() 