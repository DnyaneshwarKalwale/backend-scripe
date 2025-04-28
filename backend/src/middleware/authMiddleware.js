const passport = require('passport');
const UserLimit = require('../models/userLimitModel');

// Middleware to protect routes
const protect = passport.authenticate('jwt', { session: false });

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
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this resource',
    });
  }
  next();
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
        limit: 10, // Default limit
        count: 0
      });
    }
    
    // Check if user has reached their limit
    if (userLimit.count >= userLimit.limit) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your carousel request limit. Please contact admin for more requests.',
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

module.exports = {
  protect,
  checkOnboarding,
  checkEmailVerified,
  checkAdmin,
  admin: checkAdmin,
  checkUserLimit
}; 