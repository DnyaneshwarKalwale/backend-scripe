const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function refreshCookies() {
    console.log('🔄 Refreshing YouTube cookies...\n');
    
    const cookiesDir = path.join(__dirname, 'toutube_cookies');
    const cookiesFile = path.join(cookiesDir, 'www.youtube.com_cookies.txt');
    const backupFile = path.join(cookiesDir, 'www.youtube.com_cookies.txt.backup');
    
    // Create cookies directory if it doesn't exist
    if (!fs.existsSync(cookiesDir)) {
        fs.mkdirSync(cookiesDir, { recursive: true });
        console.log('📁 Created cookies directory');
    }
    
    // Backup existing cookies if they exist
    if (fs.existsSync(cookiesFile)) {
        fs.copyFileSync(cookiesFile, backupFile);
        console.log('💾 Backed up existing cookies');
    }
    
    // Determine yt-dlp path
    const isWindows = process.platform === 'win32';
    const ytDlpPath = path.join(__dirname, 'src', isWindows ? 'yt-dlp.exe' : 'yt-dlp');
    let ytDlpCommand = fs.existsSync(ytDlpPath) ? `"${ytDlpPath}"` : 'yt-dlp';
    
    console.log(`🛠️ Using yt-dlp: ${ytDlpCommand}`);
    
    // Try different browsers in order of preference
    const browsers = ['chrome', 'firefox', 'edge', 'safari'];
    
    for (const browser of browsers) {
        console.log(`\n🌐 Trying to extract cookies from ${browser}...`);
        
        try {
            // Use a simple video URL that should always be accessible
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            
            // Create a temporary cookies file first
            const tempCookiesFile = cookiesFile + '.temp';
            
            // Command to extract cookies and save them
            const command = `${ytDlpCommand} --cookies-from-browser ${browser} --write-info-json --skip-download --quiet "${testUrl}"`;
            
            console.log(`⏳ Executing: ${command}`);
            const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
            
            if (stderr && stderr.includes('ERROR')) {
                throw new Error(stderr);
            }
            
            console.log(`✅ Successfully tested ${browser} cookies`);
            
            // Now extract cookies to file using a different approach
            // Create a simple script to extract cookies
            const pythonScript = `
import sys
import json
from http.cookiejar import MozillaCookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request

# This is a simple approach - we'll get the user to export manually
print("Please export cookies manually using browser extension")
print("See YOUTUBE_COOKIES_SETUP.md for instructions")
`;
            
            console.log(`🎉 ${browser} is available for cookie extraction!`);
            console.log(`💡 To use ${browser} cookies, export them manually using a browser extension`);
            console.log('📖 See YOUTUBE_COOKIES_SETUP.md for detailed instructions');
            
            // Clean up any temporary files
            const infoFile = 'dQw4w9WgXcQ.info.json';
            if (fs.existsSync(infoFile)) {
                fs.unlinkSync(infoFile);
            }
            
            return browser;
            
        } catch (error) {
            console.log(`❌ ${browser} failed: ${error.message}`);
            continue;
        }
    }
    
    console.log('\n❌ Could not extract cookies from any browser automatically');
    console.log('💡 Please export cookies manually:');
    console.log('   1. Install a cookie export extension in your browser');
    console.log('   2. Go to youtube.com and make sure you\'re logged in');
    console.log('   3. Export cookies in Netscape format');
    console.log('   4. Save as: toutube_cookies/www.youtube.com_cookies.txt');
    console.log('📖 See YOUTUBE_COOKIES_SETUP.md for detailed instructions');
    
    return null;
}

// Function to check cookie age and validity
async function checkCookies() {
    const cookiesFile = path.join(__dirname, 'toutube_cookies', 'www.youtube.com_cookies.txt');
    
    if (!fs.existsSync(cookiesFile)) {
        console.log('❌ Cookies file not found');
        return false;
    }
    
    const stats = fs.statSync(cookiesFile);
    const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    console.log(`🍪 Cookies file age: ${ageHours.toFixed(1)} hours`);
    
    if (ageHours > 48) {
        console.log('⚠️ Cookies are older than 48 hours and may be expired');
        return false;
    }
    
    if (ageHours > 24) {
        console.log('⚠️ Cookies are older than 24 hours, consider refreshing');
    }
    
    return true;
}

// Main function
async function main() {
    const command = process.argv[2];
    
    if (command === 'check') {
        await checkCookies();
    } else if (command === 'refresh' || !command) {
        const result = await refreshCookies();
        if (result) {
            console.log(`\n🎉 Recommended browser for cookies: ${result}`);
        }
    } else {
        console.log('Usage: node refresh_cookies.js [check|refresh]');
        console.log('  check   - Check current cookies status');
        console.log('  refresh - Attempt to refresh cookies (default)');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('💥 Error:', error.message);
        process.exit(1);
    });
}

module.exports = { refreshCookies, checkCookies }; 