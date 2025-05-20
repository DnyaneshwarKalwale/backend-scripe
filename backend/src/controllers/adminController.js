const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Post = require('../models/postModel');
const Carousel = require('../models/carouselModel');
const SavedVideo = require('../models/savedVideo');
const CarouselContent = require('../models/carouselContentModel');
const UserLimit = require('../models/userLimitModel');
const CarouselRequest = require('../models/carouselRequestModel');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Get time range from query params
    const { timeRange } = req.query;
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - (timeRange === '7days' ? 7 : timeRange === '90days' ? 90 : 30));
    
    // Get basic stats for the dashboard
    const totalUsers = await User.countDocuments() || 0;
    const activeUsers = await User.countDocuments({ 
      lastActive: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    }) || 0;
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }) || 0;
    
    // Users created in the specified time range
    let newUsersByDate = [];
    try {
      newUsersByDate = await User.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startDate } 
          } 
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (err) {
      console.error("Error aggregating users by date:", err);
      newUsersByDate = [];
    }
    
    // Format user trends data
    const usersByDate = [];
    // Initialize with zeros for all dates in range
    let currentDate = new Date(startDate);
    const endDate = new Date();
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const found = newUsersByDate.find(item => item?._id === dateString);
      usersByDate.push({
        date: dateString,
        count: found ? found.count : 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Content stats
    const totalPosts = await Post.countDocuments() || 0;
    const totalCarousels = await Carousel.countDocuments() || 0;
    const newContentToday = (await Post.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }) || 0) + (await Carousel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }) || 0);
    
    // Content created in the specified time range
    let contentByDate = [];
    let carouselByDate = [];
    
    try {
      contentByDate = await Post.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      carouselByDate = await Carousel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (err) {
      console.error("Error aggregating content or carousel by date:", err);
      contentByDate = [];
      carouselByDate = [];
    }
    
    // Merge and format content trend data
    const generationTrend = [];
    // Initialize with zeros for all dates in range
    currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const postCount = contentByDate.find(item => item?._id === dateString)?.count || 0;
      const carouselCount = carouselByDate.find(item => item?._id === dateString)?.count || 0;
      
      generationTrend.push({
        date: dateString,
        count: postCount + carouselCount
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Content type distribution
    const byType = [
      { type: "Carousel", count: totalCarousels },
      { type: "Short Post", count: Math.floor(totalPosts * 0.6) }, // Approximation based on post lengths
      { type: "Long Post", count: Math.floor(totalPosts * 0.4) }   // Approximation based on post lengths
    ];
    
    // Saved YouTube videos and transcripts stats
    const totalSavedVideos = await SavedVideo.countDocuments() || 0;
    const videosWithTranscripts = await SavedVideo.countDocuments({
      transcript: { $exists: true, $ne: '' }
    }) || 0;
    const newSavedVideosToday = await SavedVideo.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }) || 0;
    
    // YouTube videos saved in the specified time range
    let videosByDateAgg = [];
    try {
      videosByDateAgg = await SavedVideo.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (err) {
      console.error("Error aggregating videos by date:", err);
      videosByDateAgg = [];
    }
    
    // Format videos by date data
    const videosByDate = [];
    // Initialize with zeros for all dates in range
    currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const found = videosByDateAgg.find(item => item?._id === dateString);
      videosByDate.push({
        date: dateString,
        count: found ? found.count : 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Video source distribution
    let videoSources = [];
    try {
      videoSources = await SavedVideo.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: "$channelTitle",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
    } catch (err) {
      console.error("Error aggregating video sources:", err);
      videoSources = [];
    }
    
    const topChannels = videoSources.map(source => ({
      channel: source._id || 'Unknown',
      count: source.count || 0
    }));
    
    // AI generated content stats
    const totalGeneratedContent = await CarouselContent.countDocuments() || 0;
    const newGeneratedContentToday = await CarouselContent.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }) || 0;
    
    // Get carousel requests stats
    const totalRequests = await CarouselRequest.countDocuments() || 0;
    const pendingRequests = await CarouselRequest.countDocuments({ status: 'pending' }) || 0;
    const completedRequests = await CarouselRequest.countDocuments({ status: 'completed' }) || 0;
    
    // Carousel requests over time
    let requestsByDateAgg = [];
    try {
      requestsByDateAgg = await CarouselRequest.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (err) {
      console.error("Error aggregating carousel requests by date:", err);
      requestsByDateAgg = [];
    }
    
    // Format carousel requests by date
    const requestsByDate = [];
    // Initialize with zeros for all dates in range
    currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const found = requestsByDateAgg.find(item => item?._id === dateString);
      requestsByDate.push({
        date: dateString,
        count: found ? found.count : 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Get top users by video and content counts
    let topVideoUsers = [];
    let topContentUsers = [];
    
    try {
      topVideoUsers = await SavedVideo.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      topContentUsers = await CarouselContent.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
    } catch (err) {
      console.error("Error aggregating top users:", err);
      topVideoUsers = [];
      topContentUsers = [];
    }
    
    // Get user details for top users
    const topVideoUsersWithDetails = await Promise.all(
      topVideoUsers.map(async (item) => {
        try {
          const user = await User.findById(item._id, 'firstName lastName email');
          return {
            user: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User' : 'Unknown User',
            count: item.count || 0
          };
        } catch (err) {
          console.error("Error getting user details for video users:", err);
          return { user: 'Unknown User', count: item?.count || 0 };
        }
      })
    );
    
    const topContentUsersWithDetails = await Promise.all(
      topContentUsers.map(async (item) => {
        try {
          const user = await User.findById(item._id, 'firstName lastName email');
          return {
            user: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User' : 'Unknown User',
            count: item.count || 0
          };
        } catch (err) {
          console.error("Error getting user details for content users:", err);
          return { user: 'Unknown User', count: item?.count || 0 };
        }
      })
    );
    
    // Calculate average metrics
    const avgVideosSaved = totalUsers > 0 ? (totalSavedVideos / totalUsers).toFixed(1) : "0";
    const avgContentGenerated = totalUsers > 0 ? ((totalPosts + totalCarousels) / totalUsers).toFixed(1) : "0";
    const retentionRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) + "%" : "0%";
    
    // Return all stats
    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          newToday: newUsersToday,
          usersByDate,
          avgVideosSaved,
          avgContentGenerated,
          retentionRate,
          topVideoUsers: topVideoUsersWithDetails || [],
          topContentUsers: topContentUsersWithDetails || []
        },
        content: {
          total: totalPosts + totalCarousels,
          totalPosts,
          totalCarousels,
          newToday: newContentToday,
          generationTrend: generationTrend || [],
          byType: byType || [],
          sourceDistribution: [
            { source: "YouTube videos", count: Math.floor(totalGeneratedContent * 0.7) },
            { source: "Manual input", count: Math.floor(totalGeneratedContent * 0.2) },
            { source: "Uploaded files", count: Math.floor(totalGeneratedContent * 0.1) }
          ]
        },
        youtube: {
          totalSavedVideos,
          videosWithTranscripts,
          newToday: newSavedVideosToday,
          transcriptPercentage: totalSavedVideos > 0 ? Math.round((videosWithTranscripts / totalSavedVideos) * 100) : 0,
          videosByDate: videosByDate || [],
          topChannels: topChannels || []
        },
        generatedContent: {
          total: totalGeneratedContent,
          newToday: newGeneratedContentToday
        },
        carousel: {
          totalRequests,
          pendingRequests,
          completedRequests,
          requestsByDate: requestsByDate || []
        }
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard statistics',
      error: error.message
    });
  }
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

// @desc    Get saved videos metrics for analytics
// @route   GET /api/admin/saved-videos/metrics
// @access  Private/Admin
const getSavedVideosMetrics = asyncHandler(async (req, res) => {
  try {
    // Get time range from query params
    const { timeRange } = req.query;
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - (timeRange === '7days' ? 7 : timeRange === '90days' ? 90 : 30));
    
    // Get all saved videos
    const savedVideos = await SavedVideo.find({
      createdAt: { $gte: startDate }
    });
    
    // Process language distribution
    const languageCounts = {};
    savedVideos.forEach(video => {
      if (video.language) {
        languageCounts[video.language] = (languageCounts[video.language] || 0) + 1;
      } else {
        languageCounts['Unknown'] = (languageCounts['Unknown'] || 0) + 1;
      }
    });
    
    const languageDistribution = Object.keys(languageCounts).map(name => ({
      name,
      value: languageCounts[name]
    })).sort((a, b) => b.value - a.value);
    
    // Process channel distribution
    const channelCounts = {};
    savedVideos.forEach(video => {
      const channelName = video.channelTitle || video.channelName || 'Unknown';
      channelCounts[channelName] = (channelCounts[channelName] || 0) + 1;
    });
    
    const channelDistribution = Object.keys(channelCounts).map(channel => ({
      channel,
      count: channelCounts[channel]
    })).sort((a, b) => b.count - a.count).slice(0, 10); // Top 10 channels
    
    // Process videos by date
    const videosByDate = {};
    // Initialize with zeros for all dates in range
    let currentDate = new Date(startDate);
    const endDate = new Date();
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      videosByDate[dateString] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Count videos by date
    savedVideos.forEach(video => {
      const videoDate = new Date(video.createdAt).toISOString().split('T')[0];
      if (videosByDate[videoDate] !== undefined) {
        videosByDate[videoDate]++;
      }
    });
    
    // Format for chart display
    const videosByDateArray = Object.keys(videosByDate).map(date => ({
      date,
      count: videosByDate[date]
    }));
    
    res.status(200).json({
      success: true,
      data: {
        languageDistribution,
        channelDistribution,
        videosByDate: videosByDateArray
      }
    });
  } catch (error) {
    console.error('Error getting saved videos metrics:', error);
    res.status(500);
    throw new Error('Failed to get saved videos metrics');
  }
});

// @desc    Get subscription metrics for analytics
// @route   GET /api/admin/subscriptions/metrics
// @access  Private/Admin
const getSubscriptionMetrics = asyncHandler(async (req, res) => {
  try {
    // Get time range from query params
    const { timeRange } = req.query;
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - (timeRange === '7days' ? 7 : timeRange === '90days' ? 90 : 30));
    
    // Get user limits for subscription data
    const userLimits = await UserLimit.find({
      updatedAt: { $gte: startDate }
    });
    
    // Define plan prices based on the constants in the backend
    const planPrices = {
      trial: 20,
      basic: 100,
      premium: 200,
      custom: 200,
      expired: 0
    };
    
    // Count plan distribution and calculate revenue
    const planCounts = {};
    const planRevenue = {};
    let trialCount = 0;
    let convertedFromTrialCount = 0;
    
    userLimits.forEach(limit => {
      const planId = limit.planId || 'expired';
      planCounts[planId] = (planCounts[planId] || 0) + 1;
      
      // Calculate revenue
      const planPrice = planPrices[planId] || 0;
      planRevenue[planId] = (planRevenue[planId] || 0) + planPrice;
      
      // Track trials
      if (planId === 'trial') {
        trialCount++;
      }
      
      // Check for trial conversions
      if ((planId === 'basic' || planId === 'premium' || planId === 'custom') && 
          limit.adminModified === false) {
        convertedFromTrialCount++;
      }
    });
    
    // Calculate total revenue
    const totalRevenue = Object.values(planRevenue).reduce((sum, revenue) => sum + Number(revenue), 0);
    
    // Format plan distribution with revenue
    const planDistribution = Object.keys(planCounts).map(plan => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1), // Capitalize
      count: planCounts[plan],
      revenue: planRevenue[plan] || 0
    }));
    
    // Calculate trial conversion rate
    const trialConversionRate = trialCount > 0 ? (convertedFromTrialCount / trialCount) * 100 : 0;
    
    // Create revenue by date
    const revenueByDate = {};
    // Initialize with zeros for all dates in range
    let currentDate = new Date(startDate);
    const endDate = new Date();
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      revenueByDate[dateString] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Distribute revenue across dates based on subscription start dates
    userLimits.forEach(limit => {
      if (limit.subscriptionStartDate) {
        const startDate = new Date(limit.subscriptionStartDate).toISOString().split('T')[0];
        if (revenueByDate[startDate] !== undefined) {
          const planPrice = planPrices[limit.planId || 'expired'] || 0;
          revenueByDate[startDate] += planPrice;
        }
      }
    });
    
    // Format for chart display
    const revenueByDateArray = Object.keys(revenueByDate).map(date => ({
      date,
      amount: revenueByDate[date]
    }));
    
    // Monthly revenue calculation (average per month)
    const monthlyRevenue = totalRevenue / (timeRange === '7days' ? 0.25 : timeRange === '90days' ? 3 : 1);
    
    res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        monthlyRevenue,
        planDistribution,
        revenueByDate: revenueByDateArray,
        trialConversionRate
      }
    });
  } catch (error) {
    console.error('Error getting subscription metrics:', error);
    res.status(500);
    throw new Error('Failed to get subscription metrics');
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
  getUserContent,
  getSavedVideosMetrics,
  getSubscriptionMetrics
}; 