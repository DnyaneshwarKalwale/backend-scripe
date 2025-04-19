const express = require('express');
const router = express.Router();
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @route   POST /api/youtube/channel
 * @desc    Fetch YouTube channel videos
 * @access  Public
 */
router.post('/channel', async (req, res) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({ success: false, message: 'Channel name or URL is required' });
    }

    // Extract channel handle/name from input
    let channelHandle = channelName;
    if (channelName.includes('youtube.com/')) {
      // Extract handle from URL
      const parts = channelName.split('/');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('@')) {
          channelHandle = parts[i];
          break;
        }
      }
    }
    
    if (!channelHandle.startsWith('@') && !channelName.includes('youtube.com/')) {
      channelHandle = '@' + channelHandle;
    }

    try {
      // First fetch the channel page to get channel ID
      const channelUrl = `https://www.youtube.com/${channelHandle}`;
      const response = await axios.get(channelUrl);
      
      // Extract channel ID
      const channelIdMatch = response.data.match(/"channelId":"([^"]+)"/);
      if (!channelIdMatch || !channelIdMatch[1]) {
        return res.status(404).json({ 
          success: false, 
          message: 'Channel not found or could not extract channel ID' 
        });
      }
      
      const channelId = channelIdMatch[1];
      
      // Now fetch videos using RSS feed (no API key needed)
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const rssResponse = await axios.get(rssUrl);
      
      // Parse the XML
      const parser = new xml2js.Parser({ explicitArray: false });
      const feed = await new Promise((resolve, reject) => {
        parser.parseString(rssResponse.data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      if (!feed || !feed.feed || !feed.feed.entry) {
        return res.status(200).json({
          success: true,
          data: []
        });
      }
      
      // Ensure entries is an array even if there's only one video
      const entries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
      
      // Extract video information
      const videos = entries.map(entry => {
        // Extract video ID from the yt:videoId field
        const videoId = entry['yt:videoId'];
        
        // Extract thumbnail URL
        const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // Extract view count if available
        let viewCount = 0;
        if (entry['media:group'] && entry['media:group']['media:community']) {
          viewCount = parseInt(entry['media:group']['media:community']['media:statistics'].$.views, 10) || 0;
        }
        
        return {
          id: videoId,
          title: entry.title,
          thumbnail: thumbnailUrl,
          url: `https://youtube.com/watch?v=${videoId}`,
          duration: "N/A", // Duration not available from RSS feed
          view_count: viewCount,
          upload_date: entry.published
        };
      });
      
      return res.status(200).json({
        success: true,
        data: videos
      });
    } catch (fetchError) {
      console.error('Error fetching channel data:', fetchError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch channel data',
        error: fetchError.message
      });
    }
  } catch (error) {
    console.error('Error fetching YouTube channel:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch channel',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/transcript
 * @desc    Fetch YouTube transcript using youtube-transcript-api
 * @access  Public
 */
router.post('/transcript', async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'YouTube video ID is required' 
      });
    }
    
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Path to the Python script (relative to the project root)
    const scriptPath = path.join(__dirname, '../../../transcript_fetcher.py');
    
    // Determine the Python executable to use
    // For render.com or similar hosts, just use 'python' or 'python3'
    // For local development, you might need to specify the full path
    const pythonExecutable = process.env.NODE_ENV === 'production' ? 'python3' : 'python';
    
    const pythonProcess = spawn(pythonExecutable, [scriptPath, videoId]);
    
    let transcriptData = '';
    let errorData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      transcriptData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error(`Python stderr: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0 || errorData) {
        console.error('Python script error:', errorData);
        // Try backup method if Python script fails
        fetchBackupTranscript(videoId, res);
        return;
      }
      
      try {
        const result = JSON.parse(transcriptData);
        
        if (result.success) {
          return res.status(200).json(result);
        } else {
          console.log('Python method returned error, trying backup method');
          fetchBackupTranscript(videoId, res);
        }
      } catch (parseError) {
        console.error('Error parsing transcript data:', parseError);
        fetchBackupTranscript(videoId, res);
      }
    });
    
    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      fetchBackupTranscript(videoId, res);
    });
    
  } catch (error) {
    console.error('Error in transcript endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch transcript',
      error: error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/carousels
 * @desc    Save YouTube videos as carousels
 * @access  Public
 */
router.post('/carousels', async (req, res) => {
  try {
    const { videos, userId } = req.body;
    
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one video is required' 
      });
    }
    
    // Create carousel requests from videos
    const carouselRequests = videos.map(video => {
      return {
        userId: userId || 'anonymous',
        title: video.title || 'YouTube Carousel',
        source: 'youtube',
        videoId: video.id,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnail,
        status: 'pending',
        requestDate: new Date(),
        slideCount: 5, // Default number of slides
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // In a real implementation, you would save these to a MongoDB collection
    // For now, just return success with the count
    return res.status(200).json({
      success: true,
      message: `Successfully created ${carouselRequests.length} carousel requests`,
      count: carouselRequests.length,
      data: carouselRequests
    });
  } catch (error) {
    console.error('Error creating carousel requests:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create carousel requests',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   GET /api/youtube/transcript?url=:youtubeUrl
 * @desc    Fetch YouTube transcript without API key
 * @access  Public
 */
router.get('/transcript', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'YouTube URL is required' });
    }
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ success: false, message: 'Invalid YouTube URL' });
    }
    
    // Fetch the transcript
    const transcriptData = await fetchYouTubeTranscript(videoId);
    
    return res.status(200).json({
      success: true,
      data: {
        videoId,
        transcript: transcriptData.transcript,
        language: transcriptData.language,
        isAutoGenerated: transcriptData.isAutoGenerated
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch transcript',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/analyze
 * @desc    Analyze transcript for LinkedIn content
 * @access  Public
 */
router.post('/analyze', async (req, res) => {
  try {
    const { transcript, preferences } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }
    
    // Use OpenAI to analyze the transcript and generate LinkedIn content
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { 
          role: "system", 
          content: "You are a LinkedIn content expert. Your task is to analyze a YouTube transcript and create professional LinkedIn content according to user preferences." 
        },
        { 
          role: "user", 
          content: `Generate LinkedIn content from this transcript. Format: ${preferences?.format || 'post'}. Tone: ${preferences?.tone || 'professional'}. 
          Include hashtags. Keep it focused on professional insights from the transcript.
          
          Transcript:
          ${transcript}`
        }
      ],
      max_tokens: 1000,
    });
    
    return res.status(200).json({
      success: true,
      data: {
        content: completion.choices[0].message.content,
        model: completion.model,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens
      }
    });
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to analyze transcript',
      error: error.response?.data || error.toString()
    });
  }
});

// Helper function to extract YouTube video ID from URL
function extractVideoId(url) {
  try {
    let videoId = null;
    
    // Handle different URL formats
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
    } else if (url.includes('youtube.com/embed/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
    }
    
    return videoId;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

// Function to fetch YouTube transcript without API key (backup method)
async function fetchYouTubeTranscript(videoId) {
  try {
    // Fetch the video page to get timedtext URL
    const videoPageResponse = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
    const videoPageHtml = videoPageResponse.data;
    
    // Extract captions data - this is a simplified approach
    // In a real implementation, you would need more robust extraction methods
    const captionsRegex = /"captionTracks":\s*(\[.*?\])/;
    const captionsMatch = videoPageHtml.match(captionsRegex);
    
    if (!captionsMatch || !captionsMatch[1]) {
      throw new Error('Could not find captions data');
    }
    
    const captionsData = JSON.parse(captionsMatch[1].replace(/\\"/g, '"'));
    
    if (!captionsData || captionsData.length === 0) {
      throw new Error('No captions available for this video');
    }
    
    // Get the first available caption track (usually English)
    const captionTrack = captionsData[0];
    
    // Fetch the actual transcript data
    const transcriptResponse = await axios.get(captionTrack.baseUrl);
    const transcriptXml = transcriptResponse.data;
    
    // Parse XML to extract text
    const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"(?:\s+[^>]*)?>([^<]+)<\/text>/g;
    let match;
    let transcriptText = '';
    
    while ((match = textRegex.exec(transcriptXml)) !== null) {
      const text = match[3].replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/&quot;/g, '"')
                         .replace(/&#39;/g, "'");
      transcriptText += text + ' ';
    }
    
    return {
      transcript: transcriptText.trim(),
      language: captionTrack.languageCode,
      isAutoGenerated: captionTrack.kind === 'asr'
    };
  } catch (error) {
    console.error('Error in fetchYouTubeTranscript:', error);
    throw error;
  }
}

// Backup method for when Python method fails
async function fetchBackupTranscript(videoId, res) {
  try {
    console.log('Using backup transcript method for video ID:', videoId);
    const transcriptData = await fetchYouTubeTranscript(videoId);
    
    return res.status(200).json({
      success: true,
      transcript: transcriptData.transcript,
      language: 'Unknown',
      language_code: transcriptData.language || 'en',
      is_generated: true
    });
  } catch (error) {
    console.error('Error in backup transcript method:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transcript with all available methods',
      error: error.toString()
    });
  }
}

module.exports = router;