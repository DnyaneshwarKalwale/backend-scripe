const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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',
});

// Path to yt-dlp executable
const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');

/**
 * @route   GET /api/youtube/channel?url=:channelUrl
 * @desc    Fetch YouTube channel videos using yt-dlp
 * @access  Private
 */
router.get('/channel', protect, async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'YouTube channel URL is required' });
    }

    // Construct yt-dlp command to get channel videos
    const command = `"${ytDlpPath}" --dump-json --flat-playlist "${url}" --playlist-items 1-30`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch channel videos',
          error: error.message
        });
      }

      try {
        const videos = stdout
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
          .filter(video => video.id); // Filter out invalid entries

        return res.status(200).json({
          success: true,
          data: videos
        });
      } catch (parseError) {
        console.error('Error parsing yt-dlp output:', parseError);
        return res.status(500).json({
          success: false,
          message: 'Error parsing channel data',
          error: parseError.message
        });
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube channel videos:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch channel videos',
      error: error.toString()
    });
  }
});

/**
 * @route   GET /api/youtube/transcript?url=:youtubeUrl
 * @desc    Fetch YouTube transcript using yt-dlp
 * @access  Private
 */
router.get('/transcript', protect, async (req, res) => {
  try {
    const { url } = req.query;
    
    console.log(`Transcript request received for URL: ${url}`);
    
    if (!url) {
      console.log('No URL provided in request');
      return res.status(400).json({ success: false, message: 'YouTube URL is required' });
    }
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      console.log('Failed to extract valid video ID from URL');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid YouTube URL or not a video URL. Please provide a direct video URL (e.g., https://www.youtube.com/watch?v=...)' 
      });
    }
    
    console.log(`Processing transcript for video ID: ${videoId}`);
    
    // Construct yt-dlp command to get transcript
    const command = `"${ytDlpPath}" --skip-download --write-auto-sub --sub-lang en --sub-format json3 --convert-subs srt "${url}" -o "temp_${videoId}"`;
    console.log(`Executing command: ${command}`);
    
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        if (stderr) {
          console.error(`yt-dlp stderr: ${stderr}`);
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch transcript',
          error: error.message
        });
      }

      try {
        if (stderr) {
          console.log(`yt-dlp stderr (may include warnings): ${stderr}`);
        }
        
        if (stdout) {
          console.log(`yt-dlp stdout: ${stdout.substring(0, 200)}${stdout.length > 200 ? '...' : ''}`);
        }
        
        // Read the generated subtitle file
        const subtitleFile = `temp_${videoId}.en.json3`;
        console.log(`Looking for subtitle file: ${subtitleFile}`);
        
        if (!fs.existsSync(subtitleFile)) {
          console.log(`Subtitle file not found: ${subtitleFile}`);
          
          // Try to find any subtitle files that might have been created
          const files = fs.readdirSync('.');
          const possibleSubtitleFiles = files.filter(file => file.includes(videoId) && file.includes('.en'));
          
          console.log(`Found these possible subtitle files: ${possibleSubtitleFiles.join(', ')}`);
          
          throw new Error('No subtitles available for this video');
        }

        console.log(`Found subtitle file: ${subtitleFile}`);
        const subtitleContent = fs.readFileSync(subtitleFile, 'utf8');
        console.log(`Subtitle file size: ${subtitleContent.length} bytes`);
        
        const subtitles = JSON.parse(subtitleContent);
        let transcript = '';
        
        if (subtitles.events && subtitles.events.length > 0) {
          console.log(`Found ${subtitles.events.length} subtitle events`);
          transcript = subtitles.events
            .filter(event => event.segs && event.segs.length > 0)
            .map(event => event.segs.map(seg => seg.utf8).join(' '))
            .join(' ');
        } else {
          console.log('No events found in subtitle file');
        }

        // Clean up the temporary file
        fs.unlinkSync(subtitleFile);
        console.log(`Deleted subtitle file: ${subtitleFile}`);
        
        // Check if we actually got a transcript
        if (!transcript || transcript.trim().length === 0) {
          console.log('Empty transcript after processing');
          return res.status(404).json({
            success: false,
            message: 'No transcript content available for this video'
          });
        }
        
        console.log(`Transcript extracted successfully (${transcript.length} characters)`);
        return res.status(200).json({
          success: true,
          data: {
            videoId,
            transcript: transcript.trim(),
            language: 'en',
            isAutoGenerated: true
          }
        });
      } catch (parseError) {
        console.error('Error parsing transcript:', parseError);
        return res.status(500).json({
          success: false,
          message: 'Error parsing transcript data',
          error: parseError.message
        });
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch transcript',
      error: error.toString()
    });
  }
});

/**
 * @route   GET /api/youtube/details?videoId=:videoId
 * @desc    Fetch YouTube video details using yt-dlp
 * @access  Private
 */
router.get('/details', protect, async (req, res) => {
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ success: false, message: 'YouTube video ID is required' });
    }
    
    // Construct yt-dlp command to get video details
    const command = `"${ytDlpPath}" --dump-json --skip-download "https://www.youtube.com/watch?v=${videoId}"`;
    
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch video details',
          error: error.message
        });
      }

      try {
        // Parse the JSON output
        const videoDetails = JSON.parse(stdout.trim());
        
        return res.status(200).json({
          success: true,
          data: {
            videoId: videoDetails.id,
            title: videoDetails.title,
            description: videoDetails.description,
            thumbnail: videoDetails.thumbnail,
            duration: videoDetails.duration,
            uploadDate: videoDetails.upload_date,
            viewCount: videoDetails.view_count,
            channel: {
              id: videoDetails.channel_id,
              name: videoDetails.channel,
              url: videoDetails.channel_url
            }
          }
        });
      } catch (parseError) {
        console.error('Error parsing video details:', parseError);
        return res.status(500).json({
          success: false,
          message: 'Error parsing video details',
          error: parseError.message
        });
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube video details:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch video details',
      error: error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/analyze
 * @desc    Analyze transcript for LinkedIn content
 * @access  Private
 */
router.post('/analyze', protect, async (req, res) => {
  try {
    const { transcript, preferences } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }
    
    // Use a simple algorithm to extract key points from transcript
    const sentences = transcript.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
    const keyPoints = [];
    
    // Extract key sentences (simplified approach)
    for (let i = 0; i < sentences.length; i += Math.ceil(sentences.length / 5)) {
      if (sentences[i] && sentences[i].length > 40) {
        keyPoints.push(sentences[i].trim());
      }
      
      if (keyPoints.length >= 5) break;
    }
    
    return res.status(200).json({
      success: true,
      data: {
        content: transcript.substring(0, 1000) + (transcript.length > 1000 ? '...' : ''),
        keyPoints,
        format: preferences?.format || 'post',
        tone: preferences?.tone || 'professional'
      }
    });
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to analyze transcript',
      error: error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/save
 * @desc    Save YouTube video to database
 * @access  Private
 */
router.post('/save', protect, async (req, res) => {
  try {
    const { videoData } = req.body;
    
    if (!videoData || !videoData.videoId) {
      return res.status(400).json({ success: false, message: 'Video data is required' });
    }
    
    // In a real implementation, you would save to a database
    // For now we'll just return success
    
    return res.status(200).json({
      success: true,
      message: 'Video saved successfully',
      data: {
        id: videoData.id || Date.now().toString(), // Just a mock ID
        videoId: videoData.videoId,
        savedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error saving YouTube video:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to save video',
      error: error.toString()
    });
  }
});

/**
 * @route   GET /api/youtube/search?query=:searchQuery
 * @desc    Search for YouTube videos by keyword
 * @access  Private
 */
router.get('/search', protect, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }
    
    // Construct yt-dlp command to search for videos
    const command = `"${ytDlpPath}" "ytsearch10:${query}" --dump-json --flat-playlist --skip-download`;
    
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to search videos',
          error: error.message
        });
      }

      try {
        // Parse the JSON output
        const searchResults = stdout
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
          .filter(video => video.id);
        
        // Extract relevant data for each video
        const videos = searchResults.map(video => ({
          videoId: video.id,
          title: video.title,
          thumbnail: video.thumbnail,
          channelName: video.channel,
          channelId: video.channel_id,
          duration: video.duration,
          viewCount: video.view_count || 0
        }));
        
        return res.status(200).json({
          success: true,
          data: videos
        });
      } catch (parseError) {
        console.error('Error parsing search results:', parseError);
        return res.status(500).json({
          success: false,
          message: 'Error parsing search results',
          error: parseError.message
        });
      }
    });
  } catch (error) {
    console.error('Error searching YouTube videos:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to search videos',
      error: error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/channel-videos
 * @desc    Fetch a YouTube channel's videos using yt-dlp
 * @access  Private
 */
router.post('/channel-videos', protect, async (req, res) => {
  try {
    const { channelName } = req.body;
    
    if (!channelName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Channel name is required' 
      });
    }

    // Support both full links and @handle formats
    const channelUrl = channelName.startsWith("http")
      ? channelName
      : `https://www.youtube.com/@${channelName}/videos`;

    const command = `"${ytDlpPath}" --dump-json --flat-playlist "${channelUrl}" --playlist-items 1-50`;

    console.log("Running yt-dlp command:", command);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch channel info',
          error: error.message
        });
      }

      try {
        if (!stdout || stdout.trim() === '') {
          console.log('Empty response from yt-dlp, might be no videos or channel not found');
          return res.status(404).json({
            success: false,
            message: 'No videos found or channel does not exist',
          });
        }
        
        // Split by lines and filter out empty lines
        const lines = stdout.trim().split("\n").filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'No videos found in channel',
          });
        }
        
        // Try to parse each line as JSON
        const videos = [];
        for (const line of lines) {
          try {
            const video = JSON.parse(line);
            videos.push({
              videoId: video.id,
              title: video.title,
              thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`,
              channelName: video.channel,
              channelId: video.channel_id,
              duration: video.duration,
              uploadDate: video.upload_date,
              url: `https://www.youtube.com/watch?v=${video.id}`
            });
          } catch (lineParseError) {
            console.warn(`Could not parse line as JSON: ${line.substring(0, 50)}...`);
            // Continue with other lines
          }
        }
        
        if (videos.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Could not parse any videos from channel',
          });
        }
        
        res.status(200).json({ 
          success: true,
          data: videos
        });
      } catch (parseError) {
        console.error("Error parsing yt-dlp output:", parseError);
        console.error("stdout sample:", stdout ? stdout.substring(0, 200) : 'Empty output');
        res.status(500).json({
          success: false,
          message: 'Error parsing channel data',
          error: parseError.message
        });
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: err.message 
    });
  }
});

// Helper function to extract YouTube video ID from URL
function extractVideoId(url) {
  try {
    console.log(`Attempting to extract video ID from URL: ${url}`);
    
    // Early validation to ensure it's a video URL
    if (!url) {
      console.log('URL is empty');
      return null;
    }
    
    // Check if this is a channel URL
    if ((url.includes('youtube.com/@') || url.includes('youtube.com/c/') || url.includes('youtube.com/channel/')) 
        && !url.includes('watch?v=')) {
      console.log('This appears to be a channel URL, not a video URL');
      return null;
    }
    
    let videoId = null;
    
    // Handle different URL formats
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
      console.log(`Extracted video ID from youtube.com/watch URL: ${videoId}`);
    } else if (url.includes('youtu.be/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
      console.log(`Extracted video ID from youtu.be URL: ${videoId}`);
    } else if (url.includes('youtube.com/embed/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
      console.log(`Extracted video ID from youtube.com/embed URL: ${videoId}`);
    } else if (url.includes('youtube.com/v/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
      console.log(`Extracted video ID from youtube.com/v URL: ${videoId}`);
    }
    
    // Validate the video ID format (typically 11 characters)
    if (!videoId || typeof videoId !== 'string' || videoId.length < 10) {
      console.log(`Invalid video ID format: ${videoId}`);
      return null;
    }
    
    return videoId;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

module.exports = router; 