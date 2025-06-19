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

async function serverDiagnostics() {
  console.log('=== SERVER DURATION EXTRACTION DIAGNOSTICS ===');
  console.log('Platform:', os.platform());
  console.log('Architecture:', os.arch());
  console.log('Node version:', process.version);
  console.log('Current working directory:', process.cwd());
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log();

  // Test video
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;

  // 1. Check if system yt-dlp is available
  console.log('1. 🔍 Checking system yt-dlp availability...');
  try {
    const { stdout: versionOutput } = await execPromise('yt-dlp --version', { timeout: 10000 });
    console.log('✅ System yt-dlp found:', versionOutput.trim());
  } catch (error) {
    console.log('❌ System yt-dlp not found:', error.message);
  }

  // 2. Check local yt-dlp binary
  console.log('\n2. 🔍 Checking local yt-dlp binary...');
  const isWindows = os.platform() === 'win32';
  const localBinaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
  const localBinaryPath = path.join(process.cwd(), 'src', localBinaryName);
  
  if (fs.existsSync(localBinaryPath)) {
    console.log('✅ Local binary found at:', localBinaryPath);
    try {
      const stats = fs.statSync(localBinaryPath);
      console.log('   Size:', stats.size, 'bytes');
      console.log('   Modified:', stats.mtime);
      console.log('   Executable:', !!(stats.mode & parseInt('111', 8)));
    } catch (error) {
      console.log('❌ Error reading local binary stats:', error.message);
    }
  } else {
    console.log('❌ Local binary not found at:', localBinaryPath);
  }

  // 3. Test current controller logic
  console.log('\n3. 🧪 Testing current controller logic...');
  
  // Replicate the exact logic from youtubeController.js
  let ytDlpCommand = 'yt-dlp'; // Default to system
  
  if (isWindows) {
    const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp.exe');
    if (fs.existsSync(ytDlpPath)) {
      console.log('   Windows: Local yt-dlp.exe exists, but using system yt-dlp');
    }
  } else {
    const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp');
    if (fs.existsSync(ytDlpPath)) {
      try {
        await execPromise(`chmod +x "${ytDlpPath}"`);
        console.log('   Linux: Local yt-dlp exists and made executable');
      } catch (chmodError) {
        console.log('   Linux: Error making yt-dlp executable:', chmodError.message);
      }
    }
  }

  console.log('   Using command:', ytDlpCommand);

  // 4. Test duration extraction with exact controller method
  console.log('\n4. 🎯 Testing duration extraction...');
  try {
    const command = `${ytDlpCommand} --dump-json --no-download "${videoUrl}"`;
    console.log('   Command:', command);
    
    const { stdout } = await execPromise(command, { timeout: 30000 });
    const metadata = JSON.parse(stdout);
    
    if (metadata.duration) {
      const formattedDuration = formatDuration(metadata.duration);
      console.log('✅ Duration extraction successful!');
      console.log('   Raw duration:', metadata.duration, 'seconds');
      console.log('   Formatted duration:', formattedDuration);
      console.log('   Title:', metadata.title);
      console.log('   Channel:', metadata.channel);
    } else {
      console.log('❌ Duration not found in metadata');
      console.log('   Available fields:', Object.keys(metadata).slice(0, 10).join(', '), '...');
    }
  } catch (error) {
    console.log('❌ Duration extraction failed:', error.message);
    
    // Try fallback methods
    console.log('\n5. 🔄 Trying fallback methods...');
    
    // Method 1: Try with different timeout
    try {
      console.log('   Trying with longer timeout...');
      const { stdout } = await execPromise(`${ytDlpCommand} --dump-json --no-download "${videoUrl}"`, { timeout: 60000 });
      const metadata = JSON.parse(stdout);
      if (metadata.duration) {
        console.log('✅ Fallback successful with longer timeout:', formatDuration(metadata.duration));
      }
    } catch (fallbackError) {
      console.log('❌ Fallback with longer timeout failed:', fallbackError.message);
    }

    // Method 2: Try different yt-dlp options
    try {
      console.log('   Trying with minimal options...');
      const { stdout } = await execPromise(`${ytDlpCommand} --print duration "${videoUrl}"`, { timeout: 30000 });
      const duration = parseFloat(stdout.trim());
      if (duration && duration > 0) {
        console.log('✅ Minimal options successful:', formatDuration(duration));
      }
    } catch (minimalError) {
      console.log('❌ Minimal options failed:', minimalError.message);
    }
  }

  // 6. Check environment variables and PATH
  console.log('\n6. 🔍 Environment check...');
  console.log('   PATH includes:', process.env.PATH ? 'Yes' : 'No');
  console.log('   PATH length:', process.env.PATH ? process.env.PATH.length : 0);
  
  // Try which/where command
  try {
    const whereCommand = isWindows ? 'where yt-dlp' : 'which yt-dlp';
    const { stdout } = await execPromise(whereCommand, { timeout: 5000 });
    console.log('   yt-dlp location:', stdout.trim());
  } catch (error) {
    console.log('   yt-dlp location: Not found in PATH');
  }

  console.log('\n=== DIAGNOSTICS COMPLETE ===');
}

// Run diagnostics
serverDiagnostics().catch(console.error); 