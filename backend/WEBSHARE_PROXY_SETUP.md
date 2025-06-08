# Webshare Proxy Integration for YouTube Transcript Fetching

## Overview

This document describes the implementation of Webshare rotating residential proxies to bypass YouTube's IP blocking for transcript fetching. The integration helps avoid `RequestBlocked` and `IpBlocked` exceptions when scraping YouTube content.

## Credentials Used

- **Username**: `tzlgbidr`
- **Password**: `p2gjh6cl2hq6`
- **Proxy Type**: Rotating Residential Proxies
- **Endpoint**: `p.webshare.io:80`

## Implementation Details

### 1. YouTube Transcript API Integration

The primary method uses the `youtube-transcript-api` library with Webshare proxy configuration:

```python
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

# Initialize with Webshare proxy
proxy_config = WebshareProxyConfig(
    proxy_username="tzlgbidr",
    proxy_password="p2gjh6cl2hq6"
)

ytt_api = YouTubeTranscriptApi(proxy_config=proxy_config)
transcript_list = ytt_api.list_transcripts(video_id)
```

### 2. Manual Scraping Fallback

For cases where the YouTube Transcript API fails, the manual scraping method also uses Webshare proxies:

```python
from urllib.request import ProxyHandler, build_opener

# Setup proxy handler
proxy_handler = ProxyHandler({
    'http': 'http://tzlgbidr-rotate:p2gjh6cl2hq6@p.webshare.io:80',
    'https': 'http://tzlgbidr-rotate:p2gjh6cl2hq6@p.webshare.io:80'
})

opener = build_opener(proxy_handler, HTTPCookieProcessor(cookie_jar))
```

## Files Modified

### 1. `transcript_fetcher.py`

**Changes Made:**
- Added `WebshareProxyConfig` import
- Modified `get_transcript_with_api()` to use Webshare proxy
- Updated `fetch_transcript_manually()` to use proxy handler
- Added proxy configuration for both HTTP and HTTPS requests
- Updated source identifiers to indicate proxy usage

**Key Functions:**
- `get_transcript_with_api()`: Primary method using youtube-transcript-api with proxy
- `fetch_transcript_manually()`: Fallback method using urllib with proxy

### 2. `youtubeRoutes.js`

**No changes required** - The existing route automatically uses the updated Python script.

## Testing Results

### Successful Test Case

**Video ID**: `dQw4w9WgXcQ` (Rick Astley - Never Gonna Give You Up)

**Results:**
- ✅ Successfully connected through Webshare proxy
- ✅ Fetched 2090 characters of transcript content
- ✅ Identified channel name: "Rick Astley"
- ✅ Language detection: English (en)
- ✅ Source: `youtube_transcript_api_with_webshare_proxy`

**API Response:**
```json
{
  "success": true,
  "transcript": "[♪♪♪] ♪ We're no strangers to love ♪...",
  "language": "English",
  "language_code": "en",
  "is_generated": false,
  "video_id": "dQw4w9WgXcQ",
  "channelTitle": "Rick Astley",
  "source": "youtube_transcript_api_with_webshare_proxy"
}
```

## Benefits

1. **IP Ban Avoidance**: Rotating residential proxies prevent YouTube from blocking your server's IP
2. **High Success Rate**: Residential IPs appear as real users, reducing detection
3. **Automatic Rotation**: Webshare automatically rotates IPs to distribute requests
4. **Fallback Support**: Both primary and fallback methods use proxies
5. **Geographic Distribution**: Access from multiple global locations

## Usage Instructions

### 1. Install Dependencies

Ensure the `youtube-transcript-api` package is installed:

```bash
pip install youtube-transcript-api>=0.6.0
```

### 2. Test the Implementation

```bash
# Test directly with Python script
python transcript_fetcher.py --debug VIDEO_ID

# Test through API endpoint
curl -X POST https://api.brandout.ai/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"videoId": "VIDEO_ID"}'
```

### 3. Monitor Performance

The system provides detailed logging when run in debug mode:

```bash
python transcript_fetcher.py --debug VIDEO_ID
```

**Debug Output Includes:**
- Proxy connection status
- Request timing and delays
- Success/failure indicators
- Character count of fetched transcripts
- Source method identification

## Error Handling

The implementation includes comprehensive error handling:

1. **Proxy Connection Errors**: Falls back to direct connection if proxy fails
2. **YouTube API Errors**: Falls back to manual scraping method
3. **Rate Limiting**: Built-in delays and randomization
4. **Retry Logic**: Multiple attempts with different approaches

## Security Considerations

1. **Credential Protection**: Proxy credentials are embedded in code (consider environment variables for production)
2. **Request Patterns**: Random delays and user agent rotation to avoid detection
3. **Cookie Support**: Maintains session cookies for authenticated requests
4. **SSL/TLS**: All requests use HTTPS where possible

## Monitoring and Maintenance

### Success Indicators

- Source field shows `youtube_transcript_api_with_webshare_proxy` or `manual_scraping_with_webshare_proxy`
- Debug logs show "using Webshare proxy" messages
- Successful transcript extraction with character counts

### Troubleshooting

1. **DNS Resolution Errors**: Check internet connectivity and proxy endpoint
2. **Authentication Failures**: Verify Webshare credentials are correct
3. **Rate Limiting**: Increase delays between requests
4. **Proxy Rotation**: Webshare automatically handles IP rotation

## Cost Considerations

- Webshare charges based on bandwidth usage
- Residential proxies are more expensive than datacenter proxies
- Monitor usage through Webshare dashboard
- Consider upgrading plan if hitting bandwidth limits

## Future Improvements

1. **Environment Variables**: Move credentials to environment variables
2. **Proxy Pool Management**: Implement multiple proxy providers for redundancy
3. **Performance Metrics**: Add detailed timing and success rate tracking
4. **Dynamic Configuration**: Allow proxy settings to be configured via API

## Support

For issues related to:
- **Webshare Proxy**: Contact Webshare support at their dashboard
- **YouTube Transcript API**: Check the library documentation
- **Implementation Issues**: Review debug logs and error messages

---

**Implementation Date**: January 2025  
**Status**: ✅ Active and Working  
**Last Tested**: Successfully tested with video `dQw4w9WgXcQ` 