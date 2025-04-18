const express = require('express');
const router = express.Router();
const { getTranscript } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');

// Routes need authentication
router.post('/', protect, getTranscript);

module.exports = router; 