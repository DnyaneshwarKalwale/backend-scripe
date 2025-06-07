# YouTube Cookies Setup Guide

This guide will help you set up YouTube cookies to bypass bot detection when fetching transcripts.

## Why Cookies Are Needed

YouTube has implemented bot detection that blocks automated requests. To bypass this, we need to use cookies from an authenticated browser session.

## Step 1: Export YouTube Cookies

### Method 1: Using Browser Extension (Recommended)

1. **Install a Cookie Exporter Extension:**
   - For Chrome: "Get cookies.txt LOCALLY" or "cookies.txt"
   - For Firefox: "cookies.txt" extension

2. **Export YouTube Cookies:**
   - Go to `https://www.youtube.com`
   - Make sure you're logged in to your YouTube account
   - Click the extension icon
   - Select "Export" or "Download"
   - Choose "Netscape format" or "cookies.txt format"
   - Save the file as `www.youtube.com_cookies.txt`

### Method 2: Using yt-dlp (Alternative)

```bash
# This will extract cookies from your browser
yt-dlp --cookies-from-browser chrome --print-traffic https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

## Step 2: Place Cookies File

1. **Create the cookies directory:**
   ```bash
   mkdir -p backend-scripe/backend/toutube_cookies
   ```

2. **Copy your cookies file:**
   - Place the exported `www.youtube.com_cookies.txt` file in:
   ```
   backend-scripe/backend/toutube_cookies/www.youtube.com_cookies.txt
   ```

## Step 3: Verify Setup

The cookies file should look like this:
```
# Netscape HTTP Cookie File
# This is a generated file!  Do not edit.

.youtube.com	TRUE	/	FALSE	1234567890	VISITOR_INFO1_LIVE	abcdef123456
.youtube.com	TRUE	/	TRUE	1234567890	YSC	xyz789
# ... more cookies
```

## Step 4: Test the Setup

1. **Start your backend server:**
   ```bash
   cd backend-scripe/backend
   npm start
   ```

2. **Test transcript fetching:**
   - Try fetching a transcript from your frontend
   - Check the backend logs for messages like:
     - "Loading cookies from: ..."
     - "Loaded X cookies"
     - "Using cookies for YouTube Transcript API"

## Troubleshooting

### Common Issues:

1. **"Cookies file not found"**
   - Verify the file path: `backend-scripe/backend/toutube_cookies/www.youtube.com_cookies.txt`
   - Check file permissions

2. **"Still getting 401 errors"**
   - Make sure you're logged into YouTube when exporting cookies
   - Try refreshing your YouTube session and re-exporting cookies
   - Ensure the cookies file is in Netscape format

3. **"Cookies expired"**
   - YouTube cookies expire regularly
   - Re-export cookies from your browser
   - Consider setting up automated cookie refresh

### Cookie Refresh

YouTube cookies should be refreshed periodically (every few days to weeks). You can:

1. **Manual refresh:** Re-export cookies when they stop working
2. **Automated refresh:** Set up a script to periodically export fresh cookies

## Security Notes

- **Keep cookies private:** Never commit cookies to version control
- **Use dedicated account:** Consider using a dedicated YouTube account for scraping
- **Monitor usage:** Be aware of YouTube's rate limits and terms of service

## File Structure

After setup, your directory should look like:
```
backend-scripe/
├── backend/
│   ├── toutube_cookies/
│   │   └── www.youtube.com_cookies.txt  ← Your cookies file
│   ├── src/
│   │   ├── transcript_fetcher.py        ← Updated with cookie support
│   │   └── server.js                    ← Updated with cookie support
│   └── ...
```

## Testing Commands

```bash
# Test Python script directly
cd backend-scripe/backend/src
python transcript_fetcher.py VIDEO_ID

# Test with debug output
python transcript_fetcher.py --debug VIDEO_ID
```

Replace `VIDEO_ID` with an actual YouTube video ID (e.g., `dQw4w9WgXcQ`). 