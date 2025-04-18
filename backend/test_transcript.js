const { spawn } = require('child_process');
const path = require('path');

// Test function to get transcript
async function testTranscript(videoId) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'src', 'transcript_fetcher.py');
    
    // Use platform-specific Python command
    const isWindows = process.platform === "win32";
    const pythonCommand = isWindows
      ? 'C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
      : 'python3';
    
    console.log(`Using Python command: ${pythonCommand} for platform: ${process.platform}`);
    console.log(`Fetching transcript for video ID: ${videoId}`);
    
    // Execute the Python script and pass the videoId as an argument
    const pythonProcess = spawn(pythonCommand, [pythonScript, videoId]);
    
    let transcriptData = '';
    let errorData = '';

    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      transcriptData += data.toString();
    });

    // Collect any error output
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error(`Python stderr: ${data}`);
    });

    // When the process completes
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorData}`);
        return reject(new Error(`Failed to get transcript: ${errorData}`));
      }

      try {
        const result = JSON.parse(transcriptData);
        resolve(result);
      } catch (error) {
        console.error('Error parsing transcript data:', error);
        console.error('Raw transcript data:', transcriptData);
        reject(error);
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });
  });
}

// Test video IDs (popular videos with transcripts)
const testVideoIds = [
  'jNQXAC9IVRw', // Me at the zoo (first YouTube video)
  'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
  'EwTZ2xpQwpA', // Chocolate Rain
  'QH2-TGUlwu4'  // Nyan Cat
];

// Run the tests
async function runTests() {
  console.log('Starting transcript API tests...');
  
  for (const videoId of testVideoIds) {
    console.log(`\nTesting video ID: ${videoId}`);
    try {
      const result = await testTranscript(videoId);
      
      if (result.success) {
        console.log('✅ Success!');
        console.log(`Language: ${result.language}`);
        console.log(`Transcript length: ${result.transcript.length} characters`);
        console.log('First 100 characters:', result.transcript.substring(0, 100) + '...');
      } else {
        console.log('❌ Failed:', result.error);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
  
  console.log('\nTests completed!');
}

// Run the tests
runTests(); 