const passport = require('passport');
const UserLimit = require('../models/userLimitModel');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

// Middleware to protect routes
const protect = async (req, res, next) => {
  // Set CORS headers for all protected routes
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
      return;
    }
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
    return;
  }
};

// Middleware to check if onboarding is completed
const checkOnboarding = async (req, res, next) => {
  // User is attached by passport middleware
  if (!req.user.onboardingCompleted) {
    return res.status(403).json({
      success: false,
      message: 'Please complete onboarding before accessing this resource',
      redirectTo: '/onboarding',
    });
  }
  next();
};

// Middleware to check if user has completed email verification
const checkEmailVerified = async (req, res, next) => {
  if (req.user.authMethod === 'email' && !req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before accessing this resource',
      redirectTo: '/verify-email',
    });
  }
  next();
};

// Middleware to check admin role
const checkAdmin = (req, res, next) => {
  // Set CORS headers for admin routes
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Not authorized as admin'
    });
  }
};

// Middleware to check user limits
const checkUserLimit = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    let userLimit = await UserLimit.findOne({ userId });
    
    // If no limit record exists, create one with default values
    if (!userLimit) {
      userLimit = await UserLimit.create({
        userId,
        limit: 0, // Changed default to 0 (requires subscription)
        count: 0,
        planId: 'expired',
        planName: 'No Plan',
        status: 'inactive',
        expiresAt: null
      });
    }
    
    // First check if the subscription has expired
    const now = new Date();
    const isExpired = userLimit.expiresAt && now > new Date(userLimit.expiresAt);
    
    // If subscription is expired, prevent carousel creation and update plan status
    if (isExpired || userLimit.planId === 'expired') {
      // Update the userLimit status if it's expired but not marked as such
      if (isExpired && userLimit.planId !== 'expired') {
        userLimit.planId = 'expired';
        userLimit.planName = 'No Plan';
        userLimit.status = 'inactive';
        // Don't set limit to 0 yet to allow usage stats to be accurate
        await userLimit.save();
      }
      
      return res.status(402).json({  // 402 Payment Required
        success: false,
        message: 'Your subscription has expired. Please purchase a plan to create carousel requests.',
        currentCount: userLimit.count,
        limit: userLimit.limit,
        isExpired: true,
        expiredAt: userLimit.expiresAt
      });
    }
    
    // Check if user has reached their limit
    if (userLimit.count >= userLimit.limit) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your carousel request limit. Please upgrade your plan for more requests.',
        currentCount: userLimit.count,
        limit: userLimit.limit
      });
    }
    
    // Attach userLimit to request for use in controller
    req.userLimit = userLimit;
    next();
  } catch (error) {
    console.error('Error checking user limit:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking user limit',
      error: error.message
    });
  }
};

// Helper function to check if user is admin
const isAdmin = (user) => {
  return user && user.role === 'admin';
};

module.exports = {
  protect,
  checkOnboarding,
  checkEmailVerified,
  checkAdmin,
  admin: checkAdmin,
  isAdmin: checkAdmin,
  checkUserLimit
}; 