const axios = require('axios');

async function testProductionTranscriptAPI() {
  try {
    console.log('Testing production transcript API endpoint...');
    
    const videoId = 'Cqh-TObfV0U';
    console.log(`Testing video ID: ${videoId}`);
    
    // Test with the correct URL structure
    const baseUrl = 'https://backend-scripe.onrender.com';
    const apiUrl = `${baseUrl}/api/transcript`;
    
    console.log(`Using API URL: ${apiUrl}`);
    
    const response = await axios.post(apiUrl, {
      videoId: videoId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (response.data && response.data.success) {
      console.log('✅ Success!');
      console.log(`Language: ${response.data.language}`);
      console.log(`Transcript length: ${response.data.transcript.length} characters`);
      console.log('First 100 characters:', response.data.transcript.substring(0, 100) + '...');
    } else {
      console.log('❌ Failed:', response.data?.error || 'Unknown error');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

// Run the test
testProductionTranscriptAPI(); 