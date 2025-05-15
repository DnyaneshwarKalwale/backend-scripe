// Test script to verify the API endpoint is working
const axios = require('axios');

async function testApiEndpoint() {
  console.log('Testing YouTube transcript API endpoint...');
  
  // Test with a known video ID
  const videoId = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
  
  // API URL - change this to your Render.com URL when testing in production
  const apiUrl = process.env.API_URL || 'https://backend-scripe.onrender.com';
  const localUrl = 'http://localhost:5000';
  
  // Try both URLs
  const urls = [apiUrl, localUrl];
  let success = false;
  
  for (const baseUrl of urls) {
    try {
      console.log(`\nTrying API at: ${baseUrl}`);
      console.log(`Sending request for video ID: ${videoId}`);
      
      const response = await axios.post(`${baseUrl}/api/youtube/transcript`, {
        videoId: videoId
      });
      
      if (response.data && response.data.success) {
        console.log('✅ API SUCCESS! Transcript extraction is working through the API endpoint.');
        console.log(`Method/Source: ${response.data.source || 'unknown'}`);
        console.log(`Transcript length: ${response.data.transcript.length} characters`);
        console.log(`Sample: ${response.data.transcript.substring(0, 100)}...`);
        success = true;
        break;
      } else {
        console.error('❌ API ERROR: Transcript extraction failed.');
        console.error('Error:', response.data.message || 'Unknown error');
      }
    } catch (error) {
      console.error(`❌ Request to ${baseUrl} failed:`, error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
  }
  
  if (!success) {
    console.log('\nNeither local nor remote API endpoints worked.');
    console.log('To test locally: Start your server with "node src/server.js"');
    console.log('To test on Render: Make sure your app is deployed and running');
  }
}

// Run the test
testApiEndpoint().then(() => {
  console.log('\nAPI test completed.');
}).catch(err => {
  console.error('Test failed with error:', err);
}); 