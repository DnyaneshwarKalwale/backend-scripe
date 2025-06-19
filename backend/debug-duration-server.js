const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs');

const execPromise = promisify(exec);

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "N/A";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
};

async function testDurationExtraction() {
  console.log('=== Duration Extraction Debug Test ===');
  console.log('Platform:', os.platform());
  console.log('Current working directory:', process.cwd());
  
  // Test video ID
  const testVideoId = 'dQw4w9WgXcQ'; // Rick Roll - known video
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  
  console.log('Testing with video:', videoUrl);
  
  // 1. Check if yt-dlp binary exists
  const isWindows = os.platform() === 'win32';
  let ytDlpCommand;
  
  if (isWindows) {
    const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp.exe');
    console.log('Looking for yt-dlp.exe at:', ytDlpPath);
    console.log('yt-dlp.exe exists:', fs.existsSync(ytDlpPath));
    ytDlpCommand = fs.existsSync(ytDlpPath) ? `"${ytDlpPath}"` : 'yt-dlp';
  } else {
    const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp');
    console.log('Looking for yt-dlp at:', ytDlpPath);
    console.log('yt-dlp exists:', fs.existsSync(ytDlpPath));
    
    if (fs.existsSync(ytDlpPath)) {
      try {
        await execPromise(`chmod +x "${ytDlpPath}"`);
        ytDlpCommand = `"${ytDlpPath}"`;
        console.log('Made yt-dlp executable');
      } catch (chmodError) {
        console.error('Error making yt-dlp executable:', chmodError);
        ytDlpCommand = 'yt-dlp';
      }
    } else {
      ytDlpCommand = 'yt-dlp';
    }
  }
  
  console.log('Using yt-dlp command:', ytDlpCommand);
  
  // 2. Test yt-dlp version
  try {
    console.log('\n=== Testing yt-dlp version ===');
    const { stdout: versionOutput } = await execPromise(`${ytDlpCommand} --version`, { timeout: 5000 });
    console.log('yt-dlp version:', versionOutput.trim());
  } catch (error) {
    console.error('Error getting yt-dlp version:', error.message);
  }
  
  // 3. Test basic yt-dlp functionality
  try {
    console.log('\n=== Testing basic yt-dlp functionality ===');
    const command = `${ytDlpCommand} --dump-json --no-download "${videoUrl}"`;
    console.log('Running command:', command);
    
    const { stdout } = await execPromise(command, { timeout: 15000 });
    const metadata = JSON.parse(stdout);
    
    console.log('Video title:', metadata.title);
    console.log('Duration (raw):', metadata.duration);
    console.log('Duration (formatted):', formatDuration(metadata.duration));
    console.log('Upload date:', metadata.upload_date);
    console.log('Channel:', metadata.channel);
    
    if (metadata.duration) {
      console.log('✅ Duration extraction successful!');
    } else {
      console.log('❌ Duration not found in metadata');
    }
    
  } catch (error) {
    console.error('❌ Error with yt-dlp:', error.message);
    console.error('Full error:', error);
  }
  
  // 4. Test system PATH
  try {
    console.log('\n=== Testing system yt-dlp ===');
    const { stdout } = await execPromise('which yt-dlp || where yt-dlp', { timeout: 5000 });
    console.log('System yt-dlp location:', stdout.trim());
  } catch (error) {
    console.log('System yt-dlp not found in PATH');
  }
  
  console.log('\n=== Debug test completed ===');
}

// Run the test
testDurationExtraction().catch(console.error); 