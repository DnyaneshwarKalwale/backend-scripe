const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTwitterProfile,
  getUserTweets,
  getTwitterAnalytics
} = require('../controllers/twitterController');

// All routes protected by auth middleware
router.use(protect);

// Twitter profile and data routes
router.get('/profile', getTwitterProfile);
router.get('/tweets', getUserTweets);
router.get('/analytics', getTwitterAnalytics);

module.exports = router; 