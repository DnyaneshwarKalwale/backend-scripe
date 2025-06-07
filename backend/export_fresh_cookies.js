const fs = require('fs');
const path = require('path');

console.log('🍪 YouTube Cookie Export Helper');
console.log('================================');
console.log('');
console.log('YouTube is currently blocking automated requests with advanced bot detection.');
console.log('To get transcripts working again, you need to export FRESH cookies from your browser.');
console.log('');

console.log('📋 STEP-BY-STEP INSTRUCTIONS:');
console.log('');
console.log('1. 🌐 Open YouTube.com in Chrome/Firefox');
console.log('2. 🔐 Sign in to your YouTube account');
console.log('3. 📹 Watch a few videos to establish "normal" browsing behavior');
console.log('4. 🔧 Install a cookie export extension:');
console.log('   • Chrome: "Get cookies.txt LOCALLY" extension');
console.log('   • Firefox: "cookies.txt" extension');
console.log('');
console.log('5. 🍪 Export cookies for youtube.com:');
console.log('   • Click the extension icon');
console.log('   • Select "youtube.com" domain');
console.log('   • Download/copy the cookies.txt file');
console.log('');
console.log('6. 📁 Place the file at:');
console.log(`   ${path.join(process.cwd(), 'toutube_cookies', 'www.youtube.com_cookies.txt')}`);
console.log('');

// Check current cookies status
const cookiesPath = path.join(process.cwd(), 'toutube_cookies', 'www.youtube.com_cookies.txt');

if (fs.existsSync(cookiesPath)) {
  const cookieStats = fs.statSync(cookiesPath);
  const cookieAge = Date.now() - cookieStats.mtime.getTime();
  const cookieAgeHours = cookieAge / (1000 * 60 * 60);
  
  console.log('📊 CURRENT COOKIES STATUS:');
  console.log(`   File exists: ✅ Yes`);
  console.log(`   Age: ${cookieAgeHours.toFixed(1)} hours old`);
  
  if (cookieAgeHours > 24) {
    console.log(`   Status: 🔴 OLD (${cookieAgeHours.toFixed(1)}h) - Likely expired`);
  } else if (cookieAgeHours > 6) {
    console.log(`   Status: 🟡 AGING (${cookieAgeHours.toFixed(1)}h) - May need refresh`);
  } else {
    console.log(`   Status: 🟢 FRESH (${cookieAgeHours.toFixed(1)}h) - Should work`);
  }
  
  // Try to read and analyze cookies
  try {
    const cookieContent = fs.readFileSync(cookiesPath, 'utf8');
    const cookieLines = cookieContent.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    );
    
    console.log(`   Cookie count: ${cookieLines.length} cookies`);
    
    // Check for important YouTube cookies
    const importantCookies = ['CONSENT', 'VISITOR_INFO1_LIVE', '__Secure-3PAPISID', 'SAPISID'];
    const foundCookies = importantCookies.filter(cookie => 
      cookieContent.includes(cookie)
    );
    
    console.log(`   Important cookies found: ${foundCookies.length}/${importantCookies.length}`);
    if (foundCookies.length < importantCookies.length) {
      console.log('   ⚠️  Missing important cookies - consider re-exporting');
    }
    
  } catch (readError) {
    console.log('   ❌ Error reading cookies file');
  }
} else {
  console.log('📊 CURRENT COOKIES STATUS:');
  console.log('   File exists: ❌ No');
  console.log('   Status: 🔴 MISSING - Must export cookies');
}

console.log('');
console.log('🚀 ADVANCED OPTIONS (if simple export doesn\'t work):');
console.log('');
console.log('• Use --cookies-from-browser chrome (automatic browser extraction)');
console.log('• Try different browsers (Chrome, Firefox, Edge)');
console.log('• Use a VPN to change your IP location');
console.log('• Clear browser cache and re-login to YouTube');
console.log('• Use browser automation (Puppeteer/Playwright)');
console.log('');
console.log('💡 TIPS:');
console.log('• Export cookies while actively browsing YouTube');
console.log('• Don\'t export cookies from incognito/private mode');
console.log('• Export from the same browser you normally use for YouTube');
console.log('• Make sure you\'re signed in when exporting');
console.log('');
console.log('🔄 After exporting fresh cookies, run:');
console.log('   npm test cookies');
console.log('');

// Create cookies directory if it doesn't exist
const cookiesDir = path.join(process.cwd(), 'toutube_cookies');
if (!fs.existsSync(cookiesDir)) {
  fs.mkdirSync(cookiesDir, { recursive: true });
  console.log('📁 Created cookies directory');
}

console.log('Ready to test transcript extraction once cookies are updated! 🎬'); 