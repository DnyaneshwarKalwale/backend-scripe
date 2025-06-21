const express = require('express');
const router = express.Router();
const { savePosts, getSavedPosts, deleteSavedPost } = require('../controllers/savedPostsController');
const { protect } = require('../middleware/authMiddleware');

// Save posts
router.post('/', protect, savePosts);

// Get saved posts
router.get('/', protect, getSavedPosts);

// Delete saved post
router.delete('/:postId', protect, deleteSavedPost);

module.exports = router; 