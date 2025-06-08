#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install required packages
echo "Installing required Python packages..."
pip install youtube-transcript-api requests

echo "Python environment setup complete!"
echo "To activate the environment manually, run: source venv/bin/activate" 