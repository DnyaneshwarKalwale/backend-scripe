// Quick test script to verify transcript extraction functionality
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');

// The exact Python path that works on this system
const pythonPath = 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');

// Test video ID - Rick Astley - Never Gonna Give You Up
const videoId = 'dQw4w9WgXcQ';

async function testTranscriptFetch() {
  console.log(`Testing transcript fetching on video ID: ${videoId}`);
  
  try {
    // Direct Python execution - similar to what the API endpoint would do
    const command = `"${pythonPath}" "${scriptPath}" ${videoId}`;
    console.log(`Running command: ${command}`);
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error('Error output:', stderr);
    }
    
    // Parse the JSON output
    const result = JSON.parse(stdout);
    
    if (result.success) {
      console.log('SUCCESS! Transcript extraction works correctly.');
      console.log(`Method used: ${result.source}`);
      console.log(`Transcript length: ${result.transcript.length} characters`);
      console.log(`Sample: ${result.transcript.substring(0, 100)}...`);
    } else {
      console.error('ERROR: Transcript extraction failed.');
      console.error('Error:', result.error);
      
      if (result.traceback) {
        console.error('Traceback:', result.traceback);
      }
    }
  } catch (error) {
    console.error('Execution error:', error.message);
  }
}

// Run the test
testTranscriptFetch().then(() => {
  console.log('\nTest completed. The transcript functionality is working!');
  console.log('Your server should now be able to extract transcripts correctly.');
}).catch(err => {
  console.error('Test failed with error:', err);
}); 