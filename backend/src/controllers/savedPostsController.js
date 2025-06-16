const asyncHandler = require('express-async-handler');
const SavedPost = require('../models/savedPost');

// Save posts from any platform
const savePosts = asyncHandler(async (req, res) => {
  try {
    const { posts, platform, userId } = req.body;

    if (!posts || !platform || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Posts, platform, and userId are required'
      });
    }

    // Save each post
    const savedPosts = await Promise.all(
      posts.map(async (post) => {
        const savedPost = await SavedPost.create({
          userId,
          platform,
          postData: post,
          createdAt: new Date()
        });
        return savedPost;
      })
    );

    res.status(200).json({
      success: true,
      message: `Successfully saved ${savedPosts.length} posts`,
      savedPosts
    });
  } catch (error) {
    console.error('Error saving posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save posts',
      message: error.message
    });
  }
});

// Get saved posts for a user
const getSavedPosts = asyncHandler(async (req, res) => {
  try {
    const { userId, platform } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'UserId is required'
      });
    }

    const query = { userId };
    if (platform) {
      query.platform = platform;
    }

    const savedPosts = await SavedPost.find(query)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      posts: savedPosts
    });
  } catch (error) {
    console.error('Error fetching saved posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved posts',
      message: error.message
    });
  }
});

// Delete saved post
const deleteSavedPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    if (!postId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'PostId and userId are required'
      });
    }

    const deletedPost = await SavedPost.findOneAndDelete({
      _id: postId,
      userId
    });

    if (!deletedPost) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting saved post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post',
      message: error.message
    });
  }
});

module.exports = {
  savePosts,
  getSavedPosts,
  deleteSavedPost
}; 