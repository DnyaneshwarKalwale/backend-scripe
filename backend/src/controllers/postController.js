const asyncHandler = require('express-async-handler');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const { linkedinController } = require('./linkedinController');
const axios = require('axios');

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
    
    if (!user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn user ID not found. Please reconnect your LinkedIn account.');
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      res.status(401);
      throw new Error('LinkedIn access token has expired. Please reconnect your LinkedIn account.');
    }
    
    const userUrn = `urn:li:person:${user.linkedinId}`;
    let platformResponse;
    
    // Prepare basic post data structure
    let linkedinPostData = {
      author: userUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: post.content
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": post.visibility || "PUBLIC"
      }
    };
    
    // Add hashtags to content if present
    if (post.hashtags && post.hashtags.length > 0) {
      const hashtagString = post.hashtags.map(tag => `#${tag}`).join(' ');
      linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text += 
        `\n\n${hashtagString}`;
    }
    
    // Send the post request to LinkedIn
    const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/v2';
    
    try {
      const response = await axios.post(`${LINKEDIN_API_BASE_URL}/ugcPosts`, linkedinPostData, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      // Extract post ID from response headers
      const postId = response.headers['x-restli-id'];
      
      // Update post as published
      post.status = 'published';
      post.publishedTime = new Date();
      post.platformPostId = postId || null;
      post.platformResponse = {
        id: postId,
        success: true
      };
      
      const updatedPost = await post.save();
      
      res.status(200).json({
        success: true,
        data: updatedPost,
        message: 'Post published successfully to LinkedIn'
      });
    } catch (linkedinError) {
      console.error('LinkedIn API error:', linkedinError.response?.data || linkedinError.message);
      res.status(500);
      throw new Error(linkedinError.response?.data?.message || 'Failed to publish to LinkedIn. Please try again.');
    }
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

// @desc    Migrate posts from localStorage to database
// @route   POST /api/posts/migrate-from-local
// @access  Private
const migrateFromLocal = asyncHandler(async (req, res) => {
  const { posts } = req.body;
  
  if (!posts || !Array.isArray(posts)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input: posts array is required'
    });
  }
  
  const results = [];
  
  // Process each post in the array
  for (const post of posts) {
    try {
      // Basic validation
      if (!post.content) {
        results.push({
          id: post.id,
          success: false,
          message: 'Post content is required'
        });
        continue;
      }
      
      // Prepare post data for database
      const postData = {
        user: req.user._id,
        title: post.title || 'Migrated Post',
        content: post.content,
        hashtags: post.hashtags || [],
        mediaType: post.postImage ? 'image' : post.slides && post.slides.length > 0 ? 'carousel' : 'none',
        mediaUrls: [],
        postImage: post.postImage || null,
        slides: post.slides || [],
        documentInfo: post.documentInfo || null,
        articleUrl: post.articleUrl || null,
        articleTitle: post.articleTitle || null,
        articleDescription: post.articleDescription || null,
        isPollActive: post.isPollActive || false,
        pollOptions: post.pollOptions || [],
        pollDuration: post.pollDuration || 1,
        status: post.status || 'draft',
        platform: post.provider || 'linkedin',
        visibility: post.visibility || 'PUBLIC',
        scheduledTime: post.scheduledTime ? new Date(post.scheduledTime) : null
      };
      
      // Create the post in the database
      const newPost = await Post.create(postData);
      
      results.push({
        id: post.id,
        dbId: newPost._id.toString(),
        success: true
      });
    } catch (postError) {
      console.error(`Error migrating post ${post.id}:`, postError);
      results.push({
        id: post.id,
        success: false,
        message: postError.message
      });
    }
  }
  
  // Return results summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  res.status(200).json({
    success: true,
    message: `Successfully migrated ${successCount} posts, ${failCount} failed`,
    results
  });
});

module.exports = {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  schedulePost,
  migrateFromLocal
}; 