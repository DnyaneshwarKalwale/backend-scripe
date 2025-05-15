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
    const pythonExecutable = process.env.NODE_ENV === 'production' ? 'python3' : 'python';
    const checkCmd = `${pythonExecutable} -c "import youtube_transcript_api; print('Package is installed')"`;
    
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
    const pythonExecutable = process.env.NODE_ENV === 'production' ? 'python3' : 'python';
    
    // Try to install the package using pip
    try {
      const { stdout, stderr } = await execPromise(`${pythonExecutable} -m pip install youtube-transcript-api`);
      console.log('Installation output:', stdout);
      if (stderr) {
        console.error('Installation stderr:', stderr);
      }
      
      // Verify the installation
      const { stdout: verifyOut } = await execPromise(`${pythonExecutable} -c "import youtube_transcript_api; print('Success')"`)
      if (verifyOut.includes('Success')) {
        console.log('youtube-transcript-api was successfully installed');
        return true;
      } else {
        console.error('Installation verification failed');
        return false;
      }
    } catch (pipError) {
      console.error('Error installing with pip:', pipError);
      
      // If pip fails, try pip3
      try {
        console.log('Trying with pip3...');
        const { stdout: pip3Stdout, stderr: pip3Stderr } = await execPromise(`pip3 install youtube-transcript-api`);
        console.log('pip3 installation output:', pip3Stdout);
        if (pip3Stderr) {
          console.error('pip3 installation stderr:', pip3Stderr);
        }
        return true;
      } catch (pip3Error) {
        console.error('Error installing with pip3:', pip3Error);
        return false;
      }
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