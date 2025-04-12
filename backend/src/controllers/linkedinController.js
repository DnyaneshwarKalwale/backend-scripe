const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const { getTranslation } = require('../utils/translations');
const passport = require('passport');
const { generateToken } = require('../utils/jwt');

/**
 * Initiates LinkedIn OAuth flow
 * @route GET /api/auth/linkedin
 * @access Public
 */
const initiateLinkedInAuth = asyncHandler(async (req, res, next) => {
  passport.authenticate('linkedin')(req, res, next);
});

/**
 * LinkedIn OAuth callback handler
 * @route GET /api/auth/linkedin/callback
 * @access Public
 */
const linkedInCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate('linkedin', { session: false }, async (err, profile) => {
    if (err || !profile) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?error=LinkedIn%20authentication%20failed`);
    }

    try {
      // Extract profile information
      const linkedinId = profile.id;
      const firstName = profile.name.givenName || '';
      const lastName = profile.name.familyName || '';
      const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : '';
      const profilePicture = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '';

      // Look for existing user by LinkedIn ID
      let user = await User.findOne({ linkedinId });

      // If not found by LinkedIn ID but email is provided, try to find by email
      if (!user && email) {
        user = await User.findOne({ email });
        if (user) {
          // Update user with LinkedIn ID if found by email
          user.linkedinId = linkedinId;
          if (!user.profilePicture && profilePicture) {
            user.profilePicture = profilePicture;
          }
          await user.save();
        }
      }

      // If user still not found, create a new one
      if (!user) {
        user = await User.create({
          linkedinId,
          firstName,
          lastName,
          email,
          isEmailVerified: email ? true : false,
          profilePicture: profilePicture || null,
          authMethod: 'linkedin',
          onboardingCompleted: false,
        });
      }

      // Generate JWT token
      const token = user.getSignedJwtToken();

      // Redirect back to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&provider=linkedin&onboarding=${!user.onboardingCompleted}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('LinkedIn Auth Error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?error=LinkedIn%20authentication%20failed`);
    }
  })(req, res, next);
});

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
      throw new Error(getTranslation('linkedinNotConnected', req.language));
    }
    
    // In a real implementation, we would use the LinkedIn API client
    // to fetch real user data using access tokens stored for this user
    
    // For now, generate sample data based on the user's info
    const linkedinProfile = {
      id: user.linkedinId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
      headline: `Professional at ${user.firstName}'s Company`,
      location: "Global",
      industry: "Technology",
      connectionCount: 500,
      isVerified: true
    };
    
    res.status(200).json({
      success: true,
      data: linkedinProfile
    });
  } catch (error) {
    console.error('LinkedIn Profile Error:', error);
    res.status(500);
    throw new Error(getTranslation('linkedinFetchError', req.language) || 'Error fetching LinkedIn profile');
  }
});

/**
 * Get LinkedIn analytics for the user
 * @route GET /api/linkedin/analytics
 * @access Private
 */
const getLinkedInAnalytics = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error(getTranslation('linkedinNotConnected', req.language));
    }
    
    // Generate sample analytics data
    const now = Date.now();
    const days = 7;
    const labels = [];
    const viewsData = [];
    const engagementData = [];
    const followerData = [];
    
    // Generate data for the last 7 days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - (i * 86400000));
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      // Generate realistic-looking data with some randomness but general upward trend
      const dayOffset = days - i;
      
      // Profile views: 50-250 with slight upward trend
      viewsData.push(Math.floor(50 + (dayOffset * 25) + (Math.random() * 50)));
      
      // Engagement: 2-8% engagement rate
      engagementData.push(Number((2 + (dayOffset * 0.5) + (Math.random() * 2)).toFixed(1)));
      
      // Followers: 5-20 new followers per day with growth
      followerData.push(Math.floor(5 + (dayOffset * 2) + (Math.random() * 5)));
    }
    
    const analyticsData = {
      views: {
        data: viewsData,
        labels: labels,
        increase: 28,
        timeframe: "Last 7 days"
      },
      engagement: {
        data: engagementData,
        labels: labels,
        increase: 12,
        timeframe: "Last 7 days"
      },
      followers: {
        data: followerData,
        labels: labels,
        increase: 15,
        timeframe: "Last 7 days"
      },
      summary: {
        totalViews: viewsData.reduce((a, b) => a + b, 0),
        averageEngagement: Number((engagementData.reduce((a, b) => a + b, 0) / days).toFixed(1)),
        newFollowers: followerData.reduce((a, b) => a + b, 0),
        bestPerformingPost: {
          title: "How I increased my LinkedIn engagement by 200% using AI content generation.",
          views: 750,
          engagement: 5.8
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
    throw new Error(getTranslation('linkedinFetchError', req.language) || 'Error fetching analytics');
  }
});

module.exports = {
  initiateLinkedInAuth,
  linkedInCallback,
  getLinkedInProfile,
  getLinkedInAnalytics
}; 