#!/usr/bin/env python3
import sys
import json
import traceback

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api.formatters import TextFormatter
    # Additional imports if needed
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Required libraries not installed. Please install with: pip install youtube-transcript-api"
    }))
    sys.exit(1)

# Import your models and DB connection
from models.postModel import Post
from middleware.authMiddleware import protect

# Helper function to extract video ID from YouTube URL
def extract_video_id(url):
    """Extract the video ID from a YouTube URL"""
    pattern = r'(?:v=|\/)([0-9A-Za-z_-]{11}).*'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def get_transcript(video_id):
    """Get transcript for a YouTube video."""
    try:
        # Get available transcripts
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to get English transcript first
        try:
            transcript = transcript_list.find_transcript(['en'])
        except:
            # If English not available, get the first available transcript
            transcript = transcript_list.find_generated_transcript(['en'])
            if not transcript:
                # Get any transcript (auto-generated if needed)
                transcript = list(transcript_list)[0]
        
        # Get transcript data
        transcript_data = transcript.fetch()
        
        # Format transcript as plain text
        formatter = TextFormatter()
        plain_text = formatter.format_transcript(transcript_data)
        
        # Get transcript info
        language = transcript.language
        language_code = transcript.language_code
        is_generated = transcript.is_generated
        
        return {
            "success": True,
            "transcript": plain_text,
            "language": language,
            "language_code": language_code,
            "is_generated": is_generated,
            "videoId": video_id
        }
        
    except Exception as e:
        error_details = traceback.format_exc()
        return {
            "success": False,
            "error": str(e),
            "details": error_details,
            "videoId": video_id
        }

def main():
    """Main function to handle command line arguments."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID is required"
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    result = get_transcript(video_id)
    print(json.dumps(result))

if __name__ == "__main__":
    main()

# Save video with transcript
def save_video_transcript():
    """Save a video transcript to the database"""
    try:
        data = request.get_json()
        video_url = data.get('videoUrl')
        video_id = data.get('videoId')
        title = data.get('title', f'YouTube Video: {video_id}')
        transcript = data.get('transcript')
        
        # Get user ID from auth middleware
        user_id = request.user.get('_id') if request.user else None
        
        if not all([video_url, video_id, transcript]):
            return jsonify({
                'success': False,
                'message': 'Video URL, ID, and transcript are required'
            }), 400
        
        # Check if we already have this video
        existing_video = Post.find_one({
            'platformPostId': video_id, 
            'platform': 'youtube',
            'userId': user_id
        })
        
        if existing_video:
            # Update existing video
            updated_post = Post.update_one(
                {'_id': existing_video['_id']},
                {
                    '$set': {
                        'content': transcript,
                        'title': title,
                        'updatedAt': datetime.now()
                    }
                }
            )
            
            return jsonify({
                'success': True,
                'message': 'Video transcript updated successfully',
                'post': {
                    '_id': str(existing_video['_id']),
                    'title': title,
                    'content': transcript,
                    'platformPostId': video_id
                }
            }), 200
        else:
            # Create new video entry
            new_post = {
                'title': title,
                'content': transcript,
                'status': 'draft',
                'platform': 'youtube',
                'platformPostId': video_id,
                'videoUrl': video_url,
                'userId': user_id,
                'createdAt': datetime.now(),
                'updatedAt': datetime.now()
            }
            
            result = Post.insert_one(new_post)
            new_post['_id'] = str(result.inserted_id)
            
            return jsonify({
                'success': True,
                'message': 'Video transcript saved successfully',
                'post': new_post
            }), 201
            
    except Exception as e:
        print(f"Error saving video transcript: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to save video transcript: {str(e)}'
        }), 500 