const express = require('express');
const router = express.Router();
const { getTranscript } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');

// Make transcript endpoint public
router.post('/', getTranscript);

module.exports = router; 