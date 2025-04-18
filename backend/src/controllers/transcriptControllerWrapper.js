const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

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
      return {
        success: false,
        error: `Failed to get transcript: ${error.message}`,
        videoId
      };
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
  
  const pythonExe = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
  
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${pythonExe} ${scriptPath} ${videoId}`);
    
    const pythonProcess = spawn(pythonExe, [scriptPath, videoId]);
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
      console.error('Failed to start Python process:', error);
      reject(error);
    });
  });
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