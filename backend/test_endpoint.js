const axios = require('axios');

async function testTranscriptEndpoint() {
    try {
        console.log('Testing transcript endpoint...');
        const response = await axios.post('https://api.brandout.ai/api/youtube/transcript', {
            videoId: 'dQw4w9WgXcQ'
        });
        
        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testTranscriptEndpoint(); 