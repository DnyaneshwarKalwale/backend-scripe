const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testCookieSetup() {
    console.log('🔍 Testing YouTube Cookie Setup...\n');
    
    // Check if cookies directory exists
    const cookiesDir = path.join(__dirname, 'toutube_cookies');
    const cookiesFile = path.join(cookiesDir, 'www.youtube.com_cookies.txt');
    
    console.log('📁 Checking cookies directory...');
    if (!fs.existsSync(cookiesDir)) {
        console.log('❌ Cookies directory not found:', cookiesDir);
        console.log('💡 Please create it with: mkdir toutube_cookies');
        return false;
    } else {
        console.log('✅ Cookies directory exists');
    }
    
    console.log('\n🍪 Checking cookies file...');
    if (!fs.existsSync(cookiesFile)) {
        console.log('❌ Cookies file not found:', cookiesFile);
        console.log('💡 Please export your YouTube cookies and place them at this location');
        console.log('📖 See YOUTUBE_COOKIES_SETUP.md for detailed instructions');
        return false;
    } else {
        console.log('✅ Cookies file exists');
        
        // Check file size
        const stats = fs.statSync(cookiesFile);
        console.log(`📊 File size: ${stats.size} bytes`);
        
        if (stats.size < 100) {
            console.log('⚠️  Warning: Cookies file seems very small, it might be empty or corrupted');
        }
        
        // Check file format
        try {
            const content = fs.readFileSync(cookiesFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
            console.log(`🔢 Found ${lines.length} cookie entries`);
            
            if (lines.length === 0) {
                console.log('⚠️  Warning: No valid cookie entries found');
            } else {
                console.log('✅ Cookies file appears to be valid');
            }
        } catch (error) {
            console.log('❌ Error reading cookies file:', error.message);
            return false;
        }
    }
    
    console.log('\n🐍 Testing Python transcript fetcher...');
    try {
        // Test with a known video ID
        const testVideoId = 'dQw4w9WgXcQ'; // Rick Roll - should always be available
        const scriptPath = path.join(__dirname, 'src', 'transcript_fetcher.py');
        
        console.log(`🎯 Testing with video ID: ${testVideoId}`);
        console.log('⏳ This may take a moment...');
        
        const { stdout, stderr } = await execPromise(`python "${scriptPath}" ${testVideoId}`);
        
        if (stderr) {
            console.log('⚠️  Python stderr:', stderr);
        }
        
        const result = JSON.parse(stdout);
        
        if (result.success) {
            console.log('✅ Python transcript fetcher working!');
            console.log(`📝 Transcript length: ${result.transcript.length} characters`);
            console.log(`🌐 Language: ${result.language} (${result.language_code})`);
            console.log(`🤖 Auto-generated: ${result.is_generated}`);
            console.log(`🔧 Source: ${result.source}`);
        } else {
            console.log('❌ Python transcript fetcher failed:', result.error);
            return false;
        }
    } catch (error) {
        console.log('❌ Error testing Python script:', error.message);
        console.log('💡 Make sure Python is installed and youtube-transcript-api package is available');
        return false;
    }
    
    console.log('\n🎉 Cookie setup test completed successfully!');
    console.log('💡 You can now try fetching transcripts from your frontend');
    
    return true;
}

// Run the test
if (require.main === module) {
    testCookieSetup().catch(error => {
        console.error('💥 Test failed with error:', error);
        process.exit(1);
    });
}

module.exports = { testCookieSetup }; 