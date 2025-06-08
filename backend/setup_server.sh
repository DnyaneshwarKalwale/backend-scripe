#!/bin/bash

# Digital Ocean Server Setup Script for YouTube Transcript API with Webshare Proxy
# This script fixes Python path issues and installs required dependencies

echo "🚀 Setting up Digital Ocean server for YouTube transcript fetching..."

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script is designed for Linux servers (Digital Ocean)"
    exit 1
fi

# Update system packages
echo "📦 Updating system packages..."
sudo apt update -y

# Install Python 3 and pip if not already installed
echo "🐍 Installing Python 3 and pip..."
sudo apt install -y python3 python3-pip python3-venv

# Verify Python installation
echo "✅ Checking Python installation..."
python3 --version
pip3 --version

# Install youtube-transcript-api package
echo "📺 Installing youtube-transcript-api package..."
pip3 install youtube-transcript-api

# Verify the package installation
echo "🔍 Verifying youtube-transcript-api installation..."
python3 -c "import youtube_transcript_api; print('✅ youtube-transcript-api is installed successfully')"

# Make the transcript fetcher executable
echo "🔧 Setting permissions for transcript_fetcher.py..."
chmod +x /root/backend-scripe/backend/src/transcript_fetcher.py

# Test the transcript fetcher with Webshare proxy
echo "🧪 Testing transcript fetcher with Webshare proxy..."
cd /root/backend-scripe/backend/src
python3 transcript_fetcher.py dQw4w9WgXcQ

# Install Node.js dependencies if needed
echo "📦 Installing Node.js dependencies..."
cd /root/backend-scripe/backend
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Creating .env file..."
    cat > .env << EOF
NODE_ENV=production
PORT=5000
OPENAI_API_KEY=your_openai_api_key_here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/your_database

# Add other environment variables as needed
EOF
    echo "📝 Created .env file. Please update it with your actual values:"
    echo "   - OPENAI_API_KEY: Your OpenAI API key"
    echo "   - MONGODB_URI: Your MongoDB connection string"
fi

# Check PM2 installation
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

echo "✅ Server setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env file with your actual API keys and database URLs"
echo "2. Restart your PM2 process: pm2 restart backend"
echo "3. Check logs: pm2 logs backend"
echo ""
echo "🔧 Webshare proxy is now configured and ready to use!" 