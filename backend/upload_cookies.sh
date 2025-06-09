#!/bin/bash

# Check if server IP is provided
if [ -z "$1" ]; then
    echo "Usage: ./upload_cookies.sh <server-ip>"
    echo "Example: ./upload_cookies.sh root@123.456.789.0"
    exit 1
fi

SERVER_IP="$1"
COOKIES_FILE="www.youtube.com_cookies.txt"
REMOTE_PATH="/root/backend-scripe/backend/src/cookies/"

# Check if cookies file exists
if [ ! -f "$COOKIES_FILE" ]; then
    echo "Error: $COOKIES_FILE not found in current directory"
    echo "Please export cookies from Chrome using the 'Get cookies.txt' extension"
    echo "and place the file in the same directory as this script"
    exit 1
fi

# Create remote directory if it doesn't exist
ssh $SERVER_IP "mkdir -p $REMOTE_PATH"

# Upload cookies file
echo "Uploading cookies file to server..."
scp "$COOKIES_FILE" "$SERVER_IP:$REMOTE_PATH"

if [ $? -eq 0 ]; then
    echo "Successfully uploaded cookies file to $SERVER_IP:$REMOTE_PATH"
    echo "Setting proper permissions..."
    ssh $SERVER_IP "chmod 644 $REMOTE_PATH$COOKIES_FILE"
    echo "Restarting backend service..."
    ssh $SERVER_IP "pm2 restart backend"
    echo "Done! The server should now be able to fetch video metadata correctly."
else
    echo "Error uploading cookies file"
    exit 1
fi 