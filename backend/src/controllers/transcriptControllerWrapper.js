const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

/**
 * Get YouTube transcript using multiple methods
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<object>} - Transcript data
 */
async function getYouTubeTranscript(videoUrl) {
  try {
    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return {
        success: false,
        error: 'Invalid YouTube URL. Could not extract video ID.'
      };
    }

    console.log(`Attempting to get transcript for video ID: ${videoId}`);
    
    // Try with Python script method
    try {
      const pythonResult = await getTranscriptWithPython(videoId);
      return pythonResult;
    } catch (error) {
      console.error(`Failed to get transcript: ${error.message}`);
      
      // Try with fallback method for cloud environments
      try {
        const fallbackResult = await getTranscriptFallback(videoId);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`Fallback method failed: ${fallbackError.message}`);
        return {
          success: false,
          error: `Failed to get transcript: ${error.message}`,
          videoId
        };
      }
    }
  } catch (error) {
    console.error(`Error getting YouTube transcript: ${error.message}`);
    return {
      success: false,
      error: `Failed to get transcript: ${error.message}`,
      videoId: extractVideoId(videoUrl) || 'unknown'
    };
  }
}

/**
 * Get transcript using Python script
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<object>} - Transcript data
 */
async function getTranscriptWithPython(videoId) {
  // Check for script in the root directory
  const scriptPath = path.join(__dirname, '..', '..', 'transcript_fetcher.py');
  
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found at ${scriptPath}`);
  }
  
  // Use different Python commands based on platform
  let pythonCommands;
  if (os.platform() === 'win32') {
    // Windows-specific paths
    pythonCommands = [
      'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      'python',
      'py',
      'python3'
    ];
  } else {
    // Linux/Mac commands (for Render)
    pythonCommands = [
      'python3',
      'python',
      '/usr/bin/python3',
      '/usr/bin/python'
    ];
  }

  // Try each Python command
  for (const cmd of pythonCommands) {
    try {
      const result = await runPythonProcess(cmd, scriptPath, videoId);
      return result;
    } catch (error) {
      console.error(`Failed with ${cmd}: ${error.message}`);
      // Continue to the next command
    }
  }
  
  throw new Error('All Python commands failed');
}

/**
 * Run Python process with specific command
 * @param {string} pythonCmd - Python command to use
 * @param {string} scriptPath - Path to Python script
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<object>} - Transcript data
 */
function runPythonProcess(pythonCmd, scriptPath, videoId) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${pythonCmd} ${scriptPath} ${videoId}`);
    
    const pythonProcess = spawn(pythonCmd, [scriptPath, videoId]);
    let outputData = '';
    let errorData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error(`Python stderr: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Error output: ${errorData}`);
        reject(new Error(`Python process exited with code ${code}: ${errorData}`));
        return;
      }
      
      try {
        const result = JSON.parse(outputData);
        resolve(result);
      } catch (error) {
        console.error('Error parsing Python output:', error);
        console.error('Raw output:', outputData);
        reject(new Error(`Error parsing Python output: ${error.message}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error(`Failed to start Python process with ${pythonCmd}:`, error);
      reject(error);
    });
  });
}

/**
 * Fallback method for cloud environments without Python
 * @param {string} videoId - YouTube video ID 
 * @returns {Promise<object>} - Transcript data
 */
async function getTranscriptFallback(videoId) {
  try {
    // This uses a direct API approach without requiring Python
    console.log(`Using fallback method for video ID: ${videoId}`);
    
    // Get video details first
    const videoInfoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const videoResponse = await axios.get(videoInfoUrl);
    const html = videoResponse.data;
    
    // Try to extract captions data
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = html.match(captionRegex);
    
    if (!match || !match[1]) {
      throw new Error('No captions found for this video');
    }
    
    // Parse caption data
    const captionData = JSON.parse(match[1].replace(/\\"/g, '"'));
    
    if (!captionData || captionData.length === 0) {
      throw new Error('No captions available for this video');
    }
    
    // Get the first available caption track (usually English)
    const captionTrack = captionData[0];
    
    // Fetch the actual transcript data
    const transcriptResponse = await axios.get(captionTrack.baseUrl);
    const transcriptXml = transcriptResponse.data;
    
    // Parse XML to extract text
    const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"(?:\s+[^>]*)?>([^<]+)<\/text>/g;
    let match2;
    let transcriptText = '';
    
    while ((match2 = textRegex.exec(transcriptXml)) !== null) {
      const text = match2[3]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      transcriptText += text + ' ';
    }
    
    if (!transcriptText.trim()) {
      throw new Error('Failed to extract text from transcript');
    }
    
    return {
      success: true,
      transcript: transcriptText.trim(),
      language: captionTrack.languageName || 'Unknown',
      language_code: captionTrack.languageCode || 'en',
      is_generated: captionTrack.kind === 'asr',
      videoId: videoId
    };
  } catch (error) {
    console.error('Fallback method failed:', error);
    throw error;
  }
}

/**
 * Extract YouTube video ID from URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if invalid
 */
function extractVideoId(url) {
  if (!url) return null;
  
  // Regular expression patterns for different YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    /^([^"&?\/\s]{11})$/i
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

module.exports = {
  getYouTubeTranscript,
  extractVideoId
}; 