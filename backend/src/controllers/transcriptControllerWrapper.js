const { spawn } = require('child_process');
const path = require('path');

// Helper function to run Python script
const runPythonScript = (scriptName, args = [], inputData = null) => {
  return new Promise((resolve, reject) => {
    // Convert arguments to strings and remove undefined values
    const stringArgs = args.filter(arg => arg !== undefined).map(arg => String(arg));
    
    // Path to Python script
    const scriptPath = path.join(__dirname, '..', scriptName);
    
    // Spawn Python process
    const pythonProcess = spawn('python', [scriptPath, ...stringArgs]);
    
    let outputData = '';
    let errorData = '';

    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    // Collect error data from stderr
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Error output: ${errorData}`);
        reject(new Error(`Process exited with code ${code}: ${errorData}`));
      } else {
        try {
          const result = JSON.parse(outputData);
          resolve(result);
        } catch (e) {
          reject(new Error(`Error parsing Python output: ${e.message}`));
        }
      }
    });

    // Handle errors
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    // Send input data if provided
    if (inputData) {
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();
    }
  });
};

// Wrap getTranscript function
exports.getTranscript = async (req, res) => {
  try {
    const inputData = req.body;
    const result = await runPythonScript('controllers/transcriptController.py', ['get_transcript'], inputData);
    return res.status(result.status || 200).json(result.data || result);
  } catch (error) {
    console.error('Error executing getTranscript:', error);
    return res.status(500).json({
      success: false,
      message: `Error getting transcript: ${error.message}`
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