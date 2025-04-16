const express = require('express');
const router = express.Router();
const { 
  getPosts, 
  getPostById, 
  createPost, 
  updatePost, 
  deletePost, 
  publishPost, 
  schedulePost 
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');

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

// Migrate posts from local storage to database
router.post('/migrate-from-local', async (req, res) => {
  try {
    const { posts } = req.body;
    
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No posts provided for migration'
      });
    }
    
    const Post = require('../models/postModel');
    const results = [];
    
    for (const postData of posts) {
      // Ensure required fields are present
      if (!postData.content) {
        results.push({ 
          id: postData.id, 
          success: false, 
          message: 'Post content is required' 
        });
        continue;
      }
      
      try {
        // Create a new post object with the right fields
        const newPost = new Post({
          user: req.user._id,
          title: postData.title || 'Untitled Post',
          content: postData.content,
          hashtags: postData.hashtags || [],
          mediaType: postData.postImage ? 'image' : 
                     postData.slides && postData.slides.length > 0 ? 'carousel' : 'none',
          postImage: postData.postImage || null,
          slides: postData.slides || [],
          isPollActive: postData.isPollActive || false,
          pollOptions: postData.pollOptions || [],
          status: postData.status || 'draft',
          platform: postData.provider || 'linkedin',
          visibility: postData.visibility || 'PUBLIC',
          scheduledTime: postData.scheduledTime ? new Date(postData.scheduledTime) : null
        });
        
        // Save the post
        const savedPost = await newPost.save();
        
        results.push({ 
          id: postData.id, 
          success: true, 
          newId: savedPost._id,
          message: 'Successfully migrated post'
        });
      } catch (error) {
        results.push({ 
          id: postData.id, 
          success: false, 
          message: error.message || 'Failed to migrate post'
        });
      }
    }
    
    res.status(200).json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error migrating posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to migrate posts',
      error: error.message
    });
  }
});

module.exports = router; 