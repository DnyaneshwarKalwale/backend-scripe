const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

async function testYtDlpAuthentication() {
  console.log('🧪 Testing Enhanced yt-dlp Authentication');
  console.log('=========================================');
  console.log('');
  
  // Test video ID (Rick Roll - usually available)
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  
  console.log(`🎯 Testing with video: ${testVideoId}`);
  console.log('');
  
  // Check for yt-dlp binary
  const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp.exe');
  let ytDlpCommand;
  
  if (fs.existsSync(ytDlpPath)) {
    ytDlpCommand = `"${ytDlpPath}"`;
    console.log('✅ Found local yt-dlp binary');
  } else {
    ytDlpCommand = 'yt-dlp';
    console.log('⚠️  Using global yt-dlp command');
  }
  
  // Check cookies
  const cookiesPath = path.join(process.cwd(), 'toutube_cookies', 'www.youtube.com_cookies.txt');
  
  if (fs.existsSync(cookiesPath)) {
    const cookieStats = fs.statSync(cookiesPath);
    const cookieAge = Date.now() - cookieStats.mtime.getTime();
    const cookieAgeHours = cookieAge / (1000 * 60 * 60);
    console.log(`✅ Found cookies file (${cookieAgeHours.toFixed(1)} hours old)`);
  } else {
    console.log('❌ No cookies file found');
    return;
  }
  
  console.log('');
  console.log('🔄 Testing authentication methods...');
  console.log('');
  
  // Test 1: Browser cookie extraction
  console.log('📋 Test 1: Browser Cookie Extraction (--cookies-from-browser chrome)');
  try {
    const browserCommand = `${ytDlpCommand} --cookies-from-browser chrome --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/" --print-json --no-download "${videoUrl}"`;
    
    console.log('⏳ Attempting browser cookie extraction...');
    const { stdout: browserOutput, stderr: browserStderr } = await execPromise(browserCommand);
    
    if (browserStderr && browserStderr.includes('Sign in to confirm')) {
      console.log('❌ Browser cookie extraction failed: Bot detection');
      throw new Error('Browser auth failed');
    }
    
    if (browserOutput && browserOutput.trim()) {
      const metadata = JSON.parse(browserOutput);
      console.log('✅ Browser cookie extraction successful!');
      console.log(`   Title: ${metadata.title || 'N/A'}`);
      console.log(`   Duration: ${metadata.duration || 'N/A'} seconds`);
      console.log(`   Channel: ${metadata.channel || metadata.uploader || 'N/A'}`);
      return; // Success, no need to test other methods
    }
    
  } catch (browserError) {
    console.log('❌ Browser cookie extraction failed');
    console.log(`   Error: ${browserError.message}`);
  }
  
  console.log('');
  
  // Test 2: File cookie authentication
  console.log('📋 Test 2: File Cookie Authentication (--cookies file)');
  try {
    const fileCommand = `${ytDlpCommand} --cookies "${cookiesPath}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/" --print-json --no-download "${videoUrl}"`;
    
    console.log('⏳ Attempting file cookie authentication...');
    const { stdout: fileOutput, stderr: fileStderr } = await execPromise(fileCommand);
    
    if (fileStderr && fileStderr.includes('Sign in to confirm')) {
      console.log('❌ File cookie authentication failed: Bot detection');
      throw new Error('File auth failed');
    }
    
    if (fileOutput && fileOutput.trim()) {
      const metadata = JSON.parse(fileOutput);
      console.log('✅ File cookie authentication successful!');
      console.log(`   Title: ${metadata.title || 'N/A'}`);
      console.log(`   Duration: ${metadata.duration || 'N/A'} seconds`);
      console.log(`   Channel: ${metadata.channel || metadata.uploader || 'N/A'}`);
      return; // Success
    }
    
  } catch (fileError) {
    console.log('❌ File cookie authentication failed');
    console.log(`   Error: ${fileError.message}`);
  }
  
  console.log('');
  
  // Test 3: No authentication (baseline)
  console.log('📋 Test 3: No Authentication (baseline test)');
  try {
    const noAuthCommand = `${ytDlpCommand} --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/" --print-json --no-download "${videoUrl}"`;
    
    console.log('⏳ Attempting without authentication...');
    const { stdout: noAuthOutput, stderr: noAuthStderr } = await execPromise(noAuthCommand);
    
    if (noAuthStderr && noAuthStderr.includes('Sign in to confirm')) {
      console.log('❌ No authentication failed: Bot detection (expected)');
    } else if (noAuthOutput && noAuthOutput.trim()) {
      const metadata = JSON.parse(noAuthOutput);
      console.log('✅ No authentication successful (video is public)');
      console.log(`   Title: ${metadata.title || 'N/A'}`);
      console.log(`   Duration: ${metadata.duration || 'N/A'} seconds`);
      console.log(`   Channel: ${metadata.channel || metadata.uploader || 'N/A'}`);
    }
    
  } catch (noAuthError) {
    console.log('❌ No authentication failed (expected)');
    console.log(`   Error: ${noAuthError.message}`);
  }
  
  console.log('');
  console.log('🔍 DIAGNOSIS:');
  console.log('If all methods failed, YouTube bot detection is very active.');
  console.log('Recommendations:');
  console.log('• Export fresh cookies from an active YouTube session');
  console.log('• Try from a different IP address (VPN)');
  console.log('• Use browser automation instead of yt-dlp');
  console.log('• Consider alternative transcript sources');
}

// Run the test
testYtDlpAuthentication().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 