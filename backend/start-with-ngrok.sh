#!/bin/bash

echo "Starting backend server and ngrok tunnel..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok is not installed or not in PATH."
    echo "Please install ngrok from https://ngrok.com/download"
    exit 1
fi

# Start backend server in background
echo "Starting backend server..."
npm run dev &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start... (5 seconds)"
sleep 5

# Start ngrok
echo "Starting ngrok tunnel to localhost:5000"
ngrok http 5000

# When ngrok is closed, kill the server
echo "Shutting down backend server..."
kill $SERVER_PID

echo "Remember to update your Twitter app settings with the ngrok URL"
echo "And update your .env file with the new callback URLs" 