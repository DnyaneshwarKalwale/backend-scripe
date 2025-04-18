const express = require('express');
const router = express.Router();
const { getTranscript, getTranscriptDirect } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');

// Make the route public by removing the protect middleware
router.post('/', getTranscript);

// Add a direct transcript endpoint as fallback
router.post('/direct', getTranscriptDirect);

module.exports = router; 