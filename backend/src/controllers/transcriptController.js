const { spawn, execSync } = require('child_process');
const path = require('path');
const asyncHandler = require('express-async-handler');
const fs = require('fs');

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
    
    // Check if the transcript_fetcher.py file exists
    if (!fs.existsSync(pythonScript)) {
      console.error(`Python script not found at: ${pythonScript}`);
      return res.status(500).json({
        success: false,
        error: 'Transcript fetcher script not found',
        details: `File not found: ${pythonScript}`
      });
    } else {
      console.log(`Found Python script at: ${pythonScript}`);
      // Show the file content for debugging
      try {
        const scriptContent = fs.readFileSync(pythonScript, 'utf8');
        console.log('Script content:');
        console.log(scriptContent.substring(0, 300) + '...'); // Show first 300 chars
      } catch (err) {
        console.error('Error reading script file:', err);
      }
    }
    
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
      
      // Check if the error is about missing youtube_transcript_api
      if (data.toString().includes("No module named 'youtube_transcript_api'")) {
        try {
          console.log('Attempting to install youtube_transcript_api...');
          // Try to install the package
          const installOutput = execSync(`${pythonCommand} -m pip install youtube_transcript_api==1.0.3`, { encoding: 'utf8' });
          console.log('Installation output:', installOutput);
          
          // Try running the script again after installation
          console.log('Retrying transcript fetch after installing package...');
          const retryProcess = spawn(pythonCommand, [pythonScript, videoId]);
          
          let retryData = '';
          let retryError = '';
          
          retryProcess.stdout.on('data', (retryOut) => {
            retryData += retryOut.toString();
          });
          
          retryProcess.stderr.on('data', (retryErr) => {
            retryError += retryErr.toString();
            console.error('Retry stderr:', retryErr.toString());
          });
          
          retryProcess.on('close', (retryCode) => {
            if (retryCode !== 0) {
              console.error(`Retry Python process exited with code ${retryCode}`);
              console.error(`Retry error output: ${retryError}`);
              // Continue with original error handling
            } else {
              try {
                const retryResult = JSON.parse(retryData);
                if (!retryResult.success) {
                  return res.status(404).json(retryResult);
                }
                return res.status(200).json(retryResult);
              } catch (parseError) {
                console.error('Error parsing retry data:', parseError);
                // Continue with original error handling
              }
            }
          });
        } catch (installError) {
          console.error('Failed to install youtube_transcript_api:', installError);
          // Continue with original error handling
        }
      }
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