/**
 * Utility script to manually check and process scheduled posts
 * Run this with: node src/utils/checkScheduled.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { processScheduledPosts } = require('../services/schedulerService');

async function checkScheduledPosts() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected');
    
    console.log('Checking for scheduled posts to publish...');
    const results = await processScheduledPosts();
    
    console.log('Results:', JSON.stringify(results, null, 2));
    
    console.log('Processed', results.total, 'posts');
    console.log('Success:', results.success);
    console.log('Failed:', results.failed);
    
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
checkScheduledPosts(); 