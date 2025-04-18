const { spawn } = require('child_process');
const path = require('path');
const asyncHandler = require('express-async-handler');
const axios = require('axios');

/**
 * Helper function to extract YouTube transcript directly using a fallback method
 */
async function getTranscriptFromPublicAPI(videoId) {
  try {
    // Use the correct backend URL
    const response = await axios.get(`https://backend-scripe.onrender.com/api/transcript/fallback?id=${videoId}`);
    
    if (response.data && response.data.transcript) {
      return {
        success: true,
        transcript: response.data.transcript,
        language: response.data.language || 'Unknown',
        is_generated: true
      };
    } else {
      // If that fails, try reading from dummy file
      try {
        const fs = require('fs');
        const path = require('path');
        const dummyPath = path.join(__dirname, '..', '..', 'dummy_transcript.json');
        
        if (fs.existsSync(dummyPath)) {
          const dummyData = JSON.parse(fs.readFileSync(dummyPath, 'utf8'));
          console.log('Using dummy transcript as last resort fallback');
          return dummyData;
        }
      } catch (dummyError) {
        console.error('Error reading dummy transcript:', dummyError);
      }
      
      throw new Error('Failed to get transcript from all fallback methods');
    }
  } catch (error) {
    console.error('Error fetching from fallback API:', error);
    throw error;
  }
}

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

  try {
    const pythonScript = path.join(__dirname, '..', 'transcript_fetcher.py');
    
    // Use platform-specific Python command
    const isWindows = process.platform === "win32";
    const pythonCommand = isWindows
      ? 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe' // Local Windows
      : 'python3'; // Render/Linux
    
    console.log(`Using Python command: ${pythonCommand} for platform: ${process.platform}`);
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Set a timeout for the Python process (15 seconds)
    const timeoutMs = 15000;
    let timedOut = false;
    let processCompleted = false;
    
    // Execute the Python script and pass the videoId as an argument
    const pythonProcess = spawn(pythonCommand, [pythonScript, videoId]);
    
    // Set up timeout
    const timeout = setTimeout(() => {
      if (!processCompleted) {
        timedOut = true;
        pythonProcess.kill();
        console.log(`Python process timed out after ${timeoutMs}ms`);
      }
    }, timeoutMs);
    
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
    pythonProcess.on('close', async (code) => {
      processCompleted = true;
      clearTimeout(timeout);
      
      if (timedOut) {
        try {
          console.log('Using public API fallback due to timeout');
          const result = await getTranscriptFromPublicAPI(videoId);
          return res.status(200).json(result);
        } catch (fallbackError) {
          return res.status(500).json({ 
            success: false, 
            error: 'Transcript fetch timed out and fallback failed', 
            details: fallbackError.message 
          });
        }
      }
      
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorData}`);
        
        // Try fallback if Python script fails
        try {
          console.log('Using public API fallback due to Python script failure');
          const result = await getTranscriptFromPublicAPI(videoId);
          return res.status(200).json(result);
        } catch (fallbackError) {
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to get transcript and fallback failed', 
            details: errorData || fallbackError.message 
          });
        }
      }

      try {
        const result = JSON.parse(transcriptData);
        
        if (!result.success) {
          console.log(`Transcript fetch failed: ${result.error}`);
          
          // Try fallback if Python script returns error
          try {
            console.log('Using public API fallback due to transcript not found');
            const fallbackResult = await getTranscriptFromPublicAPI(videoId);
            return res.status(200).json(fallbackResult);
          } catch (fallbackError) {
            return res.status(404).json(result);
          }
        }
        
        console.log(`Successfully fetched transcript for video ID: ${videoId} (${result.language})`);
        return res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing transcript data:', error);
        console.error('Raw transcript data:', transcriptData);
        
        // Try fallback if we can't parse the Python script output
        try {
          console.log('Using public API fallback due to parsing error');
          const result = await getTranscriptFromPublicAPI(videoId);
          return res.status(200).json(result);
        } catch (fallbackError) {
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to parse transcript data and fallback failed',
            details: error.message,
            raw: transcriptData.substring(0, 200) // Include first 200 chars of raw data for debugging
          });
        }
      }
    });
    
    // Handle process errors (e.g. if Python executable not found)
    pythonProcess.on('error', async (err) => {
      processCompleted = true;
      clearTimeout(timeout);
      console.error('Failed to start Python process:', err);
      
      // Try fallback if Python process fails to start
      try {
        console.log('Using public API fallback due to Python process error');
        const result = await getTranscriptFromPublicAPI(videoId);
        return res.status(200).json(result);
      } catch (fallbackError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to start Python process and fallback failed',
          details: err.message
        });
      }
    });
  } catch (error) {
    console.error('Error executing Python script:', error);
    
    // Final fallback attempt
    try {
      console.log('Using public API fallback after all other errors');
      const result = await getTranscriptFromPublicAPI(videoId);
      return res.status(200).json(result);
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false, 
        error: 'Server error while getting transcript and all fallbacks failed',
        details: error.message
      });
    }
  }
});

module.exports = {
  getTranscript,
}; 