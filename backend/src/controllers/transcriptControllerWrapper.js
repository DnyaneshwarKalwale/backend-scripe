const { spawn } = require('child_process');
const path = require('path');

// Helper function to run Python script
const runPythonScript = (scriptName, args = [], inputData = null) => {
  return new Promise((resolve, reject) => {
    // Convert arguments to strings and remove undefined values
    const stringArgs = args.filter(arg => arg !== undefined).map(arg => String(arg));
    
    // Path to Python script
    const scriptPath = path.join(__dirname, '..', scriptName);
    
    // First try with 'py -3', then fall back to 'python3' if that fails
    const runWithCommand = (command, commandArgs = []) => {
      console.log(`Attempting to run script with ${command} ${commandArgs.join(' ')}: ${scriptPath}`);
      
      // Spawn Python process
      const pythonProcess = spawn(command, [...commandArgs, scriptPath, ...stringArgs]);
      
      let outputData = '';
      let errorData = '';

      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });

      // Collect error data from stderr
      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
        console.error(`Python stderr: ${data.toString()}`);
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python script exited with code ${code}`);
          console.error(`Error output: ${errorData}`);
          
          // If the command was 'py' and it failed, try with 'python3'
          if (command === 'py' && (code === 127 || errorData.includes('not found'))) {
            console.log('py command not found, trying python3...');
            runWithCommand('python3');
          } 
          // If python3 failed, try with python
          else if (command === 'python3' && (code === 127 || errorData.includes('not found'))) {
            console.log('python3 command not found, trying python...');
            runWithCommand('python');
          }
          else {
            reject(new Error(`Process exited with code ${code}: ${errorData}`));
          }
        } else {
          try {
            const result = JSON.parse(outputData);
            resolve(result);
          } catch (e) {
            console.error('Error parsing Python output:', e);
            console.error('Raw output:', outputData);
            reject(new Error(`Error parsing Python output: ${e.message}`));
          }
        }
      });

      // Handle errors
      pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process with ${command}:`, error);
        
        // If the command was 'py' and it failed, try with 'python3'
        if (command === 'py') {
          console.log('py command failed, trying python3...');
          runWithCommand('python3');
        } 
        // If python3 failed, try with python
        else if (command === 'python3') {
          console.log('python3 command failed, trying python...');
          runWithCommand('python');
        }
        else {
          reject(new Error(`Failed to start Python process: ${error.message}`));
        }
      });

      // Send input data if provided
      if (inputData) {
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();
      }
    };
    
    // Start with 'py -3'
    runWithCommand('py', ['-3']);
  });
};

// Wrap getTranscript function
exports.getTranscript = async (req, res) => {
  try {
    const inputData = req.body;
    console.log("Transcript request for URL:", inputData.videoUrl); // Add logging
    
    if (!inputData || !inputData.videoUrl) {
      return res.status(400).json({
        success: false,
        message: 'Video URL is required'
      });
    }
    
    const result = await runPythonScript('controllers/transcriptController.py', ['get_transcript'], inputData);
    return res.status(result.status || 200).json(result.data || result);
  } catch (error) {
    console.error('Error executing getTranscript:', error);
    // Send more detailed error information
    return res.status(500).json({
      success: false,
      message: `Error getting transcript: ${error.message}`,
      error: process.env.NODE_ENV === 'production' ? error.message : error.stack
    });
  }
};

// Wrap saveVideoTranscript function
exports.saveVideoTranscript = async (req, res) => {
  try {
    // Add user information from request
    const inputData = {
      ...req.body,
      user: req.user
    };
    
    const result = await runPythonScript('controllers/transcriptController.py', ['save_video_transcript'], inputData);
    return res.status(result.status || 200).json(result.data || result);
  } catch (error) {
    console.error('Error executing saveVideoTranscript:', error);
    return res.status(500).json({
      success: false,
      message: `Error saving transcript: ${error.message}`
    });
  }
}; 