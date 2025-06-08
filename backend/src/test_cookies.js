// test_cookies.js - Quick cookie test
const fs = require('fs');
const path = require('path');

console.log('🍪 COOKIE STATUS CHECK');
console.log('=====================');

const cookiesPath = path.join(__dirname, '..', 'cookies', 'www.youtube.com_cookies.txt');

if (fs.existsSync(cookiesPath)) {
    const stats = fs.statSync(cookiesPath);
    console.log('✅ Cookies file found');
    console.log(`📁 Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`🕐 Modified: ${stats.mtime.toLocaleString()}`);
    
    // Count cookies
    const content = fs.readFileSync(cookiesPath, 'utf8');
    const lines = content.split('\n').filter(line => !line.startsWith('#') && line.trim());
    console.log(`🍪 Cookie count: ${lines.length}`);
    
    console.log('\n✅ READY TO USE!');
    console.log('Both YouTube Transcript API and yt-dlp now use cookies');
    console.log('Test with: node update_cookies.js');
} else {
    console.log('❌ Cookies file not found');
    console.log('Please add your YouTube cookies to:', cookiesPath);
} 