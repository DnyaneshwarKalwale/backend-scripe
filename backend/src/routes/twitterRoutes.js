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

// All routes protected by auth middleware
router.use(protect);

// Twitter profile and data routes
router.get('/profile', getTwitterProfile);
router.get('/tweets', getUserTweets);
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