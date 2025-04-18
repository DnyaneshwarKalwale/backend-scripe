const axios = require('axios');

async function testDirectTranscriptEndpoint() {
  try {
    console.log('Testing direct transcript endpoint with no fallbacks...');
    
    const videoId = 'Cqh-TObfV0U';
    console.log(`Testing video ID: ${videoId}`);
    
    // Try production server direct endpoint
    try {
      const directUrl = `https://backend-scripe.onrender.com/api/transcript/direct?id=${videoId}`;
      console.log(`Testing direct URL: ${directUrl}`);
      
      const directResponse = await axios.get(directUrl);
      console.log('✅ Direct endpoint is working!');
      console.log('Response:', JSON.stringify(directResponse.data, null, 2));
    } catch (directError) {
      console.log('❌ Direct endpoint failed with error:');
      
      if (directError.response) {
        console.log('Status:', directError.response.status);
        console.log('Data:', directError.response.data);
      } else if (directError.request) {
        console.log('No response received.');
      } else {
        console.log('Error message:', directError.message);
      }
    }
    
    // Try the main transcript endpoint
    try {
      const mainUrl = `https://backend-scripe.onrender.com/api/transcript`;
      console.log(`\nTesting main endpoint: ${mainUrl}`);
      
      const mainResponse = await axios.post(mainUrl, { videoId });
      console.log('✅ Main endpoint is working!');
      console.log('Response:', JSON.stringify(mainResponse.data, null, 2));
    } catch (mainError) {
      console.log('❌ Main endpoint failed with error:');
      
      if (mainError.response) {
        console.log('Status:', mainError.response.status);
        console.log('Data:', mainError.response.data);
      } else if (mainError.request) {
        console.log('No response received.');
      } else {
        console.log('Error message:', mainError.message);
      }
    }
  } catch (error) {
    console.log('❌ General error:', error.message);
  }
}

// Run the test
testDirectTranscriptEndpoint(); 