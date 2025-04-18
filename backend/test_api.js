const axios = require('axios');

async function testTranscriptAPI() {
  try {
    console.log('Testing transcript API endpoint...');
    
    const videoId = 'Cqh-TObfV0U';
    console.log(`Testing video ID: ${videoId}`);
    
    const response = await axios.post('http://localhost:5000/api/transcript', {
      videoId: videoId
    }, {
      headers: {
        'Content-Type': 'application/json'
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
testTranscriptAPI(); 