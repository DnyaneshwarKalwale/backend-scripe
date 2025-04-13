const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ScheduledPost = require('../models/ScheduledPost');
const UserToken = require('../models/UserToken');
const axios = require('axios');

// Get all user's scheduled posts and drafts
router.get('/', protect, async (req, res) => {
  try {
    const posts = await ScheduledPost.find({ user: req.user.id }).sort({ scheduledTime: 1 });
    res.json(posts);
  } catch (err) {
    console.error('Error fetching scheduled posts:', err);
    res.status(500).json({ error: 'Server error fetching scheduled posts' });
  }
});

// Create a new draft or scheduled post
router.post('/', protect, async (req, res) => {
  try {
    const { scheduledTime, postData, status = 'draft' } = req.body;
    
    const newPost = new ScheduledPost({
      user: req.user.id,
      provider: postData.provider || 'linkedin',
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      postData: postData,
      status: status
    });
    
    await newPost.save();
    res.status(201).json(newPost);
  } catch (err) {
    console.error('Error creating scheduled post:', err);
    res.status(500).json({ error: 'Server error creating scheduled post' });
  }
});

// Get a single scheduled post by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const post = await ScheduledPost.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post);
  } catch (err) {
    console.error('Error fetching scheduled post:', err);
    res.status(500).json({ error: 'Server error fetching scheduled post' });
  }
});

// Update a scheduled post
router.put('/:id', protect, async (req, res) => {
  try {
    const { scheduledTime, postData, status } = req.body;
    
    // Find post and check ownership
    const post = await ScheduledPost.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Prevent editing published posts
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Published posts cannot be modified' });
    }
    
    // Update fields
    if (scheduledTime) post.scheduledTime = new Date(scheduledTime);
    if (postData) post.postData = postData;
    if (status) post.status = status;
    post.updatedAt = Date.now();
    
    await post.save();
    res.json(post);
  } catch (err) {
    console.error('Error updating scheduled post:', err);
    res.status(500).json({ error: 'Server error updating scheduled post' });
  }
});

// Delete a scheduled post
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await ScheduledPost.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Prevent deleting published posts
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Published posts cannot be deleted' });
    }
    
    await ScheduledPost.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Error deleting scheduled post:', err);
    res.status(500).json({ error: 'Server error deleting scheduled post' });
  }
});

// Publish a scheduled/draft post immediately
router.post('/:id/publish', protect, async (req, res) => {
  try {
    const post = await ScheduledPost.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Post is already published' });
    }
    
    // Get user's LinkedIn token (using the middleware from linkedinRoutes)
    const userToken = await UserToken.findOne({
      user: req.user.id,
      provider: 'linkedin'
    });

    if (!userToken || !userToken.accessToken) {
      return res.status(401).json({
        error: 'LinkedIn account not connected or token expired. Please reconnect your LinkedIn account.'
      });
    }
    
    // Publish to LinkedIn
    let response;
    
    // Simple text post (in production, would handle different post types)
    response = await axios.post(`https://api.linkedin.com/v2/ugcPosts`, post.postData, {
      headers: {
        'Authorization': `Bearer ${userToken.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
    
    // Update post status to published
    post.status = 'published';
    post.publishedAt = Date.now();
    post.publishedPostId = response.data.id;
    post.updatedAt = Date.now();
    
    await post.save();
    
    res.json({
      success: true,
      message: 'Post published successfully',
      post: post
    });
  } catch (err) {
    console.error('Error publishing post:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error publishing post',
      details: err.response?.data || err.message
    });
  }
});

module.exports = router;
