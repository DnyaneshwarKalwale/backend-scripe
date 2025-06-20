const asyncHandler = require('express-async-handler');
const Carousel = require('../models/carouselModel');
const path = require('path');
const fs = require('fs');
const { createPdf } = require('../utils/pdfGenerator');
const mongoose = require('mongoose');
const CarouselRequest = require('../models/carouselRequestModel');

// @desc    Get all carousels for a user
// @route   GET /api/carousels
// @access  Private
const getCarousels = asyncHandler(async (req, res) => {
  const carousels = await Carousel.find({ user: req.user.id });
  res.status(200).json(carousels);
});

// @desc    Get a single carousel
// @route   GET /api/carousels/:id
// @access  Private
const getCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  res.status(200).json(carousel);
});

// @desc    Create a new carousel
// @route   POST /api/carousels
// @access  Private
const createCarousel = asyncHandler(async (req, res) => {
  const { title, description, slides, status, thumbnailUrl } = req.body;

  if (!title || !description || !slides || !Array.isArray(slides)) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  // Create carousel
  const carousel = await Carousel.create({
    user: req.user.id,
    title,
    description,
    slides,
    slideCount: slides.length,
    status: status || 'draft',
    thumbnailUrl: thumbnailUrl || '',
  });

  res.status(201).json(carousel);
});

// @desc    Update a carousel
// @route   PUT /api/carousels/:id
// @access  Private
const updateCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Update slideCount if slides are provided
  if (req.body.slides && Array.isArray(req.body.slides)) {
    req.body.slideCount = req.body.slides.length;
  }

  // If status changes to published, set publishDate
  if (req.body.status === 'published' && carousel.status !== 'published') {
    req.body.publishDate = new Date();
  }

  const updatedCarousel = await Carousel.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.status(200).json(updatedCarousel);
});

// @desc    Delete a carousel
// @route   DELETE /api/carousels/:id
// @access  Private
const deleteCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  await Carousel.findByIdAndDelete(req.params.id);

  res.status(200).json({ id: req.params.id });
});

// @desc    Download carousel as PDF
// @route   GET /api/carousels/:id/download
// @access  Private
const downloadCarouselPdf = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Generate PDF filename
  const fileName = `carousel-${carousel._id}-${Date.now()}.pdf`;
  const filePath = path.join('uploads', fileName);

  // Create PDF with carousel data
  await createPdf(carousel, filePath);

  // Set response headers for download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

  // Stream the file to the response
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  // Delete the temp file after sending
  fileStream.on('end', () => {
    fs.unlinkSync(filePath);
  });
});

// @desc    Complete a carousel request and send files to client
// @route   POST /api/carousels/requests/:id/complete
// @access  Private/Admin
const completeCarouselRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    console.log('Processing carousel request completion for ID:', id);
    
    // Find the request - try with both ObjectId and string ID formats
    let request;
    
    if (mongoose.Types.ObjectId.isValid(id)) {
      request = await CarouselRequest.findById(id);
    }
    
    // If not found by _id, try the legacy id field
    if (!request) {
      request = await CarouselRequest.findOne({ id });
    }
    
    if (!request) {
      console.error('Carousel request not found with ID:', id);
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }

    console.log('Found carousel request:', request._id);

    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files were uploaded'
      });
    }

    console.log('Uploaded files:', req.files.length);

    // Process uploaded files
    const completedFiles = req.files.map(file => ({
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    }));

    // Update request with completed files and status
    request.status = 'completed';
    request.completedFiles = completedFiles;
    
    if (adminNotes) {
      request.adminNotes = adminNotes;
    }
    
    request.completedAt = Date.now();
    
    await request.save();

    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error completing carousel request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while completing carousel request'
    });
  }
});

/**
 * @desc    Create a new carousel request
 * @route   POST /api/carousels/requests
 * @access  Private
 */
const createCarouselRequest = asyncHandler(async (req, res) => {
  try {
    const { title, description, carouselType } = req.body;
    
    if (!title) {
      res.status(400);
      throw new Error('Please provide a title for your request');
    }
    
    // Process uploaded files if any
    const files = req.files ? req.files.map(file => ({
      url: file.path,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })) : [];
    
    // Create the carousel request
    const request = await CarouselRequest.create({
      userId: req.user._id,
      title,
      description: description || '',
      carouselType: carouselType || 'professional',
      files,
      status: 'pending'
    });
    
    if (request) {
      res.status(201).json({
        success: true,
        message: 'Carousel request created successfully',
        request
      });
    } else {
      res.status(400);
      throw new Error('Invalid request data');
    }
  } catch (error) {
    console.error('Error creating carousel request:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create carousel request',
      error: error.toString()
    });
  }
});

/**
 * @desc    Get all carousel requests
 * @route   GET /api/carousels/requests
 * @access  Private
 */
const getCarouselRequests = asyncHandler(async (req, res) => {
  try {
    let requests;
    
    // If admin, get all requests, otherwise get only user's requests
    if (req.user.role === 'admin') {
      requests = await CarouselRequest.find()
        .sort({ createdAt: -1 });
    } else {
      requests = await CarouselRequest.find({ userId: req.user._id })
        .sort({ createdAt: -1 });
    }
    
    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching carousel requests:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch carousel requests',
      error: error.toString()
    });
  }
});

/**
 * @desc    Get carousel request by ID
 * @route   GET /api/carousels/requests/:id
 * @access  Private
 */
const getCarouselRequestById = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.id;
    
    // Find request by ID or legacy ID
    const request = await CarouselRequest.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ]
    });
    
    if (!request) {
      res.status(404);
      throw new Error('Carousel request not found');
    }
    
    // Check if user is authorized (admin or owner)
    if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this carousel request');
    }
    
    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching carousel request:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch carousel request',
      error: error.toString()
    });
  }
});

/**
 * @desc    Update carousel request status
 * @route   PATCH /api/carousels/requests/:id/status
 * @access  Private/Admin
 */
const updateCarouselRequestStatus = asyncHandler(async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const requestId = req.params.id;
    
    if (!status) {
      res.status(400);
      throw new Error('Please provide a status');
    }
    
    // Find request by ID or legacy ID
    const request = await CarouselRequest.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ]
    });
    
    if (!request) {
      res.status(404);
      throw new Error('Carousel request not found');
    }
    
    // Update status and admin notes
    request.status = status;
    if (adminNotes) {
      request.adminNotes = adminNotes;
    }
    
    await request.save();
    
    res.status(200).json({
      success: true,
      message: 'Carousel request status updated successfully',
      request
    });
  } catch (error) {
    console.error('Error updating carousel request status:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update carousel request status',
      error: error.toString()
    });
  }
});

/**
 * @desc    Delete carousel request
 * @route   DELETE /api/carousels/requests/:id
 * @access  Private
 */
const deleteCarouselRequest = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.id;
    
    // Find request by ID or legacy ID
    const request = await CarouselRequest.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ]
    });
    
    if (!request) {
      res.status(404);
      throw new Error('Carousel request not found');
    }
    
    // Check if user is authorized (admin or owner)
    if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to delete this carousel request');
    }
    
    // Use deleteOne instead of remove (which is deprecated)
    await CarouselRequest.deleteOne({ _id: request._id });
    
    res.status(200).json({
      success: true,
      message: 'Carousel request deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting carousel request:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete carousel request',
      error: error.toString()
    });
  }
});

// Export controller functions
module.exports = {
  getCarousels,
  getCarousel,
  createCarousel,
  updateCarousel,
  deleteCarousel,
  downloadCarouselPdf,
  createCarouselRequest,
  getCarouselRequests,
  getCarouselRequestById,
  updateCarouselRequestStatus,
  deleteCarouselRequest,
  completeCarouselRequest
}; 