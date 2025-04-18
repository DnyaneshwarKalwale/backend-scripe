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
    
    // Try with Python script first (preferred method)
    try {
      const pythonResult = await getTranscriptWithPython(videoId);
      if (pythonResult.success) {
        console.log(`Successfully retrieved transcript using Python for video ID: ${videoId}`);
        return pythonResult;
      }
      console.log(`Python method failed, trying direct API for video ID: ${videoId}`);
    } catch (pythonError) {
      console.error(`Python transcript retrieval failed: ${pythonError.message}`);
    }
    
    // Fallback to direct API method
    const directResult = await getTranscriptDirect(videoId);
    
    return directResult;
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
  const scriptPath = path.join(__dirname, 'transcriptController.py');
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found at ${scriptPath}`);
  }

  // Try different Python commands in case of different environments
  const pythonCommands = ['python3', 'python', 'py', 'py -3'];
  
  return new Promise((resolve, reject) => {
    tryPythonCommands(pythonCommands, 0, scriptPath, videoId, resolve, reject);
  });
}

/**
 * Try different Python commands recursively
 */
function tryPythonCommands(commands, index, scriptPath, videoId, resolve, reject) {
  if (index >= commands.length) {
    reject(new Error('All Python commands failed. Make sure Python is installed with youtube-transcript-api package.'));
    return;
  }

  const command = commands[index];
  console.log(`Trying to execute transcript script with command: ${command}`);
  
  const pythonProcess = spawn(command, [scriptPath, videoId]);
  let dataString = '';
  let errorString = '';
  
  pythonProcess.stdout.on('data', (data) => {
    dataString += data.toString();
  });
  
  pythonProcess.stderr.on('data', (data) => {
    errorString += data.toString();
  });
  
  pythonProcess.on('close', (code) => {
    if (code !== 0 || errorString) {
      console.log(`Python process exited with code ${code}, trying next command.`);
      console.log(`Python error: ${errorString}`);
      // Try next command
      tryPythonCommands(commands, index + 1, scriptPath, videoId, resolve, reject);
      return;
    }
    
    try {
      const result = JSON.parse(dataString);
      resolve(result);
    } catch (error) {
      console.error(`Error parsing Python output: ${error.message}`);
      console.error(`Raw output: ${dataString}`);
      // Try next command
      tryPythonCommands(commands, index + 1, scriptPath, videoId, resolve, reject);
    }
  });
}

/**
 * Get transcript directly using API methods
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<object>} - Transcript data
 */
async function getTranscriptDirect(videoId) {
  try {
    console.log(`Attempting direct API transcript fetch for video ID: ${videoId}`);
    
    // Try fetching with different language options
    const languageOptions = ['en', 'en-US', 'en-GB', ''];
    let transcript = null;
    let error = null;
    
    for (const lang of languageOptions) {
      try {
        // Use the YouTube oEmbed API to get video details
        const videoResponse = await axios.get(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        
        // Fetch the video page to get transcript data
        const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}&hl=${lang}`);
        const html = response.data;
        
        // Extract caption data using regex
        const captionRegex = /"captionTracks":\[(.*?)\]/;
        const match = html.match(captionRegex);
        
        if (match && match[1]) {
          const captionData = JSON.parse(`[${match[1]}]`);
          if (captionData.length > 0) {
            const captionUrl = captionData[0].baseUrl;
            
            // Fetch transcript XML
            const transcriptResponse = await axios.get(captionUrl);
            const transcriptXml = transcriptResponse.data;
            
            // Parse XML to extract transcript text
            const textRegex = /<text[^>]*>(.*?)<\/text>/g;
            let textMatch;
            let transcriptText = '';
            
            while ((textMatch = textRegex.exec(transcriptXml)) !== null) {
              const text = textMatch[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
              
              transcriptText += text + ' ';
            }
            
            if (transcriptText.trim()) {
              transcript = {
                success: true,
                transcript: transcriptText.trim(),
                language: captionData[0].languageName || 'Unknown',
                language_code: captionData[0].languageCode || lang || 'unknown',
                is_generated: captionData[0].kind === 'asr',
                videoId: videoId,
                title: videoResponse.data.title || 'Unknown'
              };
              break;
            }
          }
        }
      } catch (e) {
        error = e;
        console.log(`Failed with language ${lang}: ${e.message}`);
      }
    }
    
    if (transcript) {
      return transcript;
    }
    
    return {
      success: false,
      error: 'No transcript found using direct API method',
      details: error ? error.message : 'Unknown error',
      videoId
    };
    
  } catch (error) {
    console.error(`Direct API transcript fetch failed: ${error.message}`);
    return {
      success: false,
      error: `Direct API method failed: ${error.message}`,
      videoId
    };
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