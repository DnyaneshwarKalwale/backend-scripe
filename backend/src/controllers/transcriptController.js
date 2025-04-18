const { spawn } = require('child_process');
const path = require('path');
const asyncHandler = require('express-async-handler');

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
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to get transcript', 
          details: errorData 
        });
      }

      try {
        const result = JSON.parse(transcriptData);
        
        if (!result.success) {
          console.log(`Transcript fetch failed: ${result.error}`);
          return res.status(404).json(result);
        }
        
        console.log(`Successfully fetched transcript for video ID: ${videoId} (${result.language})`);
        return res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing transcript data:', error);
        console.error('Raw transcript data:', transcriptData);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to parse transcript data',
          details: error.message,
          raw: transcriptData.substring(0, 200) // Include first 200 chars of raw data for debugging
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

module.exports = {
  getTranscript,
}; 