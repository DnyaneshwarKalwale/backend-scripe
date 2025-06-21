const express = require('express');
const router = express.Router();
const { processScheduledPosts } = require('../services/schedulerService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Process scheduled posts (for Render cron job)
 * @route   GET /api/cron/process-scheduled-posts
 * @access  Public (but protected by cron job secret)
 */
router.get('/process-scheduled-posts', asyncHandler(async (req, res) => {
  try {
    // Check for the cron job secret to secure this endpoint
    const cronSecret = req.query.secret || req.headers['x-cron-secret'];
    const configuredSecret = process.env.CRON_JOB_SECRET;
    
    if (!cronSecret || cronSecret !== configuredSecret) {
      console.error('Invalid or missing cron job secret');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or missing cron job secret'
      });
    }
    
    console.log('Processing scheduled posts from Render cron job...');
    const result = await processScheduledPosts();
    
    return res.status(200).json({
      success: true,
      message: 'Scheduled posts processed',
      result
    });
  } catch (error) {
    console.error('Error processing scheduled posts from cron job:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled posts',
      error: error.message
    });
  }
}));

module.exports = router; 