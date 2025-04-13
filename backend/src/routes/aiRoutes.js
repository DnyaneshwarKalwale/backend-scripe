const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
  generateLinkedInContent, 
  generateImage, 
  processYouTubeTranscript 
} = require('../controllers/aiContentController');

/**
 * @route   POST /api/ai/generate-content
 * @desc    Generate LinkedIn content based on user prompt
 * @access  Private
 */
router.post('/generate-content', protect, generateLinkedInContent);

/**
 * @route   POST /api/ai/generate-image
 * @desc    Generate image for LinkedIn post
 * @access  Private
 */
router.post('/generate-image', protect, generateImage);

/**
 * @route   POST /api/ai/process-transcript
 * @desc    Process YouTube transcript to create LinkedIn content
 * @access  Private
 */
router.post('/process-transcript', protect, processYouTubeTranscript);

module.exports = router; 