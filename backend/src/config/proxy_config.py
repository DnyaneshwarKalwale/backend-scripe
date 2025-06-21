#!/usr/bin/env python3
"""
Lightning Proxies configuration for Python transcript fetching
This configuration is used by transcript_fetcher.py
"""

import os

# Lightning Proxies configuration
PROXY_CONFIG = {
    'host': 'res-ww.lightningproxies.net',
    'port': '9999',
    'username': 'nvizglwiborhznm163317-zone-lightning',
    'password': 'nuuxkavzjt',
    'enabled': True  # Set to False to disable proxy
}

def get_proxy_config():
    """Get proxy configuration for requests."""
    if not PROXY_CONFIG['enabled']:
        return None
    
    proxy_url = f"http://{PROXY_CONFIG['username']}:{PROXY_CONFIG['password']}@{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
    return {
        'http': proxy_url,
        'https': proxy_url
    }

def get_urllib_proxy_handler():
    """Get proxy handler for urllib."""
    import urllib.request
    
    if not PROXY_CONFIG['enabled']:
        return None
    
    proxy_url = f"http://{PROXY_CONFIG['username']}:{PROXY_CONFIG['password']}@{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
    proxy_handler = urllib.request.ProxyHandler({
        'http': proxy_url,
        'https': proxy_url
    })
    return proxy_handler

def log_proxy_status():
    """Log proxy status."""
    if PROXY_CONFIG['enabled']:
        print(f"[PROXY] Proxy enabled: {PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}", flush=True)
    else:
        print("[PROXY] Proxy disabled", flush=True)

def is_proxy_enabled():
    """Check if proxy is enabled."""
    return PROXY_CONFIG['enabled']

def get_proxy_host_port():
    """Get proxy host and port for logging."""
    if PROXY_CONFIG['enabled']:
        return f"{PROXY_CONFIG['host']}:{PROXY_CONFIG['port']}"
    return None 