#!/bin/bash

COOKIES_DIR="/root/backend-scripe/backend/src/cookies"
COOKIES_FILE="$COOKIES_DIR/www.youtube.com_cookies.txt"

# Create cookies directory if it doesn't exist
mkdir -p "$COOKIES_DIR"

# Create/overwrite cookies file with header
cat > "$COOKIES_FILE" << 'EOL'
# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file!  Do not edit.

EOL

# Set proper permissions
chmod 644 "$COOKIES_FILE"

echo "Created cookies file at $COOKIES_FILE"
echo "Please paste your cookies data below (press Ctrl+D when done):"
cat >> "$COOKIES_FILE"

echo "Cookies file has been updated."
echo "Setting proper permissions..."
chmod 644 "$COOKIES_FILE"
echo "Restarting backend service..."
pm2 restart backend

echo "Done! The server should now be able to fetch video metadata correctly."
echo "You can verify the cookies file with: cat $COOKIES_FILE" 