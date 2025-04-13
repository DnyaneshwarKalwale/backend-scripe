const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getTranscript, convertToLinkedIn } = require('../controllers/youtubeController');

// YouTube routes
router.post('/transcript', protect, getTranscript);
router.post('/to-linkedin', protect, convertToLinkedIn);

module.exports = router; 