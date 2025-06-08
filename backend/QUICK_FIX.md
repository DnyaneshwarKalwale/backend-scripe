# Quick Fix for Digital Ocean Server Issues

## Issue
Your server is trying to use Windows Python paths on Linux, causing the error:
```
/bin/sh: 1: C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe: not found
```

## Immediate Solution

Run these commands on your Digital Ocean server:

### 1. Install Python 3 and pip (if not already installed)
```bash
sudo apt update -y
sudo apt install -y python3 python3-pip
```

### 2. Install youtube-transcript-api package
```bash
pip3 install youtube-transcript-api
```

### 3. Verify installation
```bash
python3 -c "import youtube_transcript_api; print('Package installed successfully')"
```

### 4. Test the transcript fetcher with Webshare proxy
```bash
cd /root/backend-scripe/backend/src
python3 transcript_fetcher.py dQw4w9WgXcQ
```

### 5. Create/Update .env file
```bash
cd /root/backend-scripe/backend
nano .env
```

Add these lines to the .env file:
```env
NODE_ENV=production
PORT=5000
OPENAI_API_KEY=your_actual_openai_api_key_here
MONGODB_URI=your_mongodb_connection_string_here
```

### 6. Restart PM2
```bash
pm2 restart backend
pm2 logs backend
```

## Verification

After following these steps, your transcript API should work. Test it with:

```bash
curl -X POST https://api.brandout.ai/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

You should see a successful response with transcript content fetched through Webshare proxy.

## What Was Fixed

1. ✅ **Python Path Detection**: Fixed hardcoded Windows paths in `setup_transcript_api.js`
2. ✅ **Webshare Proxy Integration**: Added rotating residential proxy support
3. ✅ **Cross-Platform Compatibility**: Updated code to work on both Windows and Linux
4. ✅ **Package Installation**: Proper pip3 usage for Linux servers
5. ✅ **Environment Variables**: Setup for OpenAI API key and other configs

## Expected Behavior

- YouTube transcript requests will now route through Webshare proxy (`tzlgbidr:p2gjh6cl2hq6`)
- No more IP blocking from YouTube 
- Successful transcript extraction with source: `youtube_transcript_api_with_webshare_proxy` 