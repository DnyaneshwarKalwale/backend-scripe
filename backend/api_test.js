// Test script to verify the API endpoint is working
const axios = require('axios');

async function testApiEndpoint() {
  console.log('Testing YouTube transcript API endpoint...');
  
  // Test with different video IDs - try multiple in case some have issues
  const videoIds = [
    'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
    'jNQXAC9IVRw', // Me at the zoo (first YouTube video, very short)
    'b5mqa18JOS4'  // Short video that was successfully processed in your logs
  ];
  
  // API URL - change this to your Render.com URL when testing in production
  const apiUrl = process.env.API_URL || 'https://backend-scripe.onrender.com';
  const localUrl = 'http://localhost:5000';
  
  // Try both URLs
  const urls = [apiUrl, localUrl];
  let success = false;
  
  for (const baseUrl of urls) {
    console.log(`\nTrying API at: ${baseUrl}`);
    
    for (const videoId of videoIds) {
      try {
        console.log(`\nSending request for video ID: ${videoId}`);
        
        const response = await axios.post(`${baseUrl}/api/youtube/transcript`, {
          videoId: videoId
        });
        
        if (response.data && response.data.success) {
          console.log(`✅ API SUCCESS for video ${videoId}! Transcript extraction is working.`);
          console.log(`Method/Source: ${response.data.source || 'unknown'}`);
          console.log(`Transcript length: ${response.data.transcript.length} characters`);
          console.log(`Sample: ${response.data.transcript.substring(0, 100)}...`);
          success = true;
          break;
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
    
    if (success) break;
  }
  
  if (!success) {
    console.log('\nNeither local nor remote API endpoints worked with any of the test videos.');
    console.log('To test locally: Start your server with "node src/server.js"');
    console.log('To test on Render: Make sure your app is deployed and running');
    
    console.log('\nPossible Issues on Render.com:');
    console.log('1. Python or youtube-transcript-api might not be installed correctly');
    console.log('2. Permissions issue with transcript_fetcher.py (chmod +x may be needed)');
    console.log('3. YouTube may not have captions available for the tested videos');
    console.log('4. Check Render logs for specific error messages');
  }
}

// Run the test
testApiEndpoint().then(() => {
  console.log('\nAPI test completed.');
}).catch(err => {
  console.error('Test failed with error:', err);
}); 