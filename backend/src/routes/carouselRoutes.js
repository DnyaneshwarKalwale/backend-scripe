const express = require('express');
const router = express.Router();
const { 
  getCarousels, 
  getCarousel, 
  createCarousel,
  updateCarousel,
  deleteCarousel,
  downloadCarouselPdf
} = require('../controllers/carouselController');
const { protect } = require('../middleware/authMiddleware');

// All routes are protected with authentication
router.use(protect);

// Base routes
router.route('/')
  .get(getCarousels)
  .post(createCarousel);

// Specific carousel routes
router.route('/:id')
  .get(getCarousel)
  .put(updateCarousel)
  .delete(deleteCarousel);

// Download route
router.get('/:id/download', downloadCarouselPdf);

module.exports = router; 