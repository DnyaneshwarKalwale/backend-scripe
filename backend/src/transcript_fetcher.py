from youtube_transcript_api import YouTubeTranscriptApi
import sys
import json

def get_transcript(video_id):
    try:
        # Get transcript list first to check availability
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to find an English transcript first, fallback to any available
        try:
            transcript = transcript_list.find_transcript(['en'])
        except:
            # Get the first available transcript
            transcript = transcript_list.find_transcript([])
            
        # Fetch the actual transcript data
        transcript_data = transcript.fetch()
        
        # Convert to string format
        transcript_text = ' '.join([item['text'] for item in transcript_data])
        
        result = {
            'success': True,
            'transcript': transcript_text,
            'language': transcript.language,
            'language_code': transcript.language_code,
            'is_generated': transcript.is_generated
        }
        
        return json.dumps(result)
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        return json.dumps(error_result)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
        print(get_transcript(video_id))
    else:
        print(json.dumps({'success': False, 'error': 'No video ID provided'})) 