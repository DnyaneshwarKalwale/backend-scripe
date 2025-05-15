/**
 * Script to download the yt-dlp binary based on the current platform
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Map of platforms to download URLs
const YT_DLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
  linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
};

// Get download URL for current platform
const platform = process.platform;
const downloadUrl = YT_DLP_URLS[platform] || YT_DLP_URLS.linux;

// Set file paths
const binDir = path.join(__dirname, '..', 'bin');
const fileName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const outputPath = path.join(binDir, fileName);

console.log(`Installing yt-dlp for platform: ${platform}`);
console.log(`Download URL: ${downloadUrl}`);
console.log(`Output path: ${outputPath}`);

// Ensure bin directory exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
  console.log(`Created directory: ${binDir}`);
}

// Function to download with redirect support
function downloadWithRedirects(url, outputPath, maxRedirects = 5) {
  if (maxRedirects <= 0) {
    throw new Error('Too many redirects');
  }
  
  return new Promise((resolve, reject) => {
    console.log(`Attempting to download from: ${url}`);
    const file = fs.createWriteStream(outputPath);
    
    const request = https.get(url, (response) => {
      // Handle redirects (status codes 301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Redirected to: ${response.headers.location}`);
        file.close();
        fs.unlinkSync(outputPath); // Clean up the file
        // Follow the redirect
        return downloadWithRedirects(response.headers.location, outputPath, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        fs.unlinkSync(outputPath); // Clean up the file
        return reject(new Error(`Failed to download yt-dlp: HTTP ${response.statusCode}`));
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => resolve());
        console.log('Download complete.');
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up the file
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up the file
      reject(err);
    });
  });
}

// Main function to download and set up yt-dlp
async function setupYtDlp() {
  try {
    console.log('Downloading yt-dlp...');
    await downloadWithRedirects(downloadUrl, outputPath);
    
    // Make executable on Unix platforms
    if (platform !== 'win32') {
      try {
        fs.chmodSync(outputPath, '755');
        console.log('Made executable.');
      } catch (err) {
        console.error('Failed to make executable:', err);
      }
    }
    
    // Verify installation
    try {
      const version = platform === 'win32'
        ? execSync(`"${outputPath}" --version`, { encoding: 'utf8' })
        : execSync(`${outputPath} --version`, { encoding: 'utf8' });
      console.log(`Successfully installed yt-dlp ${version.trim()}`);
    } catch (err) {
      console.error('Failed to verify installation:', err);
    }
  } catch (error) {
    console.error('Download failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupYtDlp(); 