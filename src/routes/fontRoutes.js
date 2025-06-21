const express = require('express');
const router = express.Router();
const { 
  uploadFont, 
  getFonts, 
  getFont, 
  deleteFont, 
  generateFontCSS,
  upload
} = require('../controllers/fontController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getFonts);
router.get('/:id', getFont);
router.get('/css/fonts.css', generateFontCSS);

// Protected routes
router.post('/', protect, upload.single('fontFile'), uploadFont);
router.delete('/:id', protect, deleteFont);

module.exports = router; 