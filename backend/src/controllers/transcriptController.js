const { spawn } = require('child_process');
const path = require('path');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get transcript for a YouTube video
 * @route   POST /api/transcript
 * @access  Private
 */
const getTranscript = asyncHandler(async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    res.status(400);
    throw new Error('Video ID is required');
  }

  try {
    const pythonScript = path.join(__dirname, '..', 'transcript_fetcher.py');
    
    // Execute the Python script and pass the videoId as an argument
    const pythonProcess = spawn('python', [pythonScript, videoId]);
    
    let transcriptData = '';
    let errorData = '';

    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      transcriptData += data.toString();
    });

    // Collect any error output
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
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
          return res.status(404).json(result);
        }
        
        return res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing transcript data:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to parse transcript data',
          details: error.message
        });
      }
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