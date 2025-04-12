const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');

// LinkedIn API base URL
const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/v2';

/**
 * Get LinkedIn user profile data
 * @route GET /api/linkedin/profile
 * @access Private
 */
const getLinkedInProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // In a real implementation, we would use the LinkedIn API client
    // to fetch real user data using access tokens stored for this user
    
    // For now, generate sample data based on the user's info
    const username = user.firstName.toLowerCase() + (user.lastName ? user.lastName.toLowerCase() : '');
    
    const linkedinProfile = {
      id: user.linkedinId,
      username: username,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
      bio: `LinkedIn professional connected with Lovable. Generating amazing content with AI.`,
      location: "Global",
      url: `https://linkedin.com/in/${username}`,
      joinedDate: "January 2022",
      connections: 512,
      followers: 1024,
      verified: false
    };
    
    res.status(200).json({
      success: true,
      data: linkedinProfile
    });
  } catch (error) {
    console.error('LinkedIn Profile Error:', error);
    res.status(500);
    throw new Error('Error fetching LinkedIn profile');
  }
});

/**
 * Get user's recent posts
 * @route GET /api/linkedin/posts
 * @access Private
 */
const getUserPosts = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Generate sample posts
    const recentPosts = [
      {
        id: `post-${Date.now()}-1`,
        text: "Just started using Lovable for my LinkedIn content generation! The AI suggestions are amazing. #ContentCreation #AI",
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        public_metrics: {
          shares: 12,
          comments: 5,
          likes: 42,
          impressions: 1250
        }
      },
      {
        id: `post-${Date.now()}-2`,
        text: "How I increased my LinkedIn engagement by 300% using AI content generation. A thread on my journey with @Lovable 🧵",
        created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        public_metrics: {
          shares: 24,
          comments: 18,
          likes: 89,
          impressions: 3500
        }
      },
      {
        id: `post-${Date.now()}-3`,
        text: "5 ways to improve your LinkedIn content:\n\n1. Consistency\n2. Engage with your audience\n3. Use AI tools like @Lovable\n4. Analyze performance\n5. Join relevant conversations\n\nWhich one are you implementing today?",
        created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        public_metrics: {
          shares: 38,
          comments: 22,
          likes: 112,
          impressions: 5200
        }
      }
    ];
    
    res.status(200).json({
      success: true,
      data: recentPosts
    });
  } catch (error) {
    console.error('LinkedIn Posts Error:', error);
    res.status(500);
    throw new Error('Error fetching posts');
  }
});

/**
 * Get user's LinkedIn analytics
 * @route GET /api/linkedin/analytics
 * @access Private
 */
const getLinkedInAnalytics = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Generate sample analytics data
    const now = Date.now();
    const days = 7;
    const labels = [];
    const impressionsData = [];
    const engagementData = [];
    const followersData = [];
    
    // Generate data for the last 7 days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - (i * 86400000));
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      // Generate realistic-looking data with some randomness but general upward trend
      const dayOffset = days - i;
      
      // Impressions: 1000-3500 with slight upward trend
      impressionsData.push(Math.floor(1000 + (dayOffset * 300) + (Math.random() * 500)));
      
      // Engagement: 4-10% engagement rate
      engagementData.push(Number((4 + (dayOffset * 0.6) + (Math.random() * 2)).toFixed(1)));
      
      // Followers: 100-200 with growth
      followersData.push(Math.floor(100 + (dayOffset * 5) + (Math.random() * 10)));
    }
    
    const analyticsData = {
      impressions: {
        data: impressionsData,
        labels: labels,
        increase: 23,
        timeframe: "Last 7 days"
      },
      engagement: {
        data: engagementData,
        labels: labels,
        increase: 15,
        timeframe: "Last 7 days"
      },
      followers: {
        data: followersData,
        labels: labels,
        increase: 8,
        timeframe: "Last 7 days"
      },
      summary: {
        totalImpressions: impressionsData.reduce((a, b) => a + b, 0),
        averageEngagement: Number((engagementData.reduce((a, b) => a + b, 0) / days).toFixed(1)),
        followerGrowth: followersData[days - 1] - followersData[0],
        bestPerformingPost: {
          text: "How I increased my LinkedIn engagement by 300% using AI content generation. A thread on my journey with @Lovable 🧵",
          impressions: 3500,
          engagement: 9.3
        }
      }
    };
    
    res.status(200).json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('LinkedIn Analytics Error:', error);
    res.status(500);
    throw new Error('Error fetching analytics');
  }
});

module.exports = {
  getLinkedInProfile,
  getUserPosts,
  getLinkedInAnalytics
}; 