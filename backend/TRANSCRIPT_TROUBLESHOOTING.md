# YouTube Transcript Troubleshooting Guide

## Current Issue: 500 Internal Server Error

You're experiencing 500 errors when trying to fetch YouTube transcripts. This is due to YouTube's enhanced bot detection system.

## Root Cause Analysis

Based on the logs, the issue is:

1. **YouTube Bot Detection**: YouTube is blocking automated requests even with valid cookies
2. **Empty Responses**: YouTube returns empty responses instead of transcript data
3. **Enhanced Security**: YouTube has implemented more sophisticated detection beyond cookies

## Immediate Solutions

### Option 1: Use Fresh Browser Session (Recommended)

The most reliable solution is to extract cookies from an active browser session:

1. **Open YouTube in your browser**
2. **Log in to your account**
3. **Watch a few videos** (to establish a normal session)
4. **Export fresh cookies** using a browser extension:
   - Chrome: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"

5. **Replace the cookies file**:
   ```bash
   # Backup current cookies
   cp toutube_cookies/www.youtube.com_cookies.txt toutube_cookies/backup.txt
   
   # Replace with fresh cookies
   # Place your new cookies file at: toutube_cookies/www.youtube.com_cookies.txt
   ```

### Option 2: Alternative Transcript Sources

If YouTube continues to block requests, consider these alternatives:

1. **Manual Transcript Extraction**:
   - Use browser automation tools like Puppeteer/Playwright
   - Extract transcripts through browser automation

2. **Third-party Services**:
   - Use services like AssemblyAI or Rev.ai for audio transcription
   - Download audio and transcribe separately

3. **YouTube Data API v3**:
   - Use official YouTube API (requires API key)
   - Limited but more reliable for metadata

### Option 3: Enhanced Anti-Detection

If you want to continue with the current approach:

1. **Update User Agents**: Use the latest browser user agents
2. **Add Delays**: Implement random delays between requests
3. **Rotate IPs**: Use proxy rotation if possible
4. **Browser Automation**: Use headless browsers instead of direct HTTP requests

## Testing Your Setup

### 1. Test Cookie Validity
```bash
npm run check-cookies
```

### 2. Test with Different Videos
Try videos that definitely have captions:
- Educational content (Khan Academy, TED Talks)
- News videos (BBC, CNN)
- Popular music videos with lyrics

### 3. Test Python Script Directly
```bash
cd src
py transcript_fetcher.py --debug VIDEO_ID
```

## Current System Status

✅ **Working Components**:
- Cookie loading (22 cookies loaded successfully)
- Python script execution
- yt-dlp binary available
- Request session creation

❌ **Failing Components**:
- YouTube transcript API (returns empty responses)
- Manual scraping (no caption tracks found)
- yt-dlp extraction (bot detection)

## Recommended Next Steps

### Immediate (Next 30 minutes):
1. **Export fresh cookies** from your browser
2. **Test with a simple video** that has captions
3. **Check if the specific video** `2QbMkODGVPw` actually has transcripts

### Short-term (Next few days):
1. **Implement browser automation** using Puppeteer
2. **Add proxy rotation** if available
3. **Consider alternative transcript sources**

### Long-term (Next week):
1. **Migrate to YouTube Data API v3** for metadata
2. **Implement audio download + transcription** pipeline
3. **Add fallback mechanisms** for different video types

## Code Changes Made

We've implemented:
- ✅ Enhanced cookie authentication
- ✅ Multiple authentication methods
- ✅ Better error handling and logging
- ✅ Anti-detection headers and delays
- ✅ Fallback mechanisms

## Alternative Implementation

If the current approach continues to fail, here's a browser automation approach:

```javascript
// Using Puppeteer for transcript extraction
const puppeteer = require('puppeteer');

async function getTranscriptWithBrowser(videoId) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    // Navigate to video
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`);
    
    // Click on transcript button
    await page.click('[aria-label="Show transcript"]');
    
    // Extract transcript text
    const transcript = await page.evaluate(() => {
        const segments = document.querySelectorAll('[data-seq]');
        return Array.from(segments).map(seg => seg.textContent).join(' ');
    });
    
    await browser.close();
    return transcript;
}
```

## Contact & Support

If you continue experiencing issues:

1. **Check YouTube's Terms of Service** for any recent changes
2. **Monitor rate limits** - YouTube may be temporarily blocking your IP
3. **Consider using official APIs** for production applications
4. **Test from different networks** to rule out IP-based blocking

## Quick Fix Commands

```bash
# Check current setup
npm run test-cookies

# Refresh cookies (manual process)
npm run refresh-cookies

# Test specific video
py src/transcript_fetcher.py --debug VIDEO_ID

# Check server logs
tail -f /root/.pm2/logs/backend-error.log
```

Remember: YouTube's bot detection is constantly evolving. What works today might not work tomorrow. Always have fallback mechanisms in place. 