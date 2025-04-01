const passport = require('passport');

// Middleware to protect routes with better error handling
const protect = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Auth middleware error:', err);
      return res.status(500).json({
        success: false,
        message: 'Authentication error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Unauthorized - authentication required',
        redirectTo: '/login'
      });
    }
    
    // Set the user object in the request
    req.user = user;
    next();
  })(req, res, next);
};

// Middleware to check if onboarding is completed
const checkOnboarding = async (req, res, next) => {
  // Check if user exists in request
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated',
      redirectTo: '/login',
    });
  }
  
  // Check if onboarding is completed
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
  // Check if user exists in request
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated',
      redirectTo: '/login',
    });
  }
  
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
  // Check if user exists in request
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated',
      redirectTo: '/login',
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this resource',
    });
  }
  next();
};

module.exports = {
  protect,
  checkOnboarding,
  checkEmailVerified,
  checkAdmin,
}; 