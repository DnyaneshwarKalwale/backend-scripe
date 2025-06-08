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
    // For Windows, check the specific Python location first
    if (process.platform === 'win32') {
      const specificPaths = [
        'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
        'C:\\Python39\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
        'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
        'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
      ];
      
      for (const path of specificPaths) {
        try {
          await fs.promises.access(path);
          return path;
        } catch {
          // Path not found, continue to next one
        }
      }
      
      // If specific paths fail, try the general command
      return 'python';
    } else {
      // For Linux/Mac, use python3 in production, python in development
      return process.env.NODE_ENV === 'production' ? 'python3' : 'python';
    }
  } catch (error) {
    console.error('Error determining Python path:', error);
    return process.env.NODE_ENV === 'production' ? 'python3' : 'python';
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
      const { stdout, stderr } = await execPromise(`"${pythonExecutable}" "${scriptPath}" --debug ${videoId}`);
      
      if (stderr) {
        console.error('Python script stderr:', stderr);
      }
      
      // Parse JSON from stdout, handling debug output
      let result;
      try {
        // If using debug mode, the JSON will be on the last line
        const outputLines = stdout.trim().split('\n');
        const jsonLine = outputLines[outputLines.length - 1];
        result = JSON.parse(jsonLine);
      } catch (parseError) {
        // Fallback to parsing the entire stdout
        console.log('Failed to parse last line as JSON, trying full output:', parseError);
        result = JSON.parse(stdout);
      }
      
      if (result.success && result.transcript && result.transcript.trim().length > 0) {
        console.log(`Successfully fetched transcript with Python script (${result.source || 'unknown'}) for video ${videoId}, length: ${result.transcript.length}`);
        
        // Store in cache
        transcriptCache.set(videoId, {
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated ?? false,
          source: result.source || 'python_script'
        });
        
        return res.status(200).json({
          success: true,
          transcript: result.transcript,
          language: result.language || 'Unknown',
          language_code: result.language_code || 'en',
          is_generated: result.is_generated ?? false,
          source: result.source || 'python_script'
        });
      } else {
        console.log(`Python script returned error or empty transcript for video ${videoId}:`, result.error || 'Empty transcript');
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
          isAutoGenerated: cachedTranscript.is_generated ?? false,
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
        is_generated: transcriptData.is_generated ?? false
      });
    
    return res.status(200).json({
      success: true,
      data: {
        videoId,
        transcript: transcriptData.transcript,
          language: transcriptData.language || 'Unknown',
          isAutoGenerated: transcriptData.is_generated ?? false,
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

// Backup method for when Python method fails - now uses direct yt-dlp integration
async function fetchBackupTranscript(videoId, res) {
  try {
    console.log('Using backup yt-dlp method for video ID:', videoId);
    
    // Try the direct yt-dlp method
    const ytdlpResult = await extractTranscriptWithYtDlp(videoId);
    
    if (ytdlpResult.success && ytdlpResult.transcript && ytdlpResult.transcript.trim().length > 0) {
      console.log(`Successfully fetched transcript with yt-dlp for video ${videoId}, length: ${ytdlpResult.transcript.length}`);
        
        // Store in cache
        transcriptCache.set(videoId, {
        transcript: ytdlpResult.transcript,
        language: ytdlpResult.language || 'en',
        language_code: ytdlpResult.language_code || 'en',
        is_generated: ytdlpResult.is_generated ?? false,
        source: ytdlpResult.source || 'yt-dlp'
        });
        
        return res.status(200).json({
          success: true,
        transcript: ytdlpResult.transcript,
        language: ytdlpResult.language || 'en',
        language_code: ytdlpResult.language_code || 'en',
        is_generated: ytdlpResult.is_generated ?? false,
        source: ytdlpResult.source || 'yt-dlp'
        });
      } else {
      console.log(`yt-dlp method failed for video ${videoId}:`, ytdlpResult.error || 'Unknown error');
      throw new Error(ytdlpResult.error || 'Failed to fetch transcript with yt-dlp - empty or invalid result');
    }
  } catch (error) {
    console.error('Error in backup yt-dlp method:', error);
    
    // Return error to frontend - all methods have failed
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transcript with all available methods (YouTube Transcript API + yt-dlp)',
      error: error.toString(),
      methods_tried: ['youtube_transcript_api', 'yt-dlp']
    });
  }
}

// Direct yt-dlp function (extracted from server.js for efficiency)
async function extractTranscriptWithYtDlp(videoId) {
  try {
    console.log(`Extracting transcript for video ${videoId} using yt-dlp directly`);
    
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
    
    // Command for yt-dlp to extract subtitles with cookies authentication
    const cookiesPath = path.join(__dirname, '../cookies/www.youtube.com_cookies.txt');
    const command = `${ytDlpCommand} --write-auto-sub --sub-lang en --skip-download --write-subs --sub-format json3 --cookies "${cookiesPath}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --sleep-interval 1 --max-sleep-interval 3 --extractor-retries 3 "${videoUrl}"`;
    
    console.log(`Running yt-dlp command: ${command}`);
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error('yt-dlp stderr:', stderr);
    }
    
    // Look for the generated subtitle file
    const files = fs.readdirSync(process.cwd());
    const subtitleFile = files.find(file => file.includes(videoId) && (file.endsWith('.en.vtt') || file.endsWith('.en.json3')));
    
    if (!subtitleFile) {
      throw new Error('No subtitle file generated by yt-dlp');
    }
    
    // Read and parse the subtitle content
    const subtitleContent = fs.readFileSync(subtitleFile, 'utf8');
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
      fs.unlinkSync(subtitleFile);
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