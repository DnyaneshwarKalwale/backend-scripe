#!/usr/bin/env node
// update_cookies.js - Auto-update YouTube cookies

const fs = require('fs');
const path = require('path');

// Cookie expiration check
function checkCookieExpiration() {
    const cookiesPath = path.join(__dirname, '..', 'cookies', 'www.youtube.com_cookies.txt');
    
    if (!fs.existsSync(cookiesPath)) {
        console.log('❌ Cookies file not found');
        return false;
    }
    
    try {
        const cookieContent = fs.readFileSync(cookiesPath, 'utf8');
        const lines = cookieContent.split('\n');
        
        let validCookies = 0;
        let expiredCookies = 0;
        let soonToExpire = 0;
        
        const now = Math.floor(Date.now() / 1000); // Current timestamp
        const oneWeek = 7 * 24 * 60 * 60; // One week in seconds
        
        for (const line of lines) {
            if (line.startsWith('#') || line.trim() === '') continue;
            
            const parts = line.split('\t');
            if (parts.length < 5) continue;
            
            const expiration = parseInt(parts[4]);
            
            if (expiration === 0) {
                // Session cookie (no expiration)
                validCookies++;
            } else if (expiration < now) {
                // Expired cookie
                expiredCookies++;
            } else if (expiration < now + oneWeek) {
                // Expires within a week
                soonToExpire++;
                validCookies++;
            } else {
                // Valid cookie
                validCookies++;
            }
        }
        
        console.log(`🍪 Cookie Status:`);
        console.log(`   ✅ Valid: ${validCookies}`);
        console.log(`   ⚠️  Expiring soon: ${soonToExpire}`);
        console.log(`   ❌ Expired: ${expiredCookies}`);
        
        if (expiredCookies > 5 || (validCookies < 10 && expiredCookies > 0)) {
            console.log('⚠️  Many cookies are expired. Consider updating them.');
            return false;
        }
        
        if (soonToExpire > 3) {
            console.log('⚠️  Some cookies will expire soon. Consider updating them.');
        }
        
        return validCookies > 10; // Return true if we have enough valid cookies
        
    } catch (error) {
        console.error('Error reading cookies:', error);
        return false;
    }
}

// Instructions for manual cookie update
function showCookieUpdateInstructions() {
    console.log(`
🔄 HOW TO UPDATE COOKIES:

1. Open your browser and go to YouTube.com
2. Make sure you're logged in to your YouTube account
3. Install a browser extension like "Get cookies.txt LOCALLY" or "cookies.txt"
4. Extract cookies for youtube.com
5. Save the cookies file as: backend-scripe/backend/cookies/www.youtube.com_cookies.txt
6. Restart your backend server

Alternative method:
1. Use browser developer tools (F12)
2. Go to Application/Storage > Cookies > https://www.youtube.com
3. Copy all cookies to the cookies.txt file in Netscape format

🚨 IMPORTANT: Keep your cookies file secure and don't share it!
`);
}

// Main function
function main() {
    console.log('🍪 YouTube Cookie Checker');
    console.log('========================');
    
    const isValid = checkCookieExpiration();
    
    if (!isValid) {
        showCookieUpdateInstructions();
        process.exit(1);
    } else {
        console.log('✅ Cookies are valid and should work for transcript fetching!');
        process.exit(0);
    }
}

// Auto-update scheduler (if run with --schedule flag)
if (process.argv.includes('--schedule')) {
    console.log('🕐 Starting cookie monitoring...');
    
    // Check every 6 hours
    setInterval(() => {
        console.log(`\n[${new Date().toISOString()}] Checking cookies...`);
        main();
    }, 6 * 60 * 60 * 1000);
    
    // Initial check
    main();
} else {
    // Single check
    main();
} 