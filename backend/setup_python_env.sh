#!/bin/bash

# Install python3-venv if not already installed
sudo apt-get update
sudo apt-get install -y python3-venv python3-full

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install required packages
pip install youtube-transcript-api

# Make transcript fetcher executable
chmod +x src/transcript_fetcher.py

# Test the setup
python src/transcript_fetcher.py --test

# Deactivate virtual environment
deactivate

echo "Python environment setup completed" 