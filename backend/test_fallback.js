const axios = require('axios');

async function testFallbackEndpoint() {
  try {
    console.log('Testing fallback transcript endpoint...');
    
    const videoId = 'Cqh-TObfV0U';
    console.log(`Testing video ID: ${videoId}`);
    
    // First try local development server
    try {
      const localResponse = await axios.get(`http://localhost:5000/api/transcript/fallback?id=${videoId}`);
      console.log('✅ Local fallback endpoint is working!');
      console.log('Response:', JSON.stringify(localResponse.data, null, 2));
    } catch (localError) {
      console.log('❌ Local fallback endpoint failed:', localError.message);
    }
    
    // Then try production server
    try {
      const prodResponse = await axios.get(`https://backend-scripe.onrender.com/api/transcript/fallback?id=${videoId}`);
      console.log('✅ Production fallback endpoint is working!');
      console.log('Response:', JSON.stringify(prodResponse.data, null, 2));
    } catch (prodError) {
      console.log('❌ Production fallback endpoint failed:', prodError.message);
      
      if (prodError.response) {
        console.log('Status:', prodError.response.status);
        console.log('Data:', prodError.response.data);
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Run the test
testFallbackEndpoint(); 