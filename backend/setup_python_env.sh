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
pip install --upgrade pip
pip install youtube-transcript-api
pip install requests
pip install beautifulsoup4

# Install yt-dlp
echo "Installing yt-dlp..."
if [ "$(uname)" == "Darwin" ]; then
    # macOS
    brew install yt-dlp
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
    # Linux
    sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
else
    # Windows
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o src/yt-dlp.exe
fi

# Create necessary directories
mkdir -p src/cookies transcripts uploads
chmod 755 src/cookies transcripts uploads

echo "Python environment setup complete!"
echo "To activate the environment manually, run: source venv/bin/activate" 