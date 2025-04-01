const passport = require('passport');

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

module.exports = {
  protect,
  checkOnboarding,
  checkEmailVerified,
  checkAdmin,
}; 