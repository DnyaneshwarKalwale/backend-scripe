const express = require('express');
const router = express.Router();
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');
const { getChannelVideos, createCarousels, saveYoutubeVideo, getUserSavedVideos, deleteSavedVideo, saveVideoTranscript, saveMultipleVideos } = require('../controllers/youtubeController');
const SavedVideo = require('../models/savedVideo');

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory cache for storing transcripts
const transcriptCache = {
  // Cache data structure: { videoId: { transcript, language, timestamp } }
  cache: {},
  
  // Get transcript from cache
  get(videoId) {
    const cacheItem = this.cache[videoId];
    if (!cacheItem) return null;
    
    // Check if cache is still valid (24 hours)
    const now = Date.now();
    const cacheAge = now - cacheItem.timestamp;
    const cacheLifespan = 24 * 60 * 60 * 1000; // 24 hours
    
    if (cacheAge > cacheLifespan) {
      // Cache expired
      delete this.cache[videoId];
      return null;
    }
    
    console.log(`Using cached transcript for video ID: ${videoId}`);
    return cacheItem;
  },
  
  // Store transcript in cache
  set(videoId, data) {
    this.cache[videoId] = {
      ...data,
      timestamp: Date.now()
    };
    console.log(`Cached transcript for video ID: ${videoId}`);
  }
};

/**
 * @route   POST /api/youtube/channel
 * @desc    Fetch YouTube channel videos
 * @access  Public
 */
router.post('/channel', getChannelVideos);

/**
 * @route   POST /api/youtube/transcript
 * @desc    Fetch YouTube transcript using youtube-transcript-api
 * @access  Public
 */
router.post('/transcript', async (req, res) => {
  try {
    const { videoId, useScraperApi = false } = req.body; // Force useScraperApi to false
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'YouTube video ID is required' 
      });
    }
    
    // Check if transcript is in cache
    const cachedTranscript = transcriptCache.get(videoId);
    if (cachedTranscript) {
      return res.status(200).json({
        success: true,
        transcript: cachedTranscript.transcript,
        language: cachedTranscript.language,
        language_code: cachedTranscript.language_code,
        is_generated: cachedTranscript.is_generated,
        is_cached: true
      });
    }
    
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Skip ScraperAPI method completely and go directly to Python method
    // Path to the Python script (relative to the project root)
    const scriptPath = path.join(__dirname, '../transcript_fetcher.py');
    
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
          // Store in cache
          transcriptCache.set(videoId, {
            transcript: result.transcript,
            language: result.language,
            language_code: result.language_code,
            is_generated: result.is_generated
          });
          
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
router.post('/carousels', createCarousels);

/**
 * @route   POST /api/youtube/save
 * @desc    Save a YouTube video for a user
 * @access  Private
 */
router.post('/save', saveYoutubeVideo);

/**
 * @route   POST /api/youtube/save-videos
 * @desc    Save multiple YouTube videos at once
 * @access  Public
 */
router.post('/save-videos', saveMultipleVideos);

/**
 * @route   POST /api/youtube/save-transcript
 * @desc    Save a transcript for a YouTube video
 * @access  Private
 */
router.post('/save-transcript', saveVideoTranscript);

/**
 * @route   POST /api/youtube/save-video-transcript
 * @desc    Save a video with its transcript all at once
 * @access  Public
 */
router.post('/save-video-transcript', saveVideoTranscript);

/**
 * @route   GET /api/youtube/saved/:userId
 * @desc    Get all saved YouTube videos for a user
 * @access  Private
 */
router.get('/saved/:userId', getUserSavedVideos);

/**
 * @route   DELETE /api/youtube/saved/:userId/:videoId
 * @desc    Delete a saved YouTube video
 * @access  Private
 */
router.delete('/saved/:userId/:videoId', deleteSavedVideo);

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
    
    // Check if transcript is in cache
    const cachedTranscript = transcriptCache.get(videoId);
    if (cachedTranscript) {
      return res.status(200).json({
        success: true,
        data: {
          videoId,
          transcript: cachedTranscript.transcript,
          language: cachedTranscript.language,
          isAutoGenerated: cachedTranscript.is_generated || false,
          is_cached: true
        }
      });
    }
    
    // Fetch the transcript using ScraperAPI
    try {
      console.log(`Fetching transcript for URL: ${url} with ScraperAPI`);
    const transcriptData = await fetchYouTubeTranscript(videoId);
      
      // Store in cache
      transcriptCache.set(videoId, {
        transcript: transcriptData.transcript,
        language: transcriptData.language || 'Unknown',
        language_code: transcriptData.language || 'en',
        is_generated: true
      });
    
    return res.status(200).json({
      success: true,
      data: {
        videoId,
        transcript: transcriptData.transcript,
          language: transcriptData.language || 'Unknown',
          isAutoGenerated: true,
          via: 'scraperapi'
        }
      });
    } catch (error) {
      // If ScraperAPI fails, try using Python script method via a manual POST request
      console.log('ScraperAPI method failed, trying Python script method:', error.message);
      
      // Path to the Python script
      const scriptPath = path.join(__dirname, '../transcript_fetcher.py');
      
      // Determine the Python executable to use
      const pythonExecutable = process.env.NODE_ENV === 'production' ? 'python3' : 'python';
      
      try {
        // Run Python script to get transcript
        const { stdout, stderr } = await new Promise((resolve, reject) => {
          exec(`${pythonExecutable} ${scriptPath} ${videoId}`, (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          });
        });
        
        if (stderr) {
          console.error('Python script error:', stderr);
        }
        
        const result = JSON.parse(stdout);
        
        if (result.success) {
          // Store in cache
          transcriptCache.set(videoId, {
            transcript: result.transcript,
            language: result.language,
            language_code: result.language_code,
            is_generated: result.is_generated
          });
          
          return res.status(200).json({
            success: true,
            data: {
              videoId,
              transcript: result.transcript,
              language: result.language,
              isAutoGenerated: result.is_generated,
              via: 'python'
            }
          });
        } else {
          throw new Error(result.error || 'Failed to fetch transcript with Python script');
        }
      } catch (pythonError) {
        console.error('Error with Python script method:', pythonError);
        // Return an error response
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch transcript with all available methods',
          error: pythonError.toString()
        });
      }
    }
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

// Backup method for when Python method fails
async function fetchBackupTranscript(videoId, res) {
  try {
    console.log('Using backup transcript method for video ID:', videoId);
    
    // Instead of using ScraperAPI method, try to use yt-dlp directly through the dedicated route
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const ytdlpUrl = `${baseUrl}/api/youtube/transcript-yt-dlp`;
    
    const response = await axios.post(ytdlpUrl, { 
      videoId,
      debug: true // Add debug flag to get more information
    }, {
      timeout: 30000 // Longer timeout for yt-dlp processing
    });
    
    if (response.data && response.data.success) {
      // Store successful result in cache
      transcriptCache.set(videoId, {
        transcript: response.data.transcript,
        language: 'Unknown',
        language_code: response.data.language || 'en',
        is_generated: response.data.is_generated || true
      });
      
      return res.status(200).json({
        success: true,
        transcript: response.data.transcript,
        language: 'Unknown',
        language_code: response.data.language || 'en',
        is_generated: response.data.is_generated || true
      });
    } else {
      throw new Error('Failed to fetch transcript with yt-dlp: ' + (response.data?.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in backup transcript method:', error);
    
    // Return the actual error to the frontend with more details
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        success: false, 
        message: 'YouTube rate limit exceeded. Please try again in a few minutes.',
        error: 'Rate limit (429) encountered when fetching transcript'
      });
    }
    
    // Return general error for other issues with more debug info
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transcript with all available methods',
      error: error.toString(),
      ytdlpError: error.response?.data?.error || 'No specific error information available',
      requestError: error.request ? true : false,
      responseStatus: error.response?.status || 'No response status',
      responseData: error.response?.data || 'No response data'
    });
  }
}

// Setup CORS handlers specifically for YouTube routes
router.use((req, res, next) => {
  // Get the origin
  const origin = req.headers.origin;
  
  // Dynamically set Access-Control-Allow-Origin
  if (origin) {
    // Allow Netlify origins explicitly
    if (origin.endsWith('netlify.app') || 
        origin === 'https://deluxe-cassata-51d628.netlify.app' ||
        origin.includes('localhost')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      // For other origins, still allow them but log
      console.log(`YouTube Routes: Origin ${origin} accessing API`);
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    // No origin header (direct API call)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Error handling middleware specific to YouTube routes
router.use((err, req, res, next) => {
  console.error('YouTube API error:', err);
  
  // Set CORS headers even when errors occur
  const origin = req.headers.origin;
  if (origin) {
    // For Netlify domains and localhost, use the specific origin
    if (origin.endsWith('netlify.app') || 
        origin === 'https://deluxe-cassata-51d628.netlify.app' || 
        origin.includes('localhost')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      console.log(`Error handler: Origin ${origin} accessing API`);
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle payload too large errors specifically
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request payload too large. Please reduce the size of your transcript.',
      error: err.message
    });
  }
  
  // Handle other errors
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: err.toString()
  });
});

module.exports = router;