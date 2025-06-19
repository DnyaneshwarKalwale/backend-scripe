#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Proxy-Enabled Transcript Fetching\n');

// Test video IDs (known to have transcripts)
const testVideoIds = [
    'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
    'jNQXAC9IVRw'  // Me at the zoo (first YouTube video)
];

async function testPythonTranscriptFetcher() {
    console.log('📝 Testing Python transcript fetcher with proxy...\n');
    
    const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
        console.error('❌ transcript_fetcher.py not found at:', scriptPath);
        return false;
    }
    
    // Test the --test flag first
    console.log('🔍 Testing script availability...');
    
    try {
        const testResult = await runPythonScript(scriptPath, ['--test']);
        const testData = JSON.parse(testResult);
        
        if (testData.success) {
            console.log('✅ Script is working');
            console.log(`🔗 Proxy enabled: ${testData.proxy_enabled}`);
            console.log(`🌐 Proxy host: ${testData.proxy_host || 'None'}\n`);
        } else {
            console.log('❌ Script test failed');
            return false;
        }
    } catch (error) {
        console.error('❌ Script test error:', error.message);
        return false;
    }
    
    // Test actual transcript fetching
    for (const videoId of testVideoIds) {
        console.log(`🎥 Testing transcript fetching for video: ${videoId}`);
        
        try {
            const result = await runPythonScript(scriptPath, ['--debug', videoId]);
            
            // Parse the last line as JSON (debug output might be on previous lines)
            const lines = result.trim().split('\n');
            const jsonLine = lines[lines.length - 1];
            const data = JSON.parse(jsonLine);
            
            if (data.success && data.transcript) {
                console.log(`✅ Success! Fetched ${data.transcript.length} characters`);
                console.log(`📡 Source: ${data.source}`);
                console.log(`🗣️  Language: ${data.language || 'Unknown'}`);
                console.log(`🤖 Auto-generated: ${data.is_generated ? 'Yes' : 'No'}`);
                console.log(`📺 Channel: ${data.channelTitle || 'Unknown'}`);
                console.log(`📄 Preview: ${data.transcript.substring(0, 100)}...\n`);
            } else {
                console.log(`❌ Failed: ${data.error || 'Unknown error'}\n`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}\n`);
        }
        
        // Wait a bit between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return true;
}

function runPythonScript(scriptPath, args) {
    return new Promise((resolve, reject) => {
        // Determine Python executable
        const pythonExecutable = path.join(process.cwd(), 'venv', 
            process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
        
        const python = spawn(pythonExecutable, [scriptPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        python.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Python script exited with code ${code}. Error: ${stderr}`));
            }
        });
        
        python.on('error', (error) => {
            reject(new Error(`Failed to start Python script: ${error.message}`));
        });
    });
}

async function testYtDlpTranscript() {
    console.log('🎬 Testing yt-dlp transcript fetching with proxy...\n');
    
    const testVideoId = testVideoIds[0];
    
    try {
        const response = await fetch('http://localhost:5000/api/youtube/transcript-yt-dlp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ videoId: testVideoId })
        });
        
        const data = await response.json();
        
        if (data.success && data.transcript) {
            console.log(`✅ yt-dlp Success! Fetched ${data.transcript.length} characters`);
            console.log(`🗣️  Language: ${data.language || 'Unknown'}`);
            console.log(`🤖 Auto-generated: ${data.is_generated ? 'Yes' : 'No'}`);
            console.log(`📺 Title: ${data.title || 'Unknown'}`);
            console.log(`📺 Channel: ${data.channelName || 'Unknown'}`);
            console.log(`⏱️  Duration: ${data.duration || 'Unknown'}`);
            console.log(`📄 Preview: ${data.transcript.substring(0, 100)}...\n`);
        } else {
            console.log(`❌ yt-dlp Failed: ${data.message || data.error || 'Unknown error'}\n`);
        }
    } catch (error) {
        console.log(`❌ yt-dlp Error: ${error.message}\n`);
    }
}

async function main() {
    console.log('Starting proxy transcript fetching tests...\n');
    
    // Test Python transcript fetcher
    await testPythonTranscriptFetcher();
    
    // Test yt-dlp endpoint (if server is running)
    console.log('Note: yt-dlp test requires the server to be running on localhost:5000');
    console.log('If the server is not running, this test will fail.\n');
    
    await testYtDlpTranscript();
    
    console.log('🏁 Testing complete!');
    console.log('\n💡 Tips:');
    console.log('- If tests fail, check your proxy configuration in src/config/proxy.js');
    console.log('- Make sure your Lightning Proxies credentials are correct');
    console.log('- Check your internet connection and proxy service status');
    console.log('- For yt-dlp tests, ensure the server is running: npm start');
}

// Run the tests
main().catch(console.error); 