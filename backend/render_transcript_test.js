// Render.com YouTube Transcript API Test
// This script helps diagnose if the YouTube Transcript API is working on Render

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Function to test Python and package installation
async function testPythonSetup() {
  console.log('=== Testing Python and youtube-transcript-api setup ===');
  
  try {
    // Check Python version
    console.log('Checking Python version...');
    const { stdout: pythonVersion } = await execPromise('python3 --version');
    console.log('Python version:', pythonVersion.trim());
    
    // Check if youtube-transcript-api is installed
    console.log('\nChecking if youtube-transcript-api is installed...');
    try {
      const { stdout } = await execPromise('python3 -c "import youtube_transcript_api; print(\'Package version:\', youtube_transcript_api.__version__)"');
      console.log('✅ youtube-transcript-api is installed:', stdout.trim());
    } catch (err) {
      console.error('❌ youtube-transcript-api is NOT installed:', err.message);
      
      // Try to install it
      console.log('\nAttempting to install youtube-transcript-api...');
      try {
        const { stdout: installOutput } = await execPromise('pip3 install youtube-transcript-api');
        console.log('Installation output:', installOutput);
        
        // Verify installation
        try {
          const { stdout: verifyOutput } = await execPromise('python3 -c "import youtube_transcript_api; print(\'Package installed successfully\')"');
          console.log('✅ Installation verified:', verifyOutput.trim());
        } catch (verifyErr) {
          console.error('❌ Installation verification failed:', verifyErr.message);
        }
      } catch (installErr) {
        console.error('❌ Installation failed:', installErr.message);
      }
    }
    
    // Check transcript_fetcher.py exists and is executable
    console.log('\nChecking transcript_fetcher.py...');
    const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
    
    if (fs.existsSync(scriptPath)) {
      console.log('✅ transcript_fetcher.py exists at:', scriptPath);
      
      // Check permissions
      const { stdout: permissions } = await execPromise(`ls -l "${scriptPath}"`);
      console.log('File permissions:', permissions.trim());
      
      // Make it executable if needed
      if (!permissions.includes('x')) {
        console.log('Making transcript_fetcher.py executable...');
        await execPromise(`chmod +x "${scriptPath}"`);
        console.log('✅ Made transcript_fetcher.py executable');
      }
      
      // Try running it directly
      console.log('\nTesting transcript_fetcher.py with a sample video ID...');
      try {
        // Use a video known to have captions - "dQw4w9WgXcQ" is "Never Gonna Give You Up"
        const { stdout, stderr } = await execPromise(`python3 "${scriptPath}" dQw4w9WgXcQ`);
        
        // Check if output is valid JSON
        try {
          const result = JSON.parse(stdout);
          console.log('✅ Script executed successfully. Result:', JSON.stringify(result).substring(0, 200) + '...');
          if (result.success) {
            console.log('✅ Transcript extraction is working!');
            console.log('Transcript length:', result.transcript.length);
            console.log('Sample:', result.transcript.substring(0, 100) + '...');
          } else {
            console.error('❌ Script executed but returned error:', result.error);
          }
        } catch (jsonErr) {
          console.error('❌ Script output is not valid JSON:', stdout);
        }
        
        if (stderr) {
          console.error('Script stderr:', stderr);
        }
      } catch (scriptErr) {
        console.error('❌ Error executing script:', scriptErr.message);
      }
    } else {
      console.error('❌ transcript_fetcher.py does not exist at expected path');
    }
  } catch (error) {
    console.error('Error during Python setup tests:', error);
  }
}

// Function to test the API endpoint
async function testApiEndpoint() {
  console.log('\n=== Testing API Endpoint ===');
  
  // The server URL - adjust as needed
  const baseUrl = process.env.BASE_URL || 'https://api.brandout.ai';
  console.log(`Testing API at: ${baseUrl}`);
  
  // Test videos
  const videoIds = [
    'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up (should work)
    'jNQXAC9IVRw'  // Me at the zoo (first YouTube video, might not have captions)
  ];
  
  for (const videoId of videoIds) {
    try {
      console.log(`\nSending request for video ID: ${videoId}`);
      
      const response = await axios.post(`${baseUrl}/api/youtube/transcript`, {
        videoId: videoId
      });
      
      if (response.data && response.data.success) {
        console.log(`✅ API SUCCESS for video ${videoId}!`);
        console.log(`Method/Source: ${response.data.source || 'unknown'}`);
        console.log(`Transcript length: ${response.data.transcript.length} characters`);
        console.log(`Sample: ${response.data.transcript.substring(0, 100)}...`);
      } else {
        console.error(`❌ API ERROR for video ${videoId}: Transcript extraction failed.`);
        console.error('Error:', response.data.message || 'Unknown error');
      }
    } catch (error) {
      console.error(`❌ Request to ${baseUrl} for video ${videoId} failed:`, error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
  }
}

// Run all tests
async function runTests() {
  console.log('Starting Render.com transcript API tests...');
  console.log('Environment:', {
    platform: process.platform,
    nodeEnv: process.env.NODE_ENV,
    isRender: !!process.env.RENDER,
    cwd: process.cwd()
  });
  
  try {
    // First test Python setup
    await testPythonSetup();
    
    // Then test the API endpoint
    await testApiEndpoint();
    
    console.log('\nAll tests completed');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests().catch(err => {
  console.error('Test script failed with error:', err);
}); 