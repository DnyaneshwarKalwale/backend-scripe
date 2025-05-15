#!/usr/bin/env bash
# Exit on error
set -e

# Install system dependencies needed for yt-dlp
echo "Installing system dependencies..."
apt-get update -qq
apt-get install -y python3 python3-pip ffmpeg --no-install-recommends

# Create bin directory if it doesn't exist
mkdir -p src/bin

# Navigate to project directory and install dependencies
npm install

# Make sure yt-dlp is executable
echo "Ensuring yt-dlp is executable..."
if [ -f "src/bin/yt-dlp" ]; then
  chmod +x src/bin/yt-dlp
  ls -la src/bin/
  echo "yt-dlp executable permissions set"
else
  echo "yt-dlp not found in src/bin, running installation script..."
  node src/scripts/install-yt-dlp.js
fi

# Verify yt-dlp installation
if [ -f "src/bin/yt-dlp" ]; then
  echo "Testing yt-dlp..."
  src/bin/yt-dlp --version
else
  echo "WARNING: yt-dlp not found after installation script"
  echo "Trying system yt-dlp..."
  
  # Install yt-dlp using pip as a fallback
  echo "Installing yt-dlp using pip..."
  pip3 install -U yt-dlp
  
  # Test system yt-dlp
  yt-dlp --version
fi

echo "Build script completed successfully"
