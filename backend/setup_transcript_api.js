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
    let pythonExecutable;
    
    // Determine proper Python executable based on environment
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      // For production/Render environment always use python3
      pythonExecutable = 'python3';
      console.log('Production environment detected, using python3');
    } else if (process.platform === 'win32') {
      // For Windows development environment
      // Try specific path first, fall back to general commands
      try {
        const specificPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
        await execPromise(`"${specificPath}" --version`);
        pythonExecutable = specificPath;
        console.log(`Using specific Python path: ${pythonExecutable}`);
      } catch (err) {
        // Fallback to general commands
        pythonExecutable = 'python';
        console.log('Falling back to general python command');
      }
    } else {
      // For other development environments (Mac/Linux)
      pythonExecutable = 'python3';
    }
    
    // Check if the package is installed
    let checkCmd;
    if (process.platform === 'win32' && !process.env.RENDER && process.env.NODE_ENV !== 'production') {
      checkCmd = `"${pythonExecutable}" -c "import youtube_transcript_api; print('Package is installed')"`;
    } else {
      checkCmd = `${pythonExecutable} -c "import youtube_transcript_api; print('Package is installed')"`;
    }
    
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
    
    // Determine environment and appropriate installation command
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      // For Render.com or other production Linux environments
      try {
        console.log('Production environment detected, using pip3 install...');
        
        // First try using requirements.txt if it exists
        const reqPath = path.join(__dirname, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
          console.log('Found requirements.txt, installing from file...');
          const { stdout, stderr } = await execPromise('pip3 install -r requirements.txt');
          console.log('Requirements installation output:', stdout);
          if (stderr && !stderr.includes('WARNING')) {
            console.error('Requirements installation stderr:', stderr);
          }
        } else {
          // Direct installation if requirements.txt doesn't exist
          const { stdout, stderr } = await execPromise('pip3 install youtube-transcript-api==0.6.1');
          console.log('Direct installation output:', stdout);
          if (stderr && !stderr.includes('WARNING')) {
            console.error('Direct installation stderr:', stderr);
          }
        }
        
        // Double check the installation was successful
        try {
          await execPromise('python3 -c "import youtube_transcript_api; print(\'Verified installation\')"');
          console.log('Verified youtube-transcript-api is now installed');
          return true;
        } catch (verifyError) {
          console.error('Package installation verification failed:', verifyError);
          
          // Try with pip as a fallback
          try {
            console.log('Trying alternative pip install...');
            await execPromise('pip install youtube-transcript-api==0.6.1');
            console.log('Alternative pip install completed');
            return true;
          } catch (pipError) {
            console.error('All installation methods failed:', pipError);
            return false;
          }
        }
      } catch (installError) {
        console.error('Error installing package in production:', installError);
        return false;
      }
    } else if (process.platform === 'win32') {
      // For Windows development
      try {
        console.log('Trying with pip3...');
        const { stdout: pip3Stdout, stderr: pip3Stderr } = await execPromise('pip3 install youtube-transcript-api');
        console.log('pip3 installation output:', pip3Stdout);
        if (pip3Stderr && !pip3Stderr.includes('WARNING')) {
          console.error('pip3 installation stderr:', pip3Stderr);
        }
        return true;
      } catch (pip3Error) {
        console.error('Error installing with pip3:', pip3Error);
        
        // If pip3 fails, try with the specific Python path
        try {
          const pythonPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
          console.log(`Trying with specific Python path: ${pythonPath}`);
          const { stdout, stderr } = await execPromise(`"${pythonPath}" -m pip install youtube-transcript-api`);
          console.log('Installation output:', stdout);
          if (stderr && !stderr.includes('WARNING')) {
            console.error('Installation stderr:', stderr);
          }
          return true;
        } catch (pythonPathError) {
          console.error('Error installing with specific Python path:', pythonPathError);
          return false;
        }
      }
    } else {
      // For other development environments
      try {
        console.log('Using standard pip3 for non-Windows development environment');
        const { stdout, stderr } = await execPromise('pip3 install youtube-transcript-api');
        console.log('Installation output:', stdout);
        if (stderr && !stderr.includes('WARNING')) {
          console.error('Installation stderr:', stderr);
        }
        return true;
      } catch (error) {
        console.error('Error installing with pip3:', error);
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
    // Print environment info for debugging
    console.log('Environment:', {
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV,
      isRender: !!process.env.RENDER,
      pwd: process.cwd()
    });
    
    // Check if youtube-transcript-api is installed
    const isInstalled = await checkYoutubeTranscriptApi();
    
    // If not installed, try to install it
    if (!isInstalled) {
      const installSuccess = await installYoutubeTranscriptApi();
      
      if (installSuccess) {
        console.log('youtube-transcript-api package setup completed successfully');
      } else {
        console.warn('Could not install youtube-transcript-api package');
        console.log('Transcript extraction functionality will be limited');
      }
    }
    
    // Set execute permission on the Python script
    const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
    if (fs.existsSync(scriptPath)) {
      try {
        if (process.platform !== 'win32') {
          await execPromise(`chmod +x "${scriptPath}"`);
          console.log('Made transcript_fetcher.py executable');
          
          // Test the script works
          try {
            const { stdout } = await execPromise(`python3 "${scriptPath}" test`);
            const result = JSON.parse(stdout);
            if (result && !result.success && result.error.includes('Missing video ID')) {
              console.log('Transcript fetcher script is working correctly');
            }
          } catch (testError) {
            console.error('Error testing transcript_fetcher.py:', testError);
          }
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

// Run the setup if called directly
if (require.main === module) {
  setupTranscriptApi().then(() => {
    console.log('Transcript API setup process completed');
  }).catch(err => {
    console.error('Error setting up Transcript API:', err);
  });
}

module.exports = setupTranscriptApi; 