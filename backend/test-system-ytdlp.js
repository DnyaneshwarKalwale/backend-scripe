const { exec } = require('child_process');
const { promisify } = require('util');

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

async function testSystemYtDlp() {
  console.log('=== Testing System yt-dlp with Controller Logic ===');
  
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  
  // Test if system yt-dlp is available
  let ytDlpCommand = 'yt-dlp';
  
  try {
    await execPromise('yt-dlp --version', { timeout: 3000 });
    console.log('✅ Using system yt-dlp');
  } catch (systemError) {
    console.log('❌ System yt-dlp not available:', systemError.message);
    return;
  }
  
  try {
    // Use yt-dlp to get video metadata including duration
    const command = `${ytDlpCommand} --dump-json --no-download "${videoUrl}"`;
    console.log(`🔍 Running: ${command}`);
    
    const { stdout } = await execPromise(command, { timeout: 20000 });
    const metadata = JSON.parse(stdout);
    
    console.log('📊 Extracted metadata:');
    console.log('  Title:', metadata.title);
    console.log('  Duration (raw):', metadata.duration);
    console.log('  Duration (formatted):', formatDuration(metadata.duration));
    console.log('  Channel:', metadata.channel);
    console.log('  Upload date:', metadata.upload_date);
    
    if (metadata.duration) {
      console.log('✅ SUCCESS: Duration extraction working perfectly!');
    } else {
      console.log('❌ FAILED: No duration found in metadata');
    }
    
  } catch (error) {
    console.log('❌ FAILED:', error.message);
  }
}

testSystemYtDlp().catch(console.error); 