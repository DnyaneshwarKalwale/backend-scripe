const express = require('express');
const router = express.Router();
const { 
  createCarousel, 
  getCarousels, 
  getCarousel, 
  updateCarousel,
  deleteCarousel,
  downloadCarouselPdf,
  completeCarouselRequest
} = require('../controllers/carouselController');
const {
  submitCarouselRequest,
  getAdminRequests,
  getRequestById,
  updateRequestStatus,
  getUserRequests
} = require('../controllers/carouselRequestController');
const { protect, admin, checkUserLimit } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads');
    // Ensure directory exists
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure upload limits
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware to log file uploads
const fileUploadLogger = (req, res, next) => {
  console.log('File upload request received');
  console.log('Files:', req.files);
  console.log('Body:', req.body);
  next();
};

// Regular carousel routes
router.get('/', protect, getCarousels);
router.get('/:id', protect, getCarousel);
router.post('/', protect, createCarousel);
router.put('/:id', protect, updateCarousel);
router.delete('/:id', protect, deleteCarousel);
router.get('/:id/download', protect, downloadCarouselPdf);

// Carousel request routes
router.post('/submit-request', protect, checkUserLimit, upload.array('files', 5), submitCarouselRequest);
router.get('/user/requests', protect, getUserRequests);
router.get('/requests/:id', protect, getRequestById);

// Admin routes
router.get('/admin/requests', protect, admin, getAdminRequests);
router.patch('/requests/:id/status', protect, admin, updateRequestStatus);
router.post('/requests/:id/complete', protect, admin, upload.array('files', 5), fileUploadLogger, completeCarouselRequest);

module.exports = router; 