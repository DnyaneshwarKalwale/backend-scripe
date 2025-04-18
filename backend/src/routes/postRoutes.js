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

// All routes are protected and require authentication
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

module.exports = router; 