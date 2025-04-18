#!/usr/bin/env bash

echo "Starting build process..."

# Print Python version
python3 --version || python --version

# Ensure pip is available and updated
python3 -m pip install --upgrade pip || python -m pip install --upgrade pip

# Install Python dependencies with verbose output
echo "Installing Python dependencies..."
python3 -m pip install -r requirements.txt -v || python -m pip install -r requirements.txt -v

# Install youtube-transcript-api explicitly
echo "Installing youtube-transcript-api explicitly..."
python3 -m pip install youtube-transcript-api==1.0.3 || python -m pip install youtube-transcript-api==1.0.3

# Verify installation
echo "Verifying installation..."
python3 -c "import youtube_transcript_api; print(f'youtube-transcript-api version: {youtube_transcript_api.__version__}')" || python -c "import youtube_transcript_api; print(f'youtube-transcript-api version: {youtube_transcript_api.__version__}')"

# Run dependency check script
echo "Running dependency check script..."
python3 install_deps.py || python install_deps.py

# Create test transcript to verify functionality
echo "Creating test transcript..."
python3 src/transcript_fetcher.py jNQXAC9IVRw > test_transcript.json || python src/transcript_fetcher.py jNQXAC9IVRw > test_transcript.json

# Log completion
echo "Python dependencies installed and verified successfully" 