#!/usr/bin/env python3
"""
Test script to verify the transcript fetcher with improved gzip handling
"""

import sys
import os

# Add the src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_transcript_fetcher():
    """Test the transcript fetcher with a known video"""
    
    print("🧪 Testing transcript fetcher with improved gzip handling...")
    print("=" * 60)
    
    # Import the transcript fetcher
    try:
        from transcript_fetcher import get_transcript
        print("✅ Successfully imported transcript_fetcher")
    except ImportError as e:
        print(f"❌ Failed to import transcript_fetcher: {e}")
        return False
    
    # Test with Rick Astley video
    video_id = "dQw4w9WgXcQ"
    print(f"🎵 Testing with video ID: {video_id}")
    print("📡 This should use Webshare proxy...")
    
    try:
        result = get_transcript(video_id)
        
        if result['success']:
            print(f"✅ SUCCESS! Fetched transcript via {result.get('source', 'unknown')}")
            print(f"📝 Transcript length: {len(result['transcript'])} characters")
            print(f"🌍 Language: {result.get('language', 'unknown')} ({result.get('language_code', 'unknown')})")
            print(f"🤖 Auto-generated: {result.get('is_generated', 'unknown')}")
            print(f"📺 Channel: {result.get('channelTitle', 'unknown')}")
            
            # Show first 200 characters of transcript
            transcript_preview = result['transcript'][:200] + "..." if len(result['transcript']) > 200 else result['transcript']
            print(f"📄 Preview: {transcript_preview}")
            
            return True
        else:
            print(f"❌ FAILED: {result.get('error', 'Unknown error')}")
            if 'traceback' in result:
                print(f"🔍 Traceback: {result['traceback']}")
            return False
            
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 YouTube Transcript Fetcher Test with Webshare Proxy")
    print("=" * 60)
    
    success = test_transcript_fetcher()
    
    print("=" * 60)
    if success:
        print("🎉 Test completed successfully! Webshare proxy integration is working.")
        print("💡 Your Digital Ocean server can now fetch YouTube transcripts without IP blocks.")
    else:
        print("💥 Test failed. Please check the error messages above.")
        print("🔧 You may need to install dependencies: pip3 install youtube-transcript-api")
    
    sys.exit(0 if success else 1) 