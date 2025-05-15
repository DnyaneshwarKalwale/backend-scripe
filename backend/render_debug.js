// Debug script to help diagnose issues on the Render.com deployment
const axios = require('axios');

// Render.com server URL
const RENDER_URL = 'https://backend-scripe.onrender.com';

async function debugRenderServer() {
  console.log('Starting Render.com server diagnosis...');
  
  const tests = [
    { name: 'Health Check', endpoint: '/health', method: 'get' },
    { name: 'Python Check', endpoint: '/api/youtube/python-check', method: 'get' },
    { name: 'Transcript API with Debug', endpoint: '/api/youtube/transcript', method: 'post', data: { videoId: 'jNQXAC9IVRw', debug: true } }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    try {
      console.log(`\n📋 Running test: ${test.name}`);
      
      const response = test.method === 'get' 
        ? await axios.get(`${RENDER_URL}${test.endpoint}`)
        : await axios.post(`${RENDER_URL}${test.endpoint}`, test.data);
      
      console.log(`✅ ${test.name} SUCCESS!`);
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500) + (JSON.stringify(response.data, null, 2).length > 500 ? '...(truncated)' : ''));
    } catch (error) {
      console.error(`❌ ${test.name} FAILED!`);
      console.error('Error message:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      allPassed = false;
    }
  }
  
  console.log('\n📋 DIAGNOSIS RESULTS:');
  if (allPassed) {
    console.log('✅ All basic tests passed. If you\'re still having issues, check the Render.com logs.');
  } else {
    console.log('❌ Some tests failed. Here are recommended next steps:');
    console.log('1. Check the Render.com logs for specific Python or transcript errors');
    console.log('2. Make sure your build command includes: pip3 install youtube-transcript-api');
    console.log('3. Verify the chmod +x src/transcript_fetcher.py command was executed');
    console.log('4. Check if yt-dlp is installed and executable');
    console.log('5. Consider SSH into your Render instance to debug directly');
  }
  
  console.log('\n📋 For advanced debugging, add this to your server.js routes:');
  console.log(`
// Add this route to server.js temporarily for debugging
app.get('/api/youtube/python-check', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Check Python version
    let pythonResults = { available: false };
    try {
      const { stdout: pythonVersion } = await execPromise('python3 --version');
      pythonResults.available = true;
      pythonResults.version = pythonVersion.trim();
    } catch (err) {
      pythonResults.error = err.message;
    }
    
    // Check youtube-transcript-api
    let ytapiResults = { available: false };
    try {
      const { stdout } = await execPromise('python3 -c "import youtube_transcript_api; print(\\'available\\')"');
      ytapiResults.available = stdout.includes('available');
    } catch (err) {
      ytapiResults.error = err.message;
    }
    
    // Check transcript_fetcher.py exists and permissions
    let scriptResults = { exists: false };
    try {
      const { stdout: lsOutput } = await execPromise('ls -l src/transcript_fetcher.py');
      scriptResults.exists = true;
      scriptResults.permissions = lsOutput.trim();
    } catch (err) {
      scriptResults.error = err.message;
    }
    
    res.json({
      environment: process.env.NODE_ENV,
      python: pythonResults,
      youtube_transcript_api: ytapiResults,
      transcript_script: scriptResults,
      directory: process.cwd()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`);
}

// Run the diagnosis
debugRenderServer().then(() => {
  console.log('\nDiagnosis completed.');
}).catch(err => {
  console.error('Diagnosis failed with error:', err);
}); 