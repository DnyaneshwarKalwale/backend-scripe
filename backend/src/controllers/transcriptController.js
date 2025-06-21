const { spawn } = require('child_process');
const path = require('path');
const asyncHandler = require('express-async-handler');
const axios = require('axios');

// Cache for storing transcripts to avoid repeated YouTube API calls
const transcriptCache = new Map();

// Helper to add delay to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @desc    Get transcript for a YouTube video
 * @route   POST /api/transcript
 * @access  Public
 */
const getTranscript = asyncHandler(async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    res.status(400);
    throw new Error('Video ID is required');
  }

  console.log(`Attempting to get transcript for video ID: ${videoId}`);

  // Check cache first
  if (transcriptCache.has(videoId)) {
    console.log(`Using cached transcript for video ID: ${videoId}`);
    return res.status(200).json(transcriptCache.get(videoId));
  }

  try {
    const pythonScript = path.join(__dirname, '..', 'transcript_fetcher.py');
    
    // Use platform-specific Python command
    const isWindows = process.platform === "win32";
    const pythonCommand = isWindows
      ? 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe' // Local Windows
      : 'python3'; // Render/Linux
    
    console.log(`Using Python command: ${pythonCommand} for platform: ${process.platform}`);
    console.log(`Python script path: ${pythonScript}`);
    
    // Execute the Python script and pass the videoId as an argument
    const pythonProcess = spawn(pythonCommand, [pythonScript, videoId]);
    
    let transcriptData = '';
    let errorData = '';

    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      transcriptData += data.toString();
    });

    // Collect any error output
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error(`Python stderr: ${data}`);
    });

    // When the process completes
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorData}`);
        
        // Check for rate limiting errors
        if (errorData.includes('429') || errorData.includes('Too Many Requests')) {
          return res.status(429).json({ 
            success: false, 
            error: 'YouTube API rate limit exceeded. Please try again later.',
            details: 'Too many requests to YouTube. This is a temporary issue.'
          });
        }
        
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to get transcript', 
          details: errorData 
        });
      }

      try {
        const result = JSON.parse(transcriptData);
        
        if (!result.success) {
          console.log(`Transcript not found for video ID ${videoId}: ${result.error}`);
          return res.status(404).json(result);
        }
        
        console.log(`Successfully retrieved transcript for video ID ${videoId}, length: ${result.transcript.length} chars`);
        
        // Cache the successful result
        transcriptCache.set(videoId, result);
        
        return res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing transcript data:', error);
        console.error('Raw data:', transcriptData);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to parse transcript data',
          details: error.message
        });
      }
    });
    
    // Handle process errors (e.g. if Python executable not found)
    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to start Python process',
        details: err.message
      });
    });
  } catch (error) {
    console.error('Error executing Python script:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while getting transcript',
      details: error.message
    });
  }
});

/**
 * @desc    Get transcript directly using YouTube API
 * @route   POST /api/transcript/direct
 * @access  Public
 * @note    This is a fallback for when the Python method fails
 */
const getTranscriptDirect = asyncHandler(async (req, res) => {
  const { videoId } = req.body;
  
  if (!videoId) {
    res.status(400);
    throw new Error('Video ID is required');
  }
  
  console.log(`Attempting to get direct transcript for video ID: ${videoId}`);
  
  // Check cache first
  if (transcriptCache.has(videoId)) {
    console.log(`Using cached transcript for video ID: ${videoId}`);
    return res.status(200).json(transcriptCache.get(videoId));
  }
  
  try {
    // Add small delay to avoid rate limiting
    await delay(500);
    
    // Try to fetch the caption track
    const captionUrl = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`;
    const response = await axios.get(captionUrl);
    let transcript = response.data;
    
    if (!transcript || transcript.trim() === '') {
      console.log(`No direct transcript available for video ID ${videoId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'No transcript available for this video' 
      });
    }
    
    // Simple XML parsing to extract text
    transcript = transcript
      .replace(/<text[^>]*>/g, '')
      .replace(/<\/text>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ');
    
    console.log(`Successfully retrieved direct transcript for video ID ${videoId}, length: ${transcript.length} chars`);
    
    const result = {
      success: true,
      transcript: transcript,
      language: 'English',
      language_code: 'en',
      is_generated: true
    };
    
    // Cache the successful result
    transcriptCache.set(videoId, result);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching direct transcript:', error);
    
    // Check for rate limiting
    if (error.response && error.response.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'YouTube API rate limit exceeded. Please try again later.',
        details: 'Too many requests to YouTube. This is a temporary issue.'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch direct transcript', 
      details: error.message 
    });
  }
});

module.exports = {
  getTranscript,
  getTranscriptDirect
}; 