const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTwitterProfile,
  getUserTweets,
  getTwitterAnalytics,
  saveTweets,
  getSavedTweets,
  deleteTweet,
  getSavedTweetsByUser,
  getSavedUsers,
  deleteTweetsByUser
} = require('../controllers/twitterController');

// Setup CORS handlers specifically for Twitter routes
router.use((req, res, next) => {
  // Get the origin
  const origin = req.headers.origin;
  
  // Dynamically set Access-Control-Allow-Origin
  if (origin) {
    // Allow all brandout.ai origins explicitly
    if (origin.endsWith('brandout.ai') || 
        origin.endsWith('netlify.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      // For other origins, still allow them but log
      console.log(`Twitter Routes: Origin ${origin} accessing API`);
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Public routes (no authentication required) - for reading Twitter data
router.get('/user/:username', getUserTweets);
router.get('/tweets', getUserTweets);

// Protected routes (authentication required) - for user-specific operations
router.use(protect);

// Twitter profile and analytics routes
router.get('/profile', getTwitterProfile);
router.get('/analytics', getTwitterAnalytics);

// Get all users who have saved tweets
router.get('/saved/users', getSavedUsers);

// Get all saved tweets
router.get('/saved', getSavedTweets);

// Get saved tweets by specific user
router.get('/saved/user/:username', getSavedTweetsByUser);

// Save selected tweets
router.post('/save', saveTweets);

// Delete a saved tweet
router.delete('/:id', deleteTweet);

// Delete all tweets for a specific user
router.delete('/user/:username', deleteTweetsByUser);

// Error handling middleware specific to Twitter routes
router.use((err, req, res, next) => {
  console.error('Twitter API error:', err);
  
  // Set CORS headers even when errors occur
  const origin = req.headers.origin;
  if (origin) {
    // For brandout.ai domains and localhost, use the specific origin
    if (origin.endsWith('brandout.ai') || 
        origin.endsWith('netlify.app') || 
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      console.log(`Twitter Error handler: Origin ${origin} accessing API`);
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle payload too large errors specifically
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request payload too large. Please reduce the size of your request.',
      error: err.message
    });
  }
  
  // Handle other errors
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: err.toString()
  });
});

module.exports = router; 