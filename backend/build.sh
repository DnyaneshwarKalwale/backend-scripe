#!/usr/bin/env bash

# Debug information
echo "==== Environment Information ===="
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Python version: $(python3 --version)"
echo "Python path: $(which python3)"
echo "Current directory: $(pwd)"
echo "===============================\n"

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt || {
  echo "Failed to install Python dependencies with pip"
  echo "Trying pip3..."
  pip3 install -r requirements.txt || {
    echo "ERROR: Failed to install Python dependencies"
    exit 1
  }
}

# Verify installation
echo "Verifying youtube-transcript-api installation..."
python3 -c "import youtube_transcript_api; print(f'youtube-transcript-api version: {youtube_transcript_api.__version__}')" || {
  echo "WARNING: youtube-transcript-api is not installed correctly"
}

echo "Python dependencies installed successfully" 