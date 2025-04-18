from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
import re
import json
from flask import jsonify, request
from datetime import datetime

# Import your models and DB connection
from models.postModel import Post
from middleware.authMiddleware import protect

# Helper function to extract video ID from YouTube URL
def extract_video_id(url):
    """Extract the video ID from a YouTube URL"""
    pattern = r'(?:v=|\/)([0-9A-Za-z_-]{11}).*'
    match = re.search(pattern, url)
    return match.group(1) if match else None

# Get transcript from YouTube video
def get_transcript():
    """Fetch transcript from a YouTube video URL"""
    try:
        data = request.get_json()
        video_url = data.get('videoUrl')
        
        if not video_url:
            return jsonify({
                'success': False,
                'message': 'Video URL is required'
            }), 400
        
        video_id = extract_video_id(video_url)
        
        if not video_id:
            return jsonify({
                'success': False,
                'message': 'Invalid YouTube URL'
            }), 400
        
        try:
            # Create YouTubeTranscriptApi instance
            ytt_api = YouTubeTranscriptApi()
            
            # Fetch transcript directly (new API method)
            fetched_transcript = ytt_api.fetch(video_id)
            
            # Format transcript to text
            formatter = TextFormatter()
            formatted_transcript = formatter.format_transcript(fetched_transcript)
            
            return jsonify({
                'success': True,
                'videoId': video_id,
                'transcript': formatted_transcript,
                'language': fetched_transcript.language,
                'isGenerated': fetched_transcript.is_generated
            }), 200
            
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"Error type: {error_type}, Message: {error_msg}")
            
            if "NoTranscriptFound" in error_type:
                return jsonify({
                    'success': False,
                    'message': 'No transcript available for this video'
                }), 404
            elif "TranscriptDisabled" in error_type:
                return jsonify({
                    'success': False,
                    'message': 'Transcripts are disabled for this video'
                }), 404
            elif "NoTranscriptAvailable" in error_type:
                return jsonify({
                    'success': False,
                    'message': 'No transcript available in the requested language'
                }), 404
            elif "RequestBlocked" in error_type or "IpBlocked" in error_type:
                return jsonify({
                    'success': False,
                    'message': 'YouTube is blocking our request. Try again later or contact support.'
                }), 429
            else:
                return jsonify({
                    'success': False,
                    'message': f'Error retrieving transcript: {error_msg}'
                }), 404
        
    except Exception as e:
        print(f"Error getting transcript: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to get transcript: {str(e)}'
        }), 500

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