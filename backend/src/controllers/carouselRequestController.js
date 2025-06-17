const asyncHandler = require('express-async-handler');
const CarouselRequest = require('../models/carouselRequestModel');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { createCarouselStatusNotification } = require('./notificationController');

/**
 * @desc    Submit a new carousel request
 * @route   POST /api/carousels/submit-request
 * @access  Private
 */
const submitCarouselRequest = asyncHandler(async (req, res) => {
  try {
    // Extract data from request body
    const { 
      title, 
      carouselType,
      content, 
      videoId, 
      videoTitle,
      youtubeUrl,
      fileUrls = [],
      userName,
      userEmail
    } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ message: 'Please provide a title for your request' });
    }

    // Create the carousel request
    const request = await CarouselRequest.create({
      userId: req.user._id,
      title,
      carouselType: carouselType || 'professional',
      content,
      videoId,
      videoTitle,
      youtubeUrl,
      files: fileUrls.map(url => ({ url })),
      status: 'pending',
      userName: userName || req.user.firstName || req.user.name || 'Unknown User',
      userEmail: userEmail || req.user.email || ''
    });

    if (request) {
      // Increment user's request count
      const userLimit = req.userLimit;
      userLimit.count += 1;
      await userLimit.save();

      res.status(201).json({
        _id: request._id,
        title: request.title,
        status: request.status,
        createdAt: request.createdAt,
        currentCount: userLimit.count,
        limit: userLimit.limit
      });
    } else {
      res.status(400).json({ message: 'Invalid request data' });
    }
  } catch (error) {
    console.error('Error submitting carousel request:', error);
    res.status(500).json({ 
      message: 'Error submitting carousel request', 
      error: error.message 
    });
  }
});

/**
 * @desc    Get all carousel requests for admin
 * @route   GET /api/carousels/admin/requests
 * @access  Private/Admin
 */
const getAdminRequests = asyncHandler(async (req, res) => {
  try {
    // Check if user is admin (using role property instead of isAdmin)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }
    
    // Fetch all requests, sorted by latest first
    const requests = await CarouselRequest.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email');
    
    // Log what we're sending back for debugging
    console.log(`Sending ${requests.length} carousel requests to admin`);
    if (requests.length > 0) {
      console.log('Sample request data:', JSON.stringify(requests[0].toJSON(), null, 2));
    }
    
    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching carousel requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch carousel requests',
      error: error.message
    });
  }
});

/**
 * @desc    Get carousel request by ID
 * @route   GET /api/carousel/requests/:id
 * @access  Private
 */
const getRequestById = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.id;
    
    // Find request by ID
    const request = await CarouselRequest.findOne({ id: requestId })
      .populate('userId', 'name email')
      .populate('assignedTo', 'name email');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }
    
    // Check if user is authorized (admin or owner) - using role property instead of isAdmin
    if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }
    
    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching carousel request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch carousel request',
      error: error.message
    });
  }
});

/**
 * @desc    Update carousel request status
 * @route   PATCH /api/carousel/requests/:id/status
 * @access  Private/Admin
 */
const updateRequestStatus = asyncHandler(async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const requestId = req.params.id;
    
    // Check if user is admin (using role property instead of isAdmin)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }
    
    // Find and update request
    const request = await CarouselRequest.findOne({ id: requestId });
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }
    
    // Update fields
    request.status = status || request.status;
    request.adminNotes = adminNotes || request.adminNotes;
    request.assignedTo = req.body.assignedTo || request.assignedTo;
    request.updatedAt = new Date();
    
    // Save changes
    await request.save();
    
    res.status(200).json({
      success: true,
      message: 'Carousel request updated successfully',
      data: request
    });
  } catch (error) {
    console.error('Error updating carousel request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update carousel request',
      error: error.message
    });
  }
});

/**
 * @desc    Get user's carousel requests
 * @route   GET /api/carousel/user/requests
 * @access  Private
 */
const getUserRequests = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all requests for this user
    const requests = await CarouselRequest.find({ userId })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching user carousel requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user carousel requests',
      error: error.message
    });
  }
});

/**
 * @desc    Complete a carousel request with files
 * @route   POST /api/carousels/requests/:id/complete
 * @access  Private/Admin
 */
const completeCarouselRequest = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.id;
    
    console.log('Processing carousel request completion for ID:', requestId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      console.log('Unauthorized access attempt by user:', req.user._id);
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }
    
    // Find request
    const request = await CarouselRequest.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(requestId) ? requestId : null },
        { id: requestId }
      ] 
    });
    
    if (!request) {
      console.log('Carousel request not found with ID:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Carousel request not found'
      });
    }
    
    console.log('Found carousel request:', request._id);
    
    // Get files and notes from request body
    const { files, adminNotes } = req.body;
    
    console.log('Received files:', JSON.stringify(files, null, 2));
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      console.log('No files provided in request');
      return res.status(400).json({
        success: false,
        message: 'No files were uploaded'
      });
    }

    // Validate that each file has required fields
    const invalidFiles = files.filter(file => !file.url || !file.filename || !file.originalName || !file.mimetype);
    if (invalidFiles.length > 0) {
      console.log('Invalid files found:', invalidFiles);
      return res.status(400).json({
        success: false,
        message: 'Some files are missing required fields'
      });
    }
    
    // Update request with completed files
    request.status = 'completed';
    request.adminNotes = adminNotes || request.adminNotes;
    request.completedFiles = files;
    request.updatedAt = new Date();
    
    console.log('Saving request with completed files:', JSON.stringify(request.completedFiles, null, 2));
    
    // Save changes
    await request.save();

    // Create notification for user
    try {
      await createCarouselStatusNotification(
        request.userId,
        request._id,
        'completed',
        request.title
      );
      console.log('Created completion notification for user:', request.userId);
    } catch (error) {
      console.error('Error creating notification:', error);
      // Don't fail the request if notification fails
    }
    
    // Return success
    res.status(200).json({
      success: true,
      message: 'Carousel request completed successfully',
      data: request
    });
  } catch (error) {
    console.error('Error completing carousel request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete carousel request',
      error: error.message
    });
  }
});

module.exports = {
  submitCarouselRequest,
  getAdminRequests,
  getRequestById,
  updateRequestStatus,
  getUserRequests,
  completeCarouselRequest
}; 