const express = require('express');
const router = express.Router();
const { 
  getPosts, 
  getPostById, 
  createPost, 
  updatePost, 
  deletePost, 
  publishPost, 
  schedulePost,
  migrateFromLocal
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');
const { processScheduledPosts } = require('../services/schedulerService');

// Import Python transcript controller wrapper
const { getYouTubeTranscript } = require('../controllers/transcriptControllerWrapper');

// Public route for transcript - doesn't need authentication
router.post('/get-transcript', (req, res) => {
  if (!req.body || !req.body.videoUrl) {
    return res.status(400).json({
      success: false,
      error: 'Video URL is required'
    });
  }

  getYouTubeTranscript(req.body.videoUrl)
    .then(result => {
      res.status(result.success ? 200 : 404).json(result);
    })
    .catch(error => {
      console.error('Error in transcript route:', error);
      res.status(500).json({
        success: false,
        error: `Failed to get transcript: ${error.message}`
      });
    });
});

// All routes below this line are protected and require authentication
router.use(protect);

// Get all posts or filtered by status
router.get('/', getPosts);

// Get a specific post by ID
router.get('/:id', getPostById);

// Create a new post (draft by default)
router.post('/', createPost);

// Update an existing post
router.put('/:id', updatePost);

// Delete a post
router.delete('/:id', deletePost);

// Publish a draft or scheduled post immediately
router.post('/:id/publish', publishPost);

// Schedule a post for later publishing
router.post('/:id/schedule', schedulePost);

// Migration route
router.post('/migrate-from-local', migrateFromLocal);

// Protected transcript save route
router.post('/save-transcript', (req, res) => {
  if (!req.body || !req.body.videoId || !req.body.transcript) {
    return res.status(400).json({
      success: false,
      error: 'Video ID and transcript are required'
    });
  }
  
  // Use the createPost function from postController to save the transcript
  const postData = {
    title: req.body.title || `YouTube Video: ${req.body.videoId}`,
    content: req.body.transcript,
    status: 'draft',
    platform: 'youtube',
    platformPostId: req.body.videoId,
    videoUrl: req.body.videoUrl
  };
  
  // Add the post data to the request body
  req.body = {
    ...req.body,
    ...postData
  };
  
  // Call the createPost function
  createPost(req, res);
});

module.exports = router; 