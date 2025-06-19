#!/bin/bash

echo "=== Installing yt-dlp on DigitalOcean Server ==="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo bash install-ytdlp.sh"
    exit 1
fi

# Update package list
echo "📦 Updating package list..."
apt update

# Install Python and pip if not already installed
echo "🐍 Installing Python and pip..."
apt install -y python3 python3-pip curl

# Install yt-dlp using pip
echo "⬇️ Installing yt-dlp..."
pip3 install yt-dlp

# Alternative: Install using curl (if pip fails)
if ! command -v yt-dlp &> /dev/null; then
    echo "📥 Installing yt-dlp using curl..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    chmod a+rx /usr/local/bin/yt-dlp
fi

# Verify installation
echo "✅ Verifying installation..."
if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp installed successfully!"
    echo "Version: $(yt-dlp --version)"
    echo "Location: $(which yt-dlp)"
else
    echo "❌ yt-dlp installation failed!"
    exit 1
fi

# Test with a sample video
echo "🧪 Testing with sample video..."
if yt-dlp --print duration "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>/dev/null; then
    echo "✅ yt-dlp is working correctly!"
else
    echo "⚠️ yt-dlp installed but test failed. Check network connectivity."
fi

echo "=== Installation complete! ===" 