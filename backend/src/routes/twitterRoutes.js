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

// Public routes (no authentication required) - for reading Twitter data
router.get('/user/:username', getUserTweets);
router.get('/user/:username/quick', async (req, res) => {
  // Quick response endpoint - returns cached data immediately or basic fetch
  req.query.quickResponse = 'true';
  return getUserTweets(req, res);
});
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

module.exports = router; 