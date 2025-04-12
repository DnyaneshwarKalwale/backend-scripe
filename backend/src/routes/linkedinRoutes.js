const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getLinkedInProfile,
  getLinkedInAnalytics
} = require('../controllers/linkedinController');

// All routes protected by auth middleware
router.use(protect);

// LinkedIn profile and data routes
router.get('/profile', getLinkedInProfile);
router.get('/analytics', getLinkedInAnalytics);

module.exports = router; 