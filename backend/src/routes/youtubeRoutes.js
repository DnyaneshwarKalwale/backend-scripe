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
const os = require('os');

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
  try {
    // For production (server), always use the virtual environment
    if (process.env.NODE_ENV === 'production') {
      return path.join(process.cwd(), 'venv', 
        process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
    }
    
    // For local development, try both system Python and virtual environment
    if (process.platform === 'win32') {
      // Try system Python first
      try {
        const { stdout } = await execPromise('python -c "import youtube_transcript_api"');
        return 'python';  // System Python has the package
      } catch {
        // Fall back to virtual environment
        return path.join(process.cwd(), 'venv', 'Scripts\\python.exe');
      }
    } else {
      // For Linux/Mac, try python3 first
      try {
        const { stdout } = await execPromise('python3 -c "import youtube_transcript_api"');
        return 'python3';  // System Python has the package
      } catch {
        // Fall back to virtual environment
        return path.join(process.cwd(), 'venv', 'bin/python');
      }
    }
  } catch (error) {
    console.error('Error determining Python path:', error);
    // Default fallback
    return process.platform === 'win32' ? 'python' : 'python3';
  }
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
    
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Call the Python script which now uses YouTube Transcript API with proxy (primary method)
    const scriptPath = path.join(process.cwd(), 'src', 'transcript_fetcher.py');
    
    // Get the correct Python executable path
    const pythonExecutable = await getPythonExecutablePath();
    console.log(`Using Python executable: ${pythonExecutable}`);
    
    try {
      console.log(`Running Python script with ${pythonExecutable} for video ID: ${videoId}`);
      
      // Run the Python script from the project root to ensure all paths work correctly
      const command = `"${pythonExecutable}" "${scriptPath}" --debug ${videoId}`;
      console.log(`Executing command: ${command}`);
      
      const { stdout, stderr } = await execPromise(command);
      
      if (stderr) {
        console.error('Python script stderr:', stderr);
      }
      
      // Parse JSON from stdout, handling debug output
      let result;
      try {
        // If using debug mode, the JSON will be on the last line
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        result = JSON.parse(jsonLine);
      } catch (parseError) {
        console.error('Error parsing JSON from Python script:', parseError);
        console.error('Raw stdout:', stdout);
        throw new Error(`Invalid JSON response from Python script: ${parseError.message}`);
      }
      
      if (result.success) {
        console.log(`Successfully fetched transcript for video ${videoId} using ${result.source || 'YouTube Transcript API'}`);
        res.json({
          success: true,
          transcript: result.transcript,
          source: result.source || 'YouTube Transcript API',
          language: result.language || 'en',
          channelTitle: result.channelTitle || 'Unknown Channel',
          videoTitle: result.videoTitle || 'Unknown Title'
        });
      } else {
        console.log(`Failed to fetch transcript for video ${videoId}:`, result.error || 'Unknown error');
        // Fall back to backup method
        fetchBackupTranscript(videoId, res);
      }
    } catch (error) {
      console.error('Error running Python script:', error);
      // Fall back to backup method
      fetchBackupTranscript(videoId, res);
    }
  } catch (error) {
    console.error('Error in transcript route:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching transcript',
      error: error.message
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
 * @route   GET /api/youtube/transcript?videoId=:videoId
 * @desc    Fetch YouTube transcript without API key
 * @access  Public
 */
router.get('/transcript', async (req, res) => {
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video ID is required' 
      });
    }
    
    // Check cache first
    const cachedTranscript = transcriptCache.get(videoId);
    if (cachedTranscript) {
      console.log(`Found cached transcript for video ${videoId}`);
      return res.status(200).json({
        success: true,
        data: {
          videoId,
          transcript: cachedTranscript.transcript,
          language: cachedTranscript.language,
          isAutoGenerated: cachedTranscript.is_generated ?? false,
          via: 'cache'
        }
      });
    }
    
    // Try ScraperAPI first
    try {
      const scraperApiResult = await getTranscriptWithScraperApi(videoId);
      
      // Store in cache
      transcriptCache.set(videoId, {
        transcript: scraperApiResult.transcript,
        language: scraperApiResult.language,
        language_code: scraperApiResult.language_code,
        is_generated: scraperApiResult.is_generated ?? false
      });
      
      return res.status(200).json({
        success: true,
        data: {
          videoId,
          transcript: scraperApiResult.transcript,
          language: scraperApiResult.language,
          isAutoGenerated: scraperApiResult.is_generated ?? false,
          via: 'scraper_api'
        }
      });
    } catch (error) {
      // If ScraperAPI fails, try using Python script method
      console.log('ScraperAPI method failed, trying Python script method:', error.message);
      
      // Call the Python script which now uses YouTube Transcript API with proxy (primary method)
      const scriptPath = path.join(process.cwd(), 'src', 'transcript_fetcher.py');
      
      // Get the correct Python executable path
      const pythonExecutable = await getPythonExecutablePath();
      console.log(`Using Python executable: ${pythonExecutable}`);
      
      try {
        console.log(`Running Python script with ${pythonExecutable} for video ID: ${videoId}`);
        
        // Run the Python script from the project root to ensure all paths work correctly
        const command = `"${pythonExecutable}" "${scriptPath}" --debug ${videoId}`;
        console.log(`Executing command: ${command}`);
        
        const { stdout, stderr } = await execPromise(command);
        
        if (stderr) {
          console.error('Python script stderr:', stderr);
        }
        
        // Parse JSON from stdout, handling debug output
        let result;
        try {
          // If using debug mode, the JSON will be on the last line
          const lines = stdout.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          result = JSON.parse(jsonLine);
        } catch (parseError) {
          console.error('Error parsing JSON from Python script:', parseError);
          console.error('Raw stdout:', stdout);
          throw new Error(`Invalid JSON response from Python script: ${parseError.message}`);
        }
        
        if (result.success) {
          // Store in cache
          transcriptCache.set(videoId, {
            transcript: result.transcript,
            language: result.language,
            language_code: result.language_code,
            is_generated: result.is_generated ?? false
          });
          
          return res.status(200).json({
            success: true,
            data: {
              videoId,
              transcript: result.transcript,
              language: result.language,
              isAutoGenerated: result.is_generated ?? false,
              via: 'python'
            }
          });
        } else {
          throw new Error(result.error || 'Failed to fetch transcript with Python script');
        }
      } catch (pythonError) {
        console.error('Error with Python script method:', pythonError);
        // Fall back to yt-dlp method
        const ytdlpResult = await extractTranscriptWithYtDlp(videoId);
        
        if (ytdlpResult.success) {
          // Store in cache
          transcriptCache.set(videoId, {
            transcript: ytdlpResult.transcript,
            language: ytdlpResult.language,
            language_code: ytdlpResult.language_code,
            is_generated: ytdlpResult.is_generated ?? false
          });
          
          return res.status(200).json({
            success: true,
            data: {
              videoId,
              transcript: ytdlpResult.transcript,
              language: ytdlpResult.language,
              isAutoGenerated: ytdlpResult.is_generated ?? false,
              via: 'yt-dlp'
            }
          });
        } else {
          throw new Error('All transcript extraction methods failed');
        }
      }
    }
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transcript',
      error: error.message
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

// Backup method for when Python method fails - now uses direct yt-dlp integration
async function fetchBackupTranscript(videoId, res) {
  try {
    console.log(`Using backup yt-dlp method for video ID: ${videoId}`);
    const result = await extractTranscriptWithYtDlp(videoId);
    
    if (result.success) {
      console.log(`Successfully fetched transcript with yt-dlp for video ${videoId}, length: ${result.transcript.length}`);
      res.json({
          success: true,
        transcript: result.transcript,
        source: 'yt-dlp',
        language: result.language || 'en',
        channelTitle: result.channelTitle || 'Unknown Channel',
        videoTitle: result.videoTitle || 'Unknown Title'
        });
      } else {
      console.error(`Failed to fetch transcript with yt-dlp for video ${videoId}:`, result.error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transcript with backup method',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in backup transcript method:', error);
    res.status(500).json({
      success: false, 
      message: 'Error in backup transcript method',
      error: error.message
    });
  }
}

// Direct yt-dlp function (extracted from server.js for efficiency)
async function extractTranscriptWithYtDlp(videoId) {
  try {
    console.log(`Extracting transcript for video ${videoId} using yt-dlp directly`);
    
    // Import proxy configuration
    const { getYtDlpProxyOptions, logProxyStatus } = require('../config/proxy');
    
    // Log proxy status
    logProxyStatus();
    
    // Create directory for transcripts if it doesn't exist
    const transcriptsDir = path.join(process.cwd(), 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const outputFileName = path.join(transcriptsDir, `${videoId}.json`);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Check if we already have this transcript saved
    if (fs.existsSync(outputFileName)) {
      try {
        const savedTranscript = JSON.parse(fs.readFileSync(outputFileName, 'utf8'));
        if (savedTranscript && savedTranscript.transcript && savedTranscript.transcript.trim().length > 0) {
          console.log(`Found existing yt-dlp transcript for ${videoId}`);
          return {
            success: true,
            transcript: savedTranscript.transcript,
            language: savedTranscript.language || 'en',
            language_code: savedTranscript.language || 'en',
            is_generated: savedTranscript.is_generated || false,
            source: 'yt-dlp_cached'
          };
        }
      } catch (readError) {
        console.error('Error reading existing yt-dlp transcript:', readError);
      }
    }
    
    // Determine the correct yt-dlp binary based on platform
    let ytDlpCommand;
    const isWindows = os.platform() === 'win32';
    
    if (isWindows) {
      const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp.exe');
      ytDlpCommand = fs.existsSync(ytDlpPath) ? `"${ytDlpPath}"` : 'yt-dlp';
    } else {
      const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp');
      if (fs.existsSync(ytDlpPath)) {
        try {
          await execPromise(`chmod +x "${ytDlpPath}"`);
          ytDlpCommand = `"${ytDlpPath}"`;
        } catch (chmodError) {
          console.error('Error making yt-dlp executable:', chmodError);
          ytDlpCommand = 'yt-dlp';
        }
      } else {
        ytDlpCommand = 'yt-dlp';
      }
    }
    
    // Build proxy options for yt-dlp
    const proxyOptions = getYtDlpProxyOptions();
    
    // Command for yt-dlp to extract subtitles with correct paths
    const command = `${ytDlpCommand} --write-auto-sub --sub-lang en --skip-download --write-subs --sub-format json3 --cookies "${path.join(process.cwd(), 'src', 'cookies', 'www.youtube.com_cookies.txt')}" --paths "transcripts" ${proxyOptions} "${videoUrl}"`;
    
    console.log(`Running yt-dlp command: ${command}`);
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error('yt-dlp stderr:', stderr);
    }
    
    // Look for the generated subtitle file in the transcripts directory
    const files = fs.readdirSync(transcriptsDir);
    const subtitleFile = files.find(file => 
      file.includes(videoId) && 
      (file.endsWith('.en.vtt') || file.endsWith('.en.json3'))
    );
    
    if (!subtitleFile) {
      throw new Error('No subtitle file generated by yt-dlp');
    }
    
    const subtitlePath = path.join(transcriptsDir, subtitleFile);
    
    // Read and parse the subtitle content
    const subtitleContent = fs.readFileSync(subtitlePath, 'utf8');
    let transcriptText = '';
    let is_generated = false;
    
    if (subtitleFile.endsWith('.json3')) {
      // Parse JSON format
      const subtitleJson = JSON.parse(subtitleContent);
      transcriptText = subtitleJson.events
        .filter(event => event.segs && event.segs.length > 0)
        .map(event => event.segs.map(seg => seg.utf8).join(' '))
        .join(' ');
      is_generated = subtitleFile.includes('auto');
    } else if (subtitleFile.endsWith('.vtt')) {
      // Parse VTT format
      transcriptText = subtitleContent
        .split('\n')
        .filter(line => !line.includes('-->') && !line.match(/^\d+$/) && !line.match(/^\s*$/))
        .join(' ')
        .replace(/<[^>]*>/g, ''); // Remove HTML tags
      is_generated = subtitleFile.includes('auto');
    }
    
    // Clean up the extracted files
    try {
      fs.unlinkSync(subtitlePath);
    } catch (cleanupError) {
      console.error('Error cleaning up subtitle file:', cleanupError);
    }
    
    // Check if transcript is empty
    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error('yt-dlp extracted empty transcript');
    }
    
    // Save the transcript to our JSON file for future use
    const transcriptData = {
      transcript: transcriptText,
      language: 'en',
      is_generated: is_generated,
      extractedAt: new Date().toISOString()
    };
    
    try {
      fs.writeFileSync(outputFileName, JSON.stringify(transcriptData, null, 2));
    } catch (saveError) {
      console.error('Error saving yt-dlp transcript:', saveError);
    }
    
    console.log(`Successfully extracted transcript with yt-dlp for ${videoId}, length: ${transcriptText.length}`);
    
    return {
      success: true,
      transcript: transcriptText,
      language: 'en',
      language_code: 'en',
      is_generated: is_generated,
      source: 'yt-dlp'
    };
    
  } catch (error) {
    console.error('Error in yt-dlp transcript extraction:', error);
    return {
      success: false, 
      error: error.message || 'Failed to extract transcript with yt-dlp',
      source: 'yt-dlp'
    };
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