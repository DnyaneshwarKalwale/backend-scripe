#!/usr/bin/env bash
# Build script for Render.com deployment

# Exit on error
set -e

# Print Python version
echo "Python version:"
python3 --version

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

# Make Python script executable
echo "Making transcript_fetcher.py executable..."
chmod +x src/transcript_fetcher.py

# Print confirmation
echo "Python setup completed. youtube-transcript-api installation:"
python3 -c "import youtube_transcript_api; print('youtube-transcript-api successfully installed')"

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

echo "Build completed successfully!" 