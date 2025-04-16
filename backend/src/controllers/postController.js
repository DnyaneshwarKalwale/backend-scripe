const asyncHandler = require('express-async-handler');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const { linkedinController } = require('./linkedinController');

/**
 * Get all posts for current user
 * @route GET /api/posts
 * @access Private
 */
const getPosts = asyncHandler(async (req, res) => {
  try {
    const { status, platform = 'linkedin', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user._id, platform };
    if (status) {
      query.status = status;
    }
    
    const posts = await Post.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500);
    throw new Error('Failed to fetch posts');
  }
});

/**
 * Get a single post by ID
 * @route GET /api/posts/:id
 * @access Private
 */
const getPostById = asyncHandler(async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      res.status(404);
      throw new Error('Post not found');
    }
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    if (error.message === 'Post not found') {
      res.status(404);
    } else {
      res.status(500);
    }
    throw new Error(error.message || 'Failed to fetch post');
  }
});

/**
 * Create a new post (as draft)
 * @route POST /api/posts
 * @access Private
 */
const createPost = asyncHandler(async (req, res) => {
  try {
    const {
      title,
      content,
      hashtags,
      mediaType = 'none',
      mediaUrls = [],
      postImage,
      slides = [],
      documentInfo,
      articleUrl,
      articleTitle,
      articleDescription,
      isPollActive = false,
      pollOptions = [],
      pollDuration = 1,
      status = 'draft',
      platform = 'linkedin',
      visibility = 'PUBLIC',
      scheduledTime
    } = req.body;
    
    if (!content) {
      res.status(400);
      throw new Error('Content is required');
    }
    
    // Create the post record
    const post = await Post.create({
      user: req.user._id,
      title,
      content,
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      mediaType,
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
      postImage,
      slides: Array.isArray(slides) ? slides : [],
      documentInfo,
      articleUrl,
      articleTitle,
      articleDescription,
      isPollActive,
      pollOptions: Array.isArray(pollOptions) ? pollOptions : [],
      pollDuration,
      status,
      platform,
      visibility,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null
    });
    
    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to create post');
  }
});

/**
 * Update an existing post
 * @route PUT /api/posts/:id
 * @access Private
 */
const updatePost = asyncHandler(async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      res.status(404);
      throw new Error('Post not found');
    }
    
    // Check if post is already published - only allow status changes
    if (post.status === 'published' && req.body.status !== 'deleted') {
      res.status(400);
      throw new Error('Cannot update a published post except to delete it');
    }
    
    // Update post fields
    const updateFields = [
      'title', 'content', 'hashtags', 'mediaType', 'mediaUrls',
      'postImage', 'slides', 'documentInfo', 'articleUrl', 
      'articleTitle', 'articleDescription', 'isPollActive',
      'pollOptions', 'pollDuration', 'status', 'visibility',
      'scheduledTime'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Handle dates
        if (field === 'scheduledTime' && req.body[field]) {
          post[field] = new Date(req.body[field]);
        }
        // Handle arrays
        else if (['hashtags', 'mediaUrls', 'slides', 'pollOptions'].includes(field)) {
          post[field] = Array.isArray(req.body[field]) ? req.body[field] : [];
        }
        // Handle other fields
        else {
          post[field] = req.body[field];
        }
      }
    });
    
    const updatedPost = await post.save();
    
    res.status(200).json({
      success: true,
      data: updatedPost
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(error.message === 'Post not found' ? 404 : 500);
    throw new Error(error.message || 'Failed to update post');
  }
});

/**
 * Delete a post
 * @route DELETE /api/posts/:id
 * @access Private
 */
const deletePost = asyncHandler(async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      res.status(404);
      throw new Error('Post not found');
    }
    
    // If it's published, mark as deleted instead of removing from DB
    if (post.status === 'published') {
      post.status = 'deleted';
      await post.save();
    } else {
      // Otherwise, actually delete it
      await post.remove();
    }
    
    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(error.message === 'Post not found' ? 404 : 500);
    throw new Error(error.message || 'Failed to delete post');
  }
});

/**
 * Publish a draft or scheduled post immediately
 * @route POST /api/posts/:id/publish
 * @access Private
 */
const publishPost = asyncHandler(async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      res.status(404);
      throw new Error('Post not found');
    }
    
    if (post.status === 'published') {
      res.status(400);
      throw new Error('Post is already published');
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user.linkedinAccessToken) {
      res.status(400);
      throw new Error('You need to connect your LinkedIn account first');
    }
    
    let platformResponse;
    
    // Handle different post types
    if (post.mediaType === 'none') {
      // Text post
      const content = post.content + 
        (post.hashtags && post.hashtags.length > 0 
          ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
          : '');
          
      platformResponse = await linkedinController.createLinkedInPost(
        user.linkedinAccessToken,
        content,
        post.visibility
      );
    } 
    else if (post.mediaType === 'image' && post.postImage) {
      // Image post
      platformResponse = await linkedinController.createLinkedInImagePost(
        user.linkedinAccessToken,
        post.content,
        post.postImage.secure_url,
        post.postImage.original_filename || 'image',
        post.visibility
      );
    }
    else if (post.mediaType === 'carousel' && post.slides && post.slides.length > 0) {
      // Carousel post
      const slidesWithImages = post.slides.filter(
        slide => slide.cloudinaryImage?.secure_url || slide.imageUrl
      );
      
      if (slidesWithImages.length === 0) {
        throw new Error('Carousel post requires at least one slide with an image');
      }
      
      // First slide with image
      const firstSlide = slidesWithImages[0];
      const imageUrl = firstSlide.cloudinaryImage?.secure_url || firstSlide.imageUrl;
      
      // Add all slide content to the post text
      const slideContents = post.slides.map((slide, index) => 
        `Slide ${index + 1}: ${slide.content}`
      ).join('\n\n');
      
      // Create content with hashtags
      const fullContent = post.content + 
        '\n\n' + slideContents +
        (post.hashtags && post.hashtags.length > 0 
          ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
          : '');
      
      platformResponse = await linkedinController.createLinkedInImagePost(
        user.linkedinAccessToken,
        fullContent,
        imageUrl,
        firstSlide.cloudinaryImage?.original_filename || 'Carousel Image',
        post.visibility
      );
    }
    else if (post.mediaType === 'document' && post.documentInfo) {
      // Document post - since we can't upload documents directly,
      // create a text post with document information
      const documentInfo = `Document: ${post.documentInfo.documentName}`;
      const fullContent = post.content + 
        '\n\n' + documentInfo +
        (post.hashtags && post.hashtags.length > 0 
          ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
          : '');
          
      platformResponse = await linkedinController.createLinkedInPost(
        user.linkedinAccessToken,
        fullContent,
        post.visibility
      );
    }
    else if (post.mediaType === 'article' && post.articleUrl) {
      // Article post
      platformResponse = await linkedinController.createLinkedInArticlePost(
        user.linkedinAccessToken,
        post.content,
        post.articleUrl,
        post.articleTitle || '',
        post.articleDescription || '',
        post.visibility
      );
    }
    else if (post.mediaType === 'poll' && post.isPollActive && post.pollOptions.length >= 2) {
      // Poll post
      const filteredOptions = post.pollOptions.filter(opt => opt.trim());
      platformResponse = await linkedinController.createLinkedInPollPost(
        user.linkedinAccessToken,
        post.content,
        filteredOptions,
        post.pollDuration
      );
    }
    else {
      // Fallback to text post
      const content = post.content + 
        (post.hashtags && post.hashtags.length > 0 
          ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
          : '');
          
      platformResponse = await linkedinController.createLinkedInPost(
        user.linkedinAccessToken,
        content,
        post.visibility
      );
    }
    
    // Update post as published
    post.status = 'published';
    post.publishedTime = new Date();
    post.platformPostId = platformResponse.id || null;
    post.platformResponse = platformResponse;
    
    const updatedPost = await post.save();
    
    res.status(200).json({
      success: true,
      data: updatedPost,
      message: 'Post published successfully to LinkedIn'
    });
  } catch (error) {
    console.error('Error publishing post:', error);
    res.status(error.message === 'Post not found' ? 404 : 500);
    throw new Error(error.message || 'Failed to publish post');
  }
});

/**
 * Schedule a post for later publishing
 * @route POST /api/posts/:id/schedule
 * @access Private
 */
const schedulePost = asyncHandler(async (req, res) => {
  try {
    const { scheduledTime } = req.body;
    
    if (!scheduledTime) {
      res.status(400);
      throw new Error('Scheduled time is required');
    }
    
    const post = await Post.findOne({ 
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!post) {
      res.status(404);
      throw new Error('Post not found');
    }
    
    if (post.status === 'published') {
      res.status(400);
      throw new Error('Cannot schedule a published post');
    }
    
    // Update post for scheduling
    post.status = 'scheduled';
    post.scheduledTime = new Date(scheduledTime);
    
    const updatedPost = await post.save();
    
    res.status(200).json({
      success: true,
      data: updatedPost,
      message: 'Post scheduled successfully'
    });
  } catch (error) {
    console.error('Error scheduling post:', error);
    res.status(error.message === 'Post not found' ? 404 : 500);
    throw new Error(error.message || 'Failed to schedule post');
  }
});

module.exports = {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  schedulePost
}; 