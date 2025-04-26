const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Post = require('../models/postModel');
const Carousel = require('../models/carouselModel');
const SavedVideo = require('../models/savedVideo');
const CarouselContent = require('../models/carouselContentModel');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  // Get basic stats for the dashboard
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ 
    lastActive: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
  });
  const newUsersToday = await User.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  // Content stats
  const totalPosts = await Post.countDocuments();
  const totalCarousels = await Carousel.countDocuments();
  const newContentToday = await Post.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }) + await Carousel.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  // Saved YouTube videos and transcripts stats
  const totalSavedVideos = await SavedVideo.countDocuments();
  const videosWithTranscripts = await SavedVideo.countDocuments({
    transcript: { $exists: true, $ne: '' }
  });
  const newSavedVideosToday = await SavedVideo.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  // AI generated content stats
  const totalGeneratedContent = await CarouselContent.countDocuments();
  const newGeneratedContentToday = await CarouselContent.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  // Return all stats
  res.status(200).json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday
      },
      content: {
        totalPosts,
        totalCarousels,
        total: totalPosts + totalCarousels,
        newToday: newContentToday
      },
      youtube: {
        totalSavedVideos,
        videosWithTranscripts,
        newToday: newSavedVideosToday,
        transcriptPercentage: totalSavedVideos > 0 ? Math.round((videosWithTranscripts / totalSavedVideos) * 100) : 0
      },
      generatedContent: {
        total: totalGeneratedContent,
        newToday: newGeneratedContentToday
      }
    }
  });
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password');
  
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user role
// @route   PATCH /api/admin/users/:id/promote
// @access  Private/Admin
const promoteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  
  user.role = 'admin';
  await user.save();
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      role: user.role
    }
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  
  await user.remove();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get all content (posts & carousels)
// @route   GET /api/admin/content
// @access  Private/Admin
const getAllContent = asyncHandler(async (req, res) => {
  // Get all posts and carousels
  const posts = await Post.find().populate('user', 'firstName lastName email');
  const carousels = await Carousel.find().populate('user', 'firstName lastName email');
  
  // Format posts for consistent response
  const formattedPosts = posts.map(post => ({
    id: post._id,
    title: post.title || 'Untitled Post',
    type: post.mediaType === 'carousel' ? 'carousel' : (post.content.length > 280 ? 'post-long' : 'post-short'),
    userId: post.user._id,
    userName: `${post.user.firstName} ${post.user.lastName}`,
    slideCount: post.slides ? post.slides.length : null,
    status: post.status,
    views: 0, // Add analytics data if available
    likes: 0, // Add analytics data if available
    comments: 0, // Add analytics data if available
    createdAt: post.createdAt,
    publishedAt: post.publishedTime,
  }));
  
  // Format carousels for consistent response
  const formattedCarousels = carousels.map(carousel => ({
    id: carousel._id,
    title: carousel.title || 'Untitled Carousel',
    type: 'carousel',
    userId: carousel.user._id,
    userName: `${carousel.user.firstName} ${carousel.user.lastName}`,
    slideCount: carousel.slideCount || (carousel.slides ? carousel.slides.length : 0),
    status: carousel.status || 'draft',
    views: 0, // Add analytics data if available
    likes: 0, // Add analytics data if available
    comments: 0, // Add analytics data if available
    createdAt: carousel.createdAt,
    publishedAt: carousel.publishDate,
  }));
  
  // Combine and sort by creation date (newest first)
  const allContent = [...formattedPosts, ...formattedCarousels].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  res.status(200).json({
    success: true,
    count: allContent.length,
    data: allContent
  });
});

// @desc    Delete content
// @route   DELETE /api/admin/content/:id
// @access  Private/Admin
const deleteContent = asyncHandler(async (req, res) => {
  // Try to find in Posts
  let content = await Post.findById(req.params.id);
  let isPost = true;
  
  // If not in Posts, try Carousels
  if (!content) {
    content = await Carousel.findById(req.params.id);
    isPost = false;
  }
  
  // If not found in either, return error
  if (!content) {
    res.status(404);
    throw new Error('Content not found');
  }
  
  // Delete the content
  await content.remove();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get user's saved YouTube videos
// @route   GET /api/admin/content/user/:userId/videos
// @access  Private/Admin
const getUserVideos = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400);
      throw new Error('User ID is required');
    }
    
    // Get all saved videos for the user, sorted by savedAt in descending order
    const savedVideos = await SavedVideo.find({ userId })
      .sort({ savedAt: -1 })
      .lean();
    
    // Format videos for response
    const formattedVideos = savedVideos.map(video => ({
      id: video._id,
      videoId: video.videoId,
      title: video.title || 'Untitled Video',
      thumbnailUrl: video.thumbnailUrl,
      channelTitle: video.channelTitle || video.channelName || 'Unknown',
      savedAt: video.savedAt || video.createdAt,
      duration: video.metadata?.duration || 'N/A',
      hasTranscript: !!video.transcript,
      transcript: video.transcript,
      formattedTranscript: video.formattedTranscript,
      language: video.language,
      is_generated: video.is_generated
    }));
    
    res.status(200).json({
      success: true,
      count: formattedVideos.length,
      data: formattedVideos
    });
  } catch (error) {
    console.error('Error getting user videos:', error);
    res.status(500);
    throw new Error('Failed to get user videos: ' + error.message);
  }
});

// @desc    Get user's generated content
// @route   GET /api/admin/content/user/:userId/content
// @access  Private/Admin
const getUserContent = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400);
      throw new Error('User ID is required');
    }
    
    // Get all content for the user, sorted by createdAt in descending order
    const userContents = await CarouselContent.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    // Format content for response
    const formattedContents = userContents.map(content => ({
      id: content.id,
      title: content.title || 'Untitled Content',
      type: content.type || 'unknown',
      content: content.content,
      videoId: content.videoId || null,
      videoTitle: content.videoTitle || null,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt
    }));
    
    res.status(200).json({
      success: true,
      count: formattedContents.length,
      data: formattedContents
    });
  } catch (error) {
    console.error('Error getting user content:', error);
    res.status(500);
    throw new Error('Failed to get user content: ' + error.message);
  }
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserById,
  promoteUser,
  deleteUser,
  getAllContent,
  deleteContent,
  getUserVideos,
  getUserContent
}; 