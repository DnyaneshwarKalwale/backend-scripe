const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const { getTranslation } = require('../utils/translations');

// Twitter API v2 base URL
const TWITTER_API_BASE_URL = 'https://api.twitter.com/2';

/**
 * Get Twitter user profile data
 * @route GET /api/twitter/profile
 * @access Private
 */
const getTwitterProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.twitterId) {
      res.status(400);
      throw new Error(getTranslation('twitterNotConnected', req.language));
    }
    
    // In a real implementation, we would use the Twitter API client
    // to fetch real user data using access tokens stored for this user
    
    // For now, generate sample data based on the user's info
    const username = user.firstName.toLowerCase() + (user.lastName ? user.lastName.toLowerCase() : '');
    
    const twitterProfile = {
      id: user.twitterId,
      username: username,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
      bio: `Twitter user connected with Dekcion. Generating amazing content with AI.`,
      location: "Global",
      url: `https://twitter.com/${username}`,
      joinedDate: "January 2022",
      following: 512,
      followers: 1024,
      verified: false
    };
    
    res.status(200).json({
      success: true,
      data: twitterProfile
    });
  } catch (error) {
    console.error('Twitter Profile Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterFetchError', req.language) || 'Error fetching Twitter profile');
  }
});

/**
 * Get user's recent tweets
 * @route GET /api/twitter/tweets
 * @access Private
 */
const getUserTweets = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.twitterId) {
      res.status(400);
      throw new Error(getTranslation('twitterNotConnected', req.language));
    }
    
    // Generate sample tweets
    const recentTweets = [
      {
        id: `tweet-${Date.now()}-1`,
        text: "Just started using Dekcion for my Twitter content generation! The AI suggestions are amazing. #ContentCreation #AI",
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        public_metrics: {
          retweet_count: 12,
          reply_count: 5,
          like_count: 42,
          quote_count: 3,
          impression_count: 1250
        }
      },
      {
        id: `tweet-${Date.now()}-2`,
        text: "How I increased my Twitter engagement by 300% using AI content generation. A thread on my journey with @Dekcion 🧵",
        created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        public_metrics: {
          retweet_count: 24,
          reply_count: 18,
          like_count: 89,
          quote_count: 7,
          impression_count: 3500
        }
      },
      {
        id: `tweet-${Date.now()}-3`,
        text: "5 ways to improve your Twitter content:\n\n1. Consistency\n2. Engage with your audience\n3. Use AI tools like @Dekcion\n4. Analyze performance\n5. Join relevant conversations\n\nWhich one are you implementing today?",
        created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        public_metrics: {
          retweet_count: 38,
          reply_count: 22,
          like_count: 112,
          quote_count: 9,
          impression_count: 5200
        }
      }
    ];
    
    res.status(200).json({
      success: true,
      data: recentTweets
    });
  } catch (error) {
    console.error('Twitter Tweets Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterFetchError', req.language) || 'Error fetching tweets');
  }
});

/**
 * Get user's Twitter analytics
 * @route GET /api/twitter/analytics
 * @access Private
 */
const getTwitterAnalytics = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.twitterId) {
      res.status(400);
      throw new Error(getTranslation('twitterNotConnected', req.language));
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
        bestPerformingTweet: {
          text: "How I increased my Twitter engagement by 300% using AI content generation. A thread on my journey with @Dekcion 🧵",
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
    console.error('Twitter Analytics Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterFetchError', req.language) || 'Error fetching analytics');
  }
});

module.exports = {
  getTwitterProfile,
  getUserTweets,
  getTwitterAnalytics
}; 