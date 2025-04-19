const express = require('express');
const router = express.Router();
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');
const { getChannelVideos, createCarousels } = require('../controllers/youtubeController');

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
    const { videoId, useScraperApi = true } = req.body;
    
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
    
    console.log(`Fetching transcript for video ID: ${videoId}${useScraperApi ? ' (using ScraperAPI)' : ''}`);
    
    // If ScraperAPI is requested, use it directly (faster than going through Python)
    if (useScraperApi) {
      try {
        const transcriptData = await fetchYouTubeTranscript(videoId);
        
        // Store successful result in cache
        transcriptCache.set(videoId, {
          transcript: transcriptData.transcript,
          language: 'Unknown',
          language_code: transcriptData.language || 'en',
          is_generated: true
        });
        
        return res.status(200).json({
          success: true,
          transcript: transcriptData.transcript,
          language: 'Unknown',
          language_code: transcriptData.language || 'en',
          is_generated: true,
          via: 'scraperapi'
        });
      } catch (error) {
        // If ScraperAPI fails, fall back to Python script
        console.log('ScraperAPI method failed, falling back to Python script:', error.message);
      }
    }
    
    // Attempt Python method only if ScraperAPI was not selected or failed
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

// Function to fetch YouTube transcript without API key (backup method)
async function fetchYouTubeTranscript(videoId) {
  const maxRetries = 3;
  let retryCount = 0;
  let lastError = null;
  // ScraperAPI key
  const scraperApiKey = 'b61a1a984e9fc31b3249d792c5c22f87';

  // Helper function to delay execution
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  while (retryCount < maxRetries) {
    try {
      // If it's a retry, wait with exponential backoff (1s, 2s, 4s)
      if (retryCount > 0) {
        const delay = Math.pow(2, retryCount - 1) * 1000;
        console.log(`Retry ${retryCount}/${maxRetries} after ${delay}ms for video ID: ${videoId}`);
        await sleep(delay);
      }

      // Use ScraperAPI to bypass YouTube rate limits
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const scraperApiUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}&render=true`;
      
      console.log(`Using ScraperAPI to fetch video page for ID: ${videoId}`);
      
      // Fetch the video page through ScraperAPI
      const videoPageResponse = await axios.get(scraperApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      const videoPageHtml = videoPageResponse.data;
      
      // Extract captions data
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
      
      // Fetch the actual transcript data through ScraperAPI
      const captionUrl = captionTrack.baseUrl;
      const scraperApiCaptionUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(captionUrl)}`;
      
      const transcriptResponse = await axios.get(scraperApiCaptionUrl);
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
      
      console.log(`Successfully fetched transcript for video ID: ${videoId} using ScraperAPI`);
      
      return {
        transcript: transcriptText.trim(),
        language: captionTrack.languageCode,
        isAutoGenerated: captionTrack.kind === 'asr'
      };
    } catch (error) {
      // Store the error for potential reuse later
      lastError = error;
      console.error(`ScraperAPI request failed (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
      
      // Only retry on rate limit (429) errors or network errors
      if (error.response?.status === 429 || !error.response) {
        retryCount++;
        console.log(`Rate limit or network error on attempt ${retryCount}/${maxRetries}`);
      } else {
        // For other errors, don't retry
        break;
      }
    }
  }

  // If we get here, all retries failed
  console.error('Failed to fetch transcript after all retries:', lastError);
  throw lastError;
}

// Backup method for when Python method fails
async function fetchBackupTranscript(videoId, res) {
  try {
    console.log('Using backup transcript method for video ID:', videoId);
    const transcriptData = await fetchYouTubeTranscript(videoId);
    
    // Store successful result in cache
    transcriptCache.set(videoId, {
      transcript: transcriptData.transcript,
      language: 'Unknown',
      language_code: transcriptData.language || 'en',
      is_generated: true
    });
    
    return res.status(200).json({
      success: true,
      transcript: transcriptData.transcript,
      language: 'Unknown',
      language_code: transcriptData.language || 'en',
      is_generated: true
    });
  } catch (error) {
    console.error('Error in backup transcript method:', error);
    
    // Return the actual error to the frontend instead of using dummy data
    if (error.code === 'ERR_BAD_REQUEST' && error.response?.status === 429) {
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

module.exports = router;