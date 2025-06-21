#!/bin/bash

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if MongoDB is running
echo "Checking MongoDB connection..."
if command -v mongod &> /dev/null
then
    echo "MongoDB is installed."
else
    echo "MongoDB is not installed. Please install MongoDB before running the application."
    echo "You can download it from https://www.mongodb.com/try/download/community"
    exit 1
fi

# Start the server
echo "Starting the server..."
npm run dev 