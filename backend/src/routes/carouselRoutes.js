const express = require('express');
const router = express.Router();
const { 
  createCarousel, 
  getCarousels, 
  getCarousel, 
  updateCarousel,
  deleteCarousel,
  downloadCarouselPdf,
  completeCarouselRequest,
  deleteCarouselRequest
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
const mongoose = require('mongoose');
const CarouselRequest = require('../models/carouselRequestModel');

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
router.delete('/requests/:id', protect, deleteCarouselRequest);

// Add endpoint for resending rejected requests
router.post('/requests/:id/resend', protect, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { content, files, title, description, carouselType } = req.body;
    const isContentModified = !!content || !!files || !!title || !!description || !!carouselType;

    // Find the request
    const request = await CarouselRequest.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }

    // Check if user is authorized
    if (request.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to resend this request'
      });
    }

    // Check if request is rejected
    if (request.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Only rejected requests can be resent'
      });
    }

    // STRICT CHECK: Allow only one resend per request
    if (request.resendCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'This request has already been resent once and cannot be resent again'
      });
    }

    // If content is being modified, store original version the first time
    if (isContentModified && !request.originalContent) {
      request.originalContent = {
        content: request.content,
        files: request.files,
        title: request.title,
        description: request.description,
        carouselType: request.carouselType
      };
    }

    // Update content if provided
    if (isContentModified) {
      request.isModified = true;
      if (content) request.content = content;
      if (title) request.title = title;
      if (description) request.description = description;
      if (carouselType) request.carouselType = carouselType;
      // We'll handle files separately if needed
    }

    // Increment resend count
    request.resendCount = 1; // Explicitly set to 1 to ensure it's only incremented once

    // Update status back to pending
    request.status = 'pending';
    request.updatedAt = new Date();
    
    await request.save();

    res.status(200).json({
      success: true,
      message: 'Carousel request resent successfully',
      data: request
    });
  } catch (error) {
    console.error('Error resending carousel request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend carousel request',
      error: error.message
    });
  }
});

// Admin routes
router.get('/admin/requests', protect, admin, getAdminRequests);
router.post('/admin/requests/:id/status', protect, admin, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    // Validate status is one of the allowed values
    const validStatuses = ['pending', 'in_progress', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    // Find the request by ID or uuid (using the id field)
    const request = await CarouselRequest.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ]
    });
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }
    
    // Update the status and save
    request.status = status;
    request.updatedAt = new Date();
    
    // Additional field for admin notes if provided
    if (req.body.adminNotes) {
      request.adminNotes = req.body.adminNotes;
    }
    
    // Save the updated request
    await request.save();
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Request status updated successfully',
      data: request
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update request status',
      error: error.message
    });
  }
});
router.post('/requests/:id/complete', protect, admin, upload.array('files', 5), fileUploadLogger, completeCarouselRequest);

module.exports = router; 