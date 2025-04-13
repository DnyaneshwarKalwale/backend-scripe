const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const {
  getYouTubeTranscript,
  generateLinkedInContent,
  generateImage,
  uploadImage
} = require('../controllers/aiContentController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// YouTube transcript routes
router.post('/youtube-transcript', protect, getYouTubeTranscript);

// LinkedIn content generation routes
router.post('/generate-linkedin-content', protect, generateLinkedInContent);

// Image generation and upload routes
router.post('/generate-image', protect, generateImage);
router.post('/upload-image', protect, upload.single('image'), uploadImage);

module.exports = router; 