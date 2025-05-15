const express = require('express');
const router = express.Router();
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
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

// Helper function to get the correct Python executable path
async function getPythonExecutablePath() {
  if (process.platform !== 'win32') {
    // For Linux/Mac
    return process.env.NODE_ENV === 'production' ? 'python3' : 'python';
  }
  
  // For Windows, use the specific path that works with pip3
  const specificPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
  
  try {
    await execPromise(`"${specificPath}" --version`);
    console.log(`Using specific Python path: ${specificPath}`);
    return specificPath;
  } catch (err) {
    console.log(`Error with specific Python path: ${err.message}`);
    
    // Fallback to alternative paths if specific path fails
    const possiblePaths = [
      'python3',
      'python',
      'py'
    ];
    
    for (const path of possiblePaths) {
      try {
        await execPromise(`${path} --version`);
        console.log(`Found working Python at: ${path}`);
        return path;
      } catch (err) {
        // Continue to next path
      }
    }
  }
  
  // Default fallback - this should be caught by the caller
  console.log('No Python executable found, this will likely fail');
  return 'python3';
}

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
    const { videoId } = req.body;
    
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
        is_cached: true,
        source: cachedTranscript.source || 'cache'
      });
    }
    
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Call the Python script directly which now uses youtube-transcript-api first
    const scriptPath = path.join(__dirname, '../transcript_fetcher.py');
    
    // Determine the Python executable to use
    const pythonExecutable = await getPythonExecutablePath();
    
    try {
      console.log(`Running Python script with ${pythonExecutable} for video ID: ${videoId}`);
      const { stdout, stderr } = await execPromise(`"${pythonExecutable}" "${scriptPath}" ${videoId}`);
      
      if (stderr) {
        console.error('Python script stderr:', stderr);
      }
      
      const result = JSON.parse(stdout);
      
      if (result.success) {
        console.log(`Successfully fetched transcript with Python script (${result.source || 'unknown'}) for video ${videoId}`);
        
        // Store in cache
        transcriptCache.set(videoId, {
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated || true,
          source: result.source || 'python_script'
        });
        
        return res.status(200).json({
          success: true,
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated || true,
          source: result.source || 'python_script'
        });
      } else {
        console.log('Python script returned error, trying backup method:', result.error);
        fetchBackupTranscript(videoId, res);
        return;
      }
    } catch (pythonError) {
      console.error('Error with Python script method:', pythonError);
      // Fall back to backup method
      fetchBackupTranscript(videoId, res);
      return;
    }
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
    
    // First try using the Python script directly (which now uses youtube-transcript-api)
    try {
      console.log('Trying Python script with youtube-transcript-api for:', videoId);
      const scriptPath = path.join(__dirname, '../transcript_fetcher.py');
      const pythonExecutable = await getPythonExecutablePath();
      
      console.log(`Using Python executable: ${pythonExecutable}`);
      const { stdout, stderr } = await execPromise(`"${pythonExecutable}" "${scriptPath}" ${videoId}`);
      
      if (stderr) {
        console.error('Python script error:', stderr);
      }
      
      const result = JSON.parse(stdout);
      
      if (result.success) {
        console.log(`Successfully fetched transcript with Python script (${result.source || 'unknown'}) for video ${videoId}`);
        
        // Store in cache
        transcriptCache.set(videoId, {
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated || true,
          source: result.source || 'python_script'
        });
        
        return res.status(200).json({
          success: true,
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated || true,
          source: result.source || 'python_script'
        });
      } else {
        console.log('Python script returned error, trying yt-dlp method');
        throw new Error(result.error || 'Failed to fetch transcript with Python script');
      }
    } catch (pythonError) {
      console.error('Error with Python script method:', pythonError);
      console.log('Falling back to yt-dlp method');
    }
    
    // If Python script fails, try yt-dlp method as last resort
    // Determine server URL - could be localhost for dev or the deployed URL for production
    let baseUrl;
    
    if (process.env.NODE_ENV === 'production') {
      // For production, use the public URL or a relative path
      baseUrl = process.env.BASE_URL || 'https://backend-scripe.onrender.com';
    } else {
      // For local development
      baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    }
    
    console.log(`Using API base URL: ${baseUrl} for transcript-yt-dlp endpoint`);
    const ytdlpUrl = `${baseUrl}/api/youtube/transcript-yt-dlp`;
    
    const response = await axios.post(ytdlpUrl, { videoId });
    
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
      throw new Error('Failed to fetch transcript with yt-dlp');
    }
  } catch (error) {
    console.error('Error in backup transcript method:', error);
    
    // Return the actual error to the frontend
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        success: false, 
        message: 'YouTube rate limit exceeded. Please try again in a few minutes.',
        error: 'Rate limit (429) encountered when fetching transcript'
      });
    }
    
    // Return general error for other issues
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transcript with all available methods',
      error: error.toString()
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