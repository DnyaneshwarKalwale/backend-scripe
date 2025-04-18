#!/usr/bin/env bash
# Install system packages
echo "Starting build script..."

# Update package information
apt-get update -y

# Install Python and pip if they don't exist
which python3 || apt-get install -y python3
which pip3 || apt-get install -y python3-pip

# Print Python and pip versions
python3 --version
pip3 --version

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install youtube-transcript-api==1.0.3

# Set executable permission on the Python script
chmod +x ./transcript_fetcher.py

echo "Build script completed." 