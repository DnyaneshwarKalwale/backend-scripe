const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { generateLinkedInContent, generateImage, uploadImage, generateCarousel } = require('../controllers/openaiController');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, 'img-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// OpenAI content generation routes
router.post('/generate-content', protect, generateLinkedInContent);
router.post('/generate-image', protect, generateImage);
router.post('/generate-carousel', protect, generateCarousel);
router.post('/upload-image', protect, upload.single('image'), uploadImage);

module.exports = router; 