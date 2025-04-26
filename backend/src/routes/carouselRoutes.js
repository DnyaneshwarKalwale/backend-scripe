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
const { protect, admin } = require('../middleware/authMiddleware');
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

// All routes are protected with authentication
router.use(protect);

// Regular carousel routes
router.route('/')
  .post(createCarousel)
  .get(getCarousels);

// Individual carousel routes
router.route('/:id')
  .get(getCarousel)
  .put(updateCarousel)
  .delete(deleteCarousel);

// Download route
router.get('/:id/download', downloadCarouselPdf);

// Carousel request routes
router.post('/submit-request', upload.array('files', 5), submitCarouselRequest);
router.get('/user/requests', getUserRequests);
router.get('/requests/:id', getRequestById);

// Admin routes
router.get('/admin/requests', admin, getAdminRequests);
router.patch('/requests/:id/status', admin, updateRequestStatus);
router.post('/requests/:id/complete', admin, upload.array('files', 5), fileUploadLogger, completeCarouselRequest);

module.exports = router; 