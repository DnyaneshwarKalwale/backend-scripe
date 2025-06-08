// Script to ensure the youtube-transcript-api package is installed
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');

// Function to check if the Python package is installed
async function checkYoutubeTranscriptApi() {
  try {
    console.log('Checking if youtube-transcript-api is installed...');
    
    // The Python command to check for the package
    let pythonExecutable = process.platform === 'win32' 
      ? 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
      : 'python3';
    
    console.log(`Using Python executable: ${pythonExecutable}`);
    
    const checkCmd = `"${pythonExecutable}" -c "import youtube_transcript_api; print('Package is installed')"`;
    
    try {
      const { stdout } = await execPromise(checkCmd);
      if (stdout.includes('Package is installed')) {
        console.log('youtube-transcript-api is already installed');
        return true;
      }
    } catch (err) {
      console.log('youtube-transcript-api is not installed, will attempt to install it');
      return false;
    }
  } catch (error) {
    console.error('Error checking for youtube-transcript-api:', error);
    return false;
  }
}

// Function to install the youtube-transcript-api package
async function installYoutubeTranscriptApi() {
  try {
    console.log('Installing youtube-transcript-api...');
    
    // For Linux/Mac systems
    if (process.platform !== 'win32') {
      try {
        const venvPath = path.join(__dirname, 'venv');
        const venvPip = path.join(venvPath, 'bin', 'pip');
        
        // Create virtual environment if it doesn't exist
        if (!fs.existsSync(venvPath)) {
          console.log('Creating Python virtual environment...');
          await execPromise('python3 -m venv venv');
        }
        
        // Install package using the virtual environment's pip directly
        console.log('Installing package in virtual environment...');
        await execPromise(`"${venvPip}" install --no-cache-dir youtube-transcript-api`);
        return true;
      } catch (error) {
        console.error('Error installing in virtual environment:', error);
        return false;
      }
    }
    
    // For Windows systems
    try {
      const pythonPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
      console.log(`Trying with specific Python path: ${pythonPath}`);
      const { stdout, stderr } = await execPromise(`"${pythonPath}" -m pip install youtube-transcript-api`);
      console.log('Installation output:', stdout);
      if (stderr) {
        console.error('Installation stderr:', stderr);
      }
      return true;
    } catch (pythonPathError) {
      console.error('Error installing with specific Python path:', pythonPathError);
      return false;
    }
  } catch (error) {
    console.error('Error during installation:', error);
    return false;
  }
}

// Main function to setup everything
async function setupTranscriptApi() {
  try {
    // Check if youtube-transcript-api is installed
    const isInstalled = await checkYoutubeTranscriptApi();
    
    // If not installed, try to install it
    if (!isInstalled) {
      const installSuccess = await installYoutubeTranscriptApi();
      
      if (installSuccess) {
        console.log('youtube-transcript-api package setup completed successfully');
      } else {
        console.warn('Could not install youtube-transcript-api package');
        console.log('Transcript extraction will fall back to manual methods');
      }
    }
    
    // Set execute permission on the Python script
    const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
    if (fs.existsSync(scriptPath)) {
      try {
        if (process.platform !== 'win32') {
          await execPromise(`chmod +x "${scriptPath}"`);
          console.log('Made transcript_fetcher.py executable');
        }
      } catch (chmodError) {
        console.error('Error making transcript_fetcher.py executable:', chmodError);
      }
    } else {
      console.error('transcript_fetcher.py not found at path:', scriptPath);
    }
    
  } catch (error) {
    console.error('Error in setupTranscriptApi:', error);
  }
}

// Run the setup
setupTranscriptApi().then(() => {
  console.log('Transcript API setup process completed');
}).catch(err => {
  console.error('Error setting up Transcript API:', err);
});

module.exports = setupTranscriptApi; 