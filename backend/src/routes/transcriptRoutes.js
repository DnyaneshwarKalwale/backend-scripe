const express = require('express');
const router = express.Router();
const { getTranscript } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');

// Make the route public by removing the protect middleware
router.post('/', getTranscript);

module.exports = router; 