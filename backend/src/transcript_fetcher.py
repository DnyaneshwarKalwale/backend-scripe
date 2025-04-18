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
            try:
                # Get the first available transcript
                available_transcripts = list(transcript_list)
                if available_transcripts:
                    transcript = available_transcripts[0]
                else:
                    raise Exception("No transcripts available for this video")
            except:
                raise Exception("Failed to find any transcript for this video")
            
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

# Alternative method that uses direct fetch, which might be more reliable in some cases
def get_transcript_direct(video_id):
    try:
        transcript_data = YouTubeTranscriptApi.get_transcript(video_id)
        transcript_text = ' '.join([item['text'] for item in transcript_data])
        
        result = {
            'success': True,
            'transcript': transcript_text,
            'language': 'auto-detected',
            'is_generated': True
        }
        
        return json.dumps(result)
    except Exception as e:
        # Try again with the list_transcripts approach
        try:
            return get_transcript(video_id)
        except:
            error_result = {
                'success': False,
                'error': str(e)
            }
            return json.dumps(error_result)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
        try:
            # Try the direct method first
            print(get_transcript_direct(video_id))
        except:
            # Fall back to the list approach
            print(get_transcript(video_id))
    else:
        print(json.dumps({'success': False, 'error': 'No video ID provided'})) 