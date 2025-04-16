const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const linkedinController = require('../controllers/linkedinController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Set up storage for image uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Serve uploaded files statically
router.use('/uploads', express.static(uploadsDir));

// Get current user's LinkedIn profile
router.get('/profile', protect, linkedinController.getLinkedInProfile);

// Get user's posts
router.get('/posts', protect, linkedinController.getUserPosts);

// Analytics route removed - requires additional API permissions

// Create a post
router.post('/post', [
  protect,
  check('postContent', 'Post content is required').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  linkedinController.createLinkedInPost(req, res);
});

// Upload image endpoint
router.post('/upload', protect, (req, res, next) => {
  const uploadMiddleware = upload.single('image');
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Error uploading image:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.message || 'Error uploading image',
        details: err.code === 'LIMIT_FILE_SIZE' ? 'File size should be less than 5MB' : err.message 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    // Return the file path that can be accessed from the client
    const filePath = `uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
    
    res.json({ 
      success: true,
      message: 'Image uploaded successfully',
      filePath: filePath,
      fullUrl: fullUrl,
      filename: req.file.filename
    });
  });
});

// Initialize image upload
router.post('/images/initializeUpload', protect, (req, res) => {
  linkedinController.initializeImageUpload(req, res);
});

// Schedule a post
router.post('/schedule', [
  protect,
  check('postContent', 'Post content is required').notEmpty(),
  check('scheduleTime', 'Schedule time is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // For scheduled posts, we'll store them in our database and use a cron job to publish
    const { scheduleTime, ...postData } = req.body;
    
    // Here you would save to your database
    // This is just a placeholder response for now
    res.json({
      success: true,
      message: 'Post scheduled successfully',
      scheduleId: 'scheduled_' + Date.now(),
      scheduledTime: scheduleTime
    });
  } catch (err) {
    console.error('Error scheduling LinkedIn post:', err);
    res.status(500).json({
      success: false,
      error: 'Error scheduling LinkedIn post',
      details: err.message
    });
  }
});

// Get LinkedIn basic profile without API calls
router.get('/basic-profile', protect, linkedinController.getLinkedInBasicProfile);

// Posts API - Comprehensive post management with state transitions
// ---------------------------------------------------------------

// Get all posts (draft, scheduled, published) for the current user
router.get('/posts/all', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Find all posts for this user, sorted appropriately
    const posts = await ScheduledPost.find({
      user: req.user._id,
      provider: 'linkedin'
    }).sort({
      createdAt: -1 // Newest first
    });
    
    res.json(posts);
  } catch (err) {
    console.error('Error fetching all posts:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch posts',
      details: err.message
    });
  }
});

// Create a new draft post
router.post('/posts/draft', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Create new draft post
    const draft = new ScheduledPost({
      user: req.user._id,
      provider: 'linkedin',
      scheduledTime: null, // Drafts don't have a scheduled time
      postData: req.body,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await draft.save();
    
    res.status(201).json({
      success: true,
      message: 'Draft saved successfully',
      id: draft._id,
      status: draft.status
    });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to save draft',
      details: err.message
    });
  }
});

// Create or update a scheduled post
router.post('/posts/scheduled', protect, async (req, res) => {
  try {
    const { scheduledTime } = req.body;
    
    if (!scheduledTime) {
      return res.status(400).json({ 
        success: false,
        error: 'Scheduled time is required' 
      });
    }
    
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Create new scheduled post
    const scheduled = new ScheduledPost({
      user: req.user._id,
      provider: 'linkedin',
      scheduledTime: new Date(scheduledTime),
      postData: req.body,
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await scheduled.save();
    
    res.status(201).json({
      success: true,
      message: 'Post scheduled successfully',
      id: scheduled._id,
      status: scheduled.status,
      scheduledTime: scheduled.scheduledTime
    });
  } catch (err) {
    console.error('Error scheduling post:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule post',
      details: err.message
    });
  }
});

// Save a published post for tracking/analytics
router.post('/posts/published', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Create record of published post
    const published = new ScheduledPost({
      user: req.user._id,
      provider: 'linkedin',
      scheduledTime: null,
      postData: req.body,
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await published.save();
    
    res.status(201).json({
      success: true,
      message: 'Published post saved successfully',
      id: published._id,
      status: published.status
    });
  } catch (err) {
    console.error('Error saving published post:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to save published post record',
      details: err.message
    });
  }
});

// State transition: Change post state (draft -> scheduled, draft -> published, scheduled -> published, etc.)
router.put('/posts/:id/status', protect, async (req, res) => {
  try {
    const { status, scheduledTime } = req.body;
    
    if (!status || !['draft', 'scheduled', 'published'].includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid status is required (draft, scheduled, or published)' 
      });
    }
    
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Find post and verify ownership
    const post = await ScheduledPost.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Update post status
    post.status = status;
    post.updatedAt = new Date();
    
    // Handle specific state changes
    if (status === 'scheduled' && scheduledTime) {
      post.scheduledTime = new Date(scheduledTime);
    } else if (status === 'published') {
      post.publishedAt = new Date();
      post.scheduledTime = null; // Clear scheduled time if any
    } else if (status === 'draft') {
      post.scheduledTime = null; // Clear scheduled time if any
    }
    
    await post.save();
    
    res.json({
      success: true,
      message: `Post updated to ${status} successfully`,
      id: post._id,
      status: post.status,
      scheduledTime: post.scheduledTime
    });
  } catch (err) {
    console.error(`Error changing post status:`, err);
    res.status(500).json({
      success: false,
      error: 'Failed to update post status',
      details: err.message
    });
  }
});

// Update post content
router.put('/posts/:id', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Find post and verify ownership
    const post = await ScheduledPost.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Don't allow editing published posts
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Cannot edit published posts'
      });
    }
    
    // Update post data
    post.postData = { ...post.postData, ...req.body };
    post.updatedAt = new Date();
    
    // Update scheduled time if provided and post is scheduled
    if (req.body.scheduledTime && post.status === 'scheduled') {
      post.scheduledTime = new Date(req.body.scheduledTime);
    }
    
    await post.save();
    
    res.json({
      success: true,
      message: 'Post updated successfully',
      id: post._id,
      status: post.status
    });
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update post',
      details: err.message
    });
  }
});

// Delete a post
router.delete('/posts/:id', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    
    // Find post and verify ownership
    const post = await ScheduledPost.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Don't allow deleting published posts
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete published posts'
      });
    }
    
    await ScheduledPost.deleteOne({ _id: req.params.id });
    
    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post',
      details: err.message
    });
  }
});

// Publish a post to LinkedIn (for both draft and scheduled posts)
router.post('/posts/:id/publish', protect, async (req, res) => {
  try {
    const ScheduledPost = require('../models/ScheduledPost');
    const User = require('../models/userModel');
    
    // Find post and verify ownership
    const post = await ScheduledPost.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Don't allow republishing an already published post
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Post is already published'
      });
    }
    
    // Get user for LinkedIn token
    const user = await User.findById(req.user._id);
    
    // Check LinkedIn token
    if (!user.linkedinAccessToken) {
      return res.status(401).json({
        success: false,
        error: 'LinkedIn token not found. Please reconnect your LinkedIn account'
      });
    }
    
    // Check token expiry
    if (user.linkedinTokenExpiry && new Date(user.linkedinTokenExpiry) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'LinkedIn token has expired. Please reconnect your LinkedIn account'
      });
    }
    
    // Create LinkedIn post data
    const userUrn = `urn:li:person:${user.linkedinId}`;
    
    let linkedinPostData = {
      author: userUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: post.postData.content || ''
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": post.postData.visibility || "PUBLIC"
      }
    };
    
    // Post to LinkedIn
    const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/v2';
    const response = await axios.post(
      `${LINKEDIN_API_BASE_URL}/ugcPosts`, 
      linkedinPostData,
      {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    // Update post status to published
    post.status = 'published';
    post.publishedAt = new Date();
    post.publishedPostId = response.data?.id;
    post.updatedAt = new Date();
    await post.save();
    
    res.json({
      success: true,
      message: 'Post published successfully',
      id: post._id,
      linkedInPostId: post.publishedPostId,
      status: post.status
    });
  } catch (err) {
    console.error('Error publishing post to LinkedIn:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to publish post to LinkedIn',
      details: err?.response?.data || err.message
    });
  }
});

module.exports = router; 