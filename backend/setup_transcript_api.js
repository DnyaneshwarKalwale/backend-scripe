// Script to ensure the youtube-transcript-api package is installed
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const os = require('os');

// Function to check if the Python package is installed
async function checkYoutubeTranscriptApi() {
  try {
    console.log('Checking if youtube-transcript-api is installed...');
    
    // The Python command to check for the package
    let pythonExecutable;
    
    // Use the specific Python path that we know works with pip3 on this system
    if (process.platform === 'win32') {
      pythonExecutable = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
      console.log(`Using specific Python path: ${pythonExecutable}`);
    } else {
      // For non-Windows platforms
      pythonExecutable = process.env.NODE_ENV === 'production' ? 'python3' : 'python';
    }
    
    const checkCmd = `"${pythonExecutable}" -c "import youtube_transcript_api; print('Package is installed')"`;
    
    try {
      const { stdout } = await execAsync(checkCmd);
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
    
    // Use pip3 directly since we know it works in your environment
    try {
      console.log('Trying with pip3...');
      const { stdout: pip3Stdout, stderr: pip3Stderr } = await execAsync(`pip3 install youtube-transcript-api`);
      console.log('pip3 installation output:', pip3Stdout);
      if (pip3Stderr) {
        console.error('pip3 installation stderr:', pip3Stderr);
      }
      return true;
    } catch (pip3Error) {
      console.error('Error installing with pip3:', pip3Error);
      
      // If pip3 fails, try with the specific Python path
      try {
        const pythonPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
        console.log(`Trying with specific Python path: ${pythonPath}`);
        const { stdout, stderr } = await execAsync(`"${pythonPath}" -m pip install youtube-transcript-api`);
        console.log('Installation output:', stdout);
        if (stderr) {
          console.error('Installation stderr:', stderr);
        }
        return true;
      } catch (pythonPathError) {
        console.error('Error installing with specific Python path:', pythonPathError);
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
  console.log('Setting up youtube-transcript-api...');
  
  try {
    // Determine the platform
    const isWindows = os.platform() === 'win32';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Get Python command based on environment
    let pythonCommand;
    if (isWindows) {
      // Try to find Python in common Windows locations
      const possiblePaths = [
        'python',
        'py',
        'C:\\Python39\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
      ];
      
      for (const path of possiblePaths) {
        try {
          await execAsync(`${path} --version`);
          pythonCommand = path;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!pythonCommand) {
        throw new Error('Python not found in common Windows locations');
      }
    } else {
      // Linux/Unix systems
      if (isProduction) {
        // On production server, install Python3 and pip if not present
        try {
          console.log('Checking if Python3 is installed...');
          await execAsync('which python3');
        } catch (e) {
          console.log('Python3 not found, installing...');
          await execAsync('apt-get update && apt-get install -y python3 python3-pip');
        }
        pythonCommand = 'python3';
      } else {
        pythonCommand = 'python3';
      }
    }
    
    // Install required packages
    console.log('Installing required Python packages...');
    const pipInstallCmd = isWindows ? 
      `"${pythonCommand}" -m pip install --user youtube-transcript-api requests` :
      `${pythonCommand} -m pip install --user youtube-transcript-api requests`;
    
    try {
      const { stdout, stderr } = await execAsync(pipInstallCmd);
      console.log('Package installation output:', stdout);
      if (stderr) console.error('Package installation stderr:', stderr);
    } catch (error) {
      console.error('Error installing packages:', error);
      // Try without --user flag if the first attempt failed
      const retryCmd = isWindows ?
        `"${pythonCommand}" -m pip install youtube-transcript-api requests` :
        `${pythonCommand} -m pip install youtube-transcript-api requests`;
      
      try {
        const { stdout, stderr } = await execAsync(retryCmd);
        console.log('Package installation (retry) output:', stdout);
        if (stderr) console.error('Package installation (retry) stderr:', stderr);
      } catch (retryError) {
        throw new Error(`Failed to install packages: ${retryError.message}`);
      }
    }
    
    // Verify installation
    const verifyCmd = isWindows ?
      `"${pythonCommand}" -c "from youtube_transcript_api import YouTubeTranscriptApi; print('youtube-transcript-api installed successfully')"` :
      `${pythonCommand} -c "from youtube_transcript_api import YouTubeTranscriptApi; print('youtube-transcript-api installed successfully')"`;
    
    try {
      const { stdout } = await execAsync(verifyCmd);
      console.log('Verification output:', stdout);
    } catch (error) {
      throw new Error(`Failed to verify installation: ${error.message}`);
    }
    
    console.log('youtube-transcript-api setup completed successfully');
    return true;
  } catch (error) {
    console.error('Error setting up youtube-transcript-api:', error);
    throw error;
  }
}

// Run the setup
setupTranscriptApi().then(() => {
  console.log('Transcript API setup process completed');
}).catch(err => {
  console.error('Error setting up Transcript API:', err);
});

module.exports = setupTranscriptApi; 