# Proxy-Enabled YouTube Video Metadata Fetching

## Overview

This update adds proxy support to YouTube video metadata scraping, which fixes the issue where video durations were showing as "N/A". The system now uses Lightning Proxies for all YouTube scraping operations, including:

1. **Channel information fetching**
2. **RSS feed fetching** 
3. **Video duration and metadata scraping**
4. **yt-dlp operations** (already had proxy support)

## Changes Made

### 1. Updated YouTube Controller (`src/controllers/youtubeController.js`)

- Added proxy configuration import: `const { getHttpProxyConfig, logProxyStatus } = require('../config/proxy');`
- Enhanced channel info fetching with proxy support
- Enhanced RSS feed fetching with proxy support  
- Completely rewrote video duration fetching logic with:
  - Proxy configuration for all requests
  - Better error handling and logging
  - Multiple regex patterns for duration extraction
  - Enhanced headers to mimic real browser requests
  - Reduced batch size (5 videos per batch) for better reliability
  - Added delays between batches to be respectful

### 2. New Video Metadata Endpoint (`src/routes/youtubeRoutes.js`)

Added a new endpoint: `POST /api/youtube/video-metadata`

This endpoint provides enhanced metadata fetching for individual videos using proxy-enabled scraping. It extracts:
- **Duration** (multiple format patterns)
- **Title** 
- **Channel name**
- **View count**
- **Upload date**
- **Thumbnail URL**

### 3. Enhanced Proxy Configuration

The existing proxy configuration in `src/config/proxy.js` is now used throughout the YouTube scraping system:

```javascript
// Lightning Proxies configuration
const PROXY_CONFIG = {
  host: 'res-ww.lightningproxies.net',
  port: '9999', 
  username: 'nvizglwiborhznm163317-zone-lightning',
  password: 'nuuxkavzjt',
  enabled: true
};
```

## API Endpoints

### Enhanced Channel Videos
```
POST /api/youtube/channel
Body: { "channelName": "@mkbhd" }
```
Now returns videos with accurate durations fetched via proxy.

### New Video Metadata Endpoint
```
POST /api/youtube/video-metadata  
Body: { "videoId": "dQw4w9WgXcQ" }
```
Returns enhanced metadata for a single video.

### Existing yt-dlp Transcript Endpoint
```
POST /api/youtube/transcript-yt-dlp
Body: { "videoId": "dQw4w9WgXcQ" }
```
Already had proxy support, now enhanced with better fallback scraping.

## Testing

A test script is provided: `test-video-metadata.js`

Run it with:
```bash
node test-video-metadata.js
```

This tests:
1. Individual video metadata fetching
2. Channel videos fetching with duration extraction
3. Proxy usage confirmation

## Expected Results

### Before (without proxy):
- Video durations: "N/A" 
- Channel info: Often failed or incomplete
- Transcript fetching: Limited success

### After (with proxy):
- Video durations: Accurate (e.g., "4:32", "1:23:45")
- Channel info: Reliable fetching
- All metadata: Complete and accurate
- Transcript fetching: Much more reliable

## Troubleshooting

### If durations still show "N/A":

1. **Check proxy configuration**: Verify Lightning Proxies credentials in `src/config/proxy.js`
2. **Check server logs**: Look for "Using proxy for video X metadata fetching" messages
3. **Test proxy connectivity**: Use the test script to verify proxy is working
4. **Check rate limiting**: YouTube may still block requests if too many are made too quickly

### Server logs to look for:

```
🔗 Proxy enabled: res-ww.lightningproxies.net:9999
Using proxy for video dQw4w9WgXcQ metadata fetching
Duration found for dQw4w9WgXcQ: 3:33 (pattern: /"lengthSeconds":"(\d+)"/)
```

## Performance Considerations

- **Batch processing**: Videos are processed in batches of 5 to avoid overwhelming the proxy
- **Rate limiting**: 1-second delays between batches
- **Timeout handling**: 10-15 second timeouts for all requests
- **Fallback patterns**: Multiple regex patterns for better reliability

## Security

- Proxy credentials are stored in configuration files
- All requests use HTTPS where possible
- User-Agent strings mimic real browsers
- No sensitive data is logged

## Future Improvements

1. **Caching**: Add Redis caching for frequently requested video metadata
2. **Retry logic**: Implement exponential backoff for failed requests  
3. **Multiple proxies**: Rotate between different proxy endpoints
4. **Database storage**: Store fetched metadata for faster subsequent requests 