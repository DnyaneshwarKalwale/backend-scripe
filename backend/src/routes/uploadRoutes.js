const express = require('express');
const { uploadProfilePicture } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// Upload routes
router.post('/profile-picture', uploadProfilePicture);

module.exports = router; 