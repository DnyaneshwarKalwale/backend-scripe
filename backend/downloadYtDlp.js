// Script to download yt-dlp for the current platform
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');

const execPromise = util.promisify(exec);

async function downloadYtDlp() {
  const isWindows = os.platform() === 'win32';
  const targetDir = path.join(__dirname, 'src');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // Target file name depending on OS
  const targetFile = path.join(targetDir, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
  
  // Check if file already exists
  if (fs.existsSync(targetFile)) {
    console.log(`yt-dlp binary already exists at ${targetFile}`);
    
    // For Linux/Mac, ensure it's executable
    if (!isWindows) {
      try {
        await execPromise(`chmod +x "${targetFile}"`);
        console.log('Made existing yt-dlp executable');
      } catch (err) {
        console.error('Error making existing yt-dlp executable:', err);
      }
    }
    
    return;
  }
  
  try {
    console.log(`Downloading yt-dlp for ${isWindows ? 'Windows' : 'Linux/Mac'}...`);
    
    // Download URL based on platform
    const downloadUrl = isWindows 
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    
    // Download the file
    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });
    
    // Save to file
    const writer = fs.createWriteStream(targetFile);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        console.log(`Successfully downloaded yt-dlp to ${targetFile}`);
        
        // For Linux/Mac, make it executable
        if (!isWindows) {
          try {
            await execPromise(`chmod +x "${targetFile}"`);
            console.log('Made yt-dlp executable');
          } catch (err) {
            console.error('Error making yt-dlp executable:', err);
          }
        }
        
        resolve();
      });
      
      writer.on('error', (err) => {
        console.error('Error downloading yt-dlp:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error downloading yt-dlp:', error);
    
    // Try alternative method for Linux - using curl/wget
    if (!isWindows) {
      try {
        console.log('Trying alternative download using curl...');
        await execPromise(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${targetFile}"`);
        await execPromise(`chmod +x "${targetFile}"`);
        console.log('Successfully downloaded yt-dlp using curl');
      } catch (curlErr) {
        console.error('Error downloading with curl:', curlErr);
        try {
          console.log('Trying alternative download using wget...');
          await execPromise(`wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O "${targetFile}"`);
          await execPromise(`chmod +x "${targetFile}"`);
          console.log('Successfully downloaded yt-dlp using wget');
        } catch (wgetErr) {
          console.error('Error downloading with wget:', wgetErr);
          console.log('Could not download yt-dlp automatically. Please install manually.');
        }
      }
    }
  }
}

// Execute the download function
downloadYtDlp().catch(err => {
  console.error('Failed to setup yt-dlp:', err);
});

module.exports = downloadYtDlp; 