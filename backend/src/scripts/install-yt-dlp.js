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

// Download the file
console.log('Downloading yt-dlp...');
const file = fs.createWriteStream(outputPath);

https.get(downloadUrl, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download yt-dlp: HTTP ${response.statusCode}`);
    process.exit(1);
  }

  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('Download complete.');

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
  });
}).on('error', (err) => {
  fs.unlink(outputPath, () => {});
  console.error('Download failed:', err);
  process.exit(1);
}); 