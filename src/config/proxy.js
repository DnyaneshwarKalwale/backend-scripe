// Lightning Proxies configuration for transcript fetching
// This configuration is used across all transcript fetching methods

const PROXY_CONFIG = {
  host: 'res-ww.lightningproxies.net',
  port: '9999',
  username: 'nvizglwiborhznm163317-zone-lightning',
  password: 'nuuxkavzjt',
  enabled: true  // Set to false to disable proxy globally
};

/**
 * Get proxy configuration for HTTP requests (axios, fetch, etc.)
 * @returns {Object|null} Proxy configuration object or null if disabled
 */
function getHttpProxyConfig() {
  if (!PROXY_CONFIG.enabled) {
    return null;
  }
  
  return {
    protocol: 'http',
    host: PROXY_CONFIG.host,
    port: parseInt(PROXY_CONFIG.port),
    auth: {
      username: PROXY_CONFIG.username,
      password: PROXY_CONFIG.password
    }
  };
}

/**
 * Get proxy URL for requests library
 * @returns {Object|null} Proxy URLs object or null if disabled
 */
function getRequestsProxyConfig() {
  if (!PROXY_CONFIG.enabled) {
    return null;
  }
  
  const proxyUrl = `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
  return {
    http: proxyUrl,
    https: proxyUrl
  };
}

/**
 * Get proxy URL string for command line tools (yt-dlp, etc.)
 * @returns {string} Proxy URL string or empty string if disabled
 */
function getCommandLineProxyUrl() {
  if (!PROXY_CONFIG.enabled) {
    return '';
  }
  
  return `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
}

/**
 * Get proxy options for yt-dlp command
 * @returns {string} Proxy options string or empty string if disabled
 */
function getYtDlpProxyOptions() {
  if (!PROXY_CONFIG.enabled) {
    return '';
  }
  
  const proxyUrl = getCommandLineProxyUrl();
  return `--proxy "${proxyUrl}"`;
}

/**
 * Get urllib proxy handler configuration for Python
 * @returns {Object|null} Proxy handler config or null if disabled
 */
function getUrllibProxyConfig() {
  if (!PROXY_CONFIG.enabled) {
    return null;
  }
  
  const proxyUrl = getCommandLineProxyUrl();
  return {
    http: proxyUrl,
    https: proxyUrl
  };
}

/**
 * Log proxy status
 */
function logProxyStatus() {
  if (PROXY_CONFIG.enabled) {
    console.log(`🔗 Proxy enabled: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  } else {
    console.log('🚫 Proxy disabled');
  }
}

module.exports = {
  PROXY_CONFIG,
  getHttpProxyConfig,
  getRequestsProxyConfig,
  getCommandLineProxyUrl,
  getYtDlpProxyOptions,
  getUrllibProxyConfig,
  logProxyStatus
}; 