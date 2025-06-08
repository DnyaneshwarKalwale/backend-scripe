// Script to test YouTube transcript API functionality
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');

async function testYoutubeTranscriptAPI() {
  console.log('Testing YouTube Transcript API functionality...');
  
  // Use Python from virtual environment
  const pythonPath = path.join(process.cwd(), 'venv', 
    process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  
  try {
    // Check if Python is available
    const { stdout: versionOutput } = await execPromise(`"${pythonPath}" --version`);
    console.log(`Python version: ${versionOutput.trim()}`);
    
    // Check if youtube-transcript-api is installed
    try {
      const { stdout: packageCheck } = await execPromise(
        `"${pythonPath}" -c "import youtube_transcript_api; print('Package is installed')"`
      );
      console.log(packageCheck.trim());
    } catch (importErr) {
      console.error('❌ youtube-transcript-api is not installed:', importErr.message);
      console.log('Installing youtube-transcript-api...');
      
      try {
        const { stdout: installOutput } = await execPromise(`"${pythonPath}" -m pip install youtube-transcript-api`);
        console.log(installOutput);
        console.log('✅ youtube-transcript-api installed successfully');
      } catch (installErr) {
        console.error('❌ Failed to install youtube-transcript-api:', installErr.message);
        return;
      }
    }
    
    // Test with direct API first to ensure it's working
    console.log("\nRunning direct API test...");
    try {
      const directTestPath = path.join(__dirname, 'direct_youtube_api_test.py');
      const { stdout: directTestOutput } = await execPromise(
        `"${pythonPath}" "${directTestPath}"`, 
        { encoding: 'utf8' }
      );
      console.log('Direct API test output:');
      console.log('-------------------------------------');
      console.log(directTestOutput.substring(0, 500) + '...');
      console.log('-------------------------------------');
    } catch (directErr) {
      console.error('Error in direct API test:', directErr.message);
    }
    
    // Test transcript fetching with the main script directly with debug mode
    const testVideoId = 'dQw4w9WgXcQ'; // Use a reliable video for testing
    console.log(`\nTesting transcript fetcher script with video ID: ${testVideoId}`);
    
    const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
    
    // Run with debug flag
    const cmd = `"${pythonPath}" "${scriptPath}" --debug ${testVideoId}`;
    console.log(`Executing command: ${cmd}`);
    
    const { stdout, stderr } = await execPromise(cmd, { encoding: 'utf8' });
    
    if (stderr) {
      console.error(`Error output: ${stderr}`);
    }
    
    // Show the full debug output
    console.log('\nDebug output:');
    console.log('-------------------------------------');
    console.log(stdout.substring(0, 500) + '...');
    console.log('-------------------------------------');
    
    try {
      // Extract the JSON part - might have debug output before it, so get the last line that's valid JSON
      const lines = stdout.split('\n');
      let jsonLine = '';
      
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('{')) {
          try {
            // Try to parse this line as JSON
            JSON.parse(lines[i]);
            jsonLine = lines[i];
            break;
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }
      
      if (!jsonLine) {
        throw new Error('No valid JSON found in the output');
      }
      
      const result = JSON.parse(jsonLine);
      
      if (result.success) {
        console.log('✅ Successfully fetched transcript!');
        console.log(`Source: ${result.source}`);
        console.log(`Language: ${result.language} (${result.language_code})`);
        console.log(`Transcript length: ${result.transcript ? result.transcript.length : 0} characters`);
        if (result.transcript && result.transcript.length > 0) {
          console.log(`Preview: ${result.transcript.substring(0, 100)}...`);
        } else {
          console.log(`Empty transcript returned`);
        }
      } else {
        console.error('❌ Failed to fetch transcript:', result.error);
        if (result.traceback) {
          console.error('Traceback:', result.traceback);
        }
      }
    } catch (parseError) {
      console.error('Error parsing output:', parseError);
      console.log('Raw output:', stdout);
    }
  } catch (error) {
    console.error('Error in testYoutubeTranscriptAPI:', error);
  }
}

// Run the test
testYoutubeTranscriptAPI()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err)); 