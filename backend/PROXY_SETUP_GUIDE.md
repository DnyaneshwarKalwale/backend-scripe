# YouTube Proxy Setup Guide

This guide explains how to set up proxy support to bypass YouTube's bot detection on your DigitalOcean server.

## Quick Setup

### Option 1: Use Free Public Proxies (Not recommended for production)

1. **Set environment variables** in your server:
   ```bash
   export USE_PROXY=true
   export PROXY_URL="http://proxy-server:port"
   ```

2. **Add to your .env file**:
   ```
   USE_PROXY=true
   PROXY_URL=http://your-proxy-server:port
   ```

### Option 2: Use SOCKS5 Proxy (Recommended)

1. **Install a SOCKS5 proxy** on your server:
   ```bash
   # Install Dante SOCKS5 proxy
   sudo apt update
   sudo apt install dante-server
   ```

2. **Configure environment variables**:
   ```bash
   export USE_PROXY=true
   export PROXY_URL="socks5://127.0.0.1:1080"
   ```

### Option 3: Use ProxyMesh or Similar Service (Best for production)

1. **Sign up for a proxy service** like ProxyMesh, Bright Data, or similar
2. **Get your proxy credentials**
3. **Set environment variables**:
   ```bash
   export USE_PROXY=true
   export PROXY_URL="http://username:password@proxy-server:port"
   ```

## Free Proxy Lists

Here are some free proxy services you can try:

### HTTP Proxies
- `http://proxy-list.download/api/v1/get?type=http`
- `http://pubproxy.com/api/proxy?format=txt&type=http`

### SOCKS5 Proxies  
- `socks5://proxy-list.download/api/v1/get?type=socks5`

## Testing Your Proxy Setup

1. **Test the proxy connection**:
   ```bash
   curl --proxy "your-proxy-url" "https://httpbin.org/ip"
   ```

2. **Test with yt-dlp**:
   ```bash
   yt-dlp --proxy "your-proxy-url" --dump-json --no-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   ```

## Environment Variables

Add these to your `.env` file or export them:

```bash
# Enable proxy usage
USE_PROXY=true

# Proxy URL (choose one format)
PROXY_URL=http://proxy-server:port                    # HTTP proxy
PROXY_URL=socks5://proxy-server:port                  # SOCKS5 proxy  
PROXY_URL=http://username:password@proxy-server:port  # Authenticated HTTP proxy
```

## Rotating Proxies

For better reliability, you can set up multiple proxies:

```bash
# Multiple proxy URLs separated by commas
PROXY_URLS="http://proxy1:port,http://proxy2:port,socks5://proxy3:port"
```

## Common Proxy Providers

### Free (Limited reliability)
- ProxyNova
- FreeProxyList
- HideMyAss Free

### Paid (Recommended for production)
- ProxyMesh ($10-50/month)
- Bright Data (formerly Luminati)
- Oxylabs
- Smartproxy

## Troubleshooting

### Common Issues

1. **Proxy connection timeout**
   - Increase timeout values
   - Try different proxy servers

2. **Authentication failed**
   - Check username/password
   - Verify proxy URL format

3. **Still getting bot detection**
   - Try rotating between multiple proxies
   - Use residential proxies instead of datacenter proxies

### Testing Commands

```bash
# Test proxy connectivity
curl --proxy "$PROXY_URL" "https://httpbin.org/ip"

# Test with yt-dlp
yt-dlp --proxy "$PROXY_URL" --print duration "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Test multiple strategies
node test-proxy-strategies.js
```

## Security Notes

- Never commit proxy credentials to version control
- Use environment variables for sensitive information
- Consider using encrypted proxy connections
- Rotate proxies regularly to avoid detection

## Performance Tips

- Use proxies geographically close to your server
- Test proxy speed before using in production
- Implement proxy rotation for better reliability
- Monitor proxy health and switch when needed 