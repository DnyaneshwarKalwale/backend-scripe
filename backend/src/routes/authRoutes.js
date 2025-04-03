const express = require('express');
const passport = require('passport');
const { 
  registerUser, 
  loginUser, 
  getMe, 
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleCallback,
  twitterCallback,
  twitterAuth,
  logout
} = require('../controllers/authController');
const { verifyOTP, resendOTP } = require('../controllers/otpController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Email/password routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.get('/logout', logout);

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed` }),
  (req, res) => {
    try {
      // Generate token
      const token = req.user.getSignedJwtToken();
      
      // Check if onboarding is completed
      const onboardingStatus = req.user.onboardingCompleted ? 'false' : 'true';
      
      // Log successful authentication
      console.log('Google authentication successful:', {
        userId: req.user.id,
        email: req.user.email || '(email not provided)',
        onboardingStatus,
        emailSource: req.user.email && req.user.email.includes('@placeholder.scripe.com') ? 'generated' : 'provided by user'
      });
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${onboardingStatus}`);
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=internal_server_error`);
    }
  }
);

// Twitter OAuth routes
router.get(
  '/twitter',
  (req, res, next) => {
    console.log('Starting Twitter OAuth flow...');
    // Clear any existing request tokens to avoid conflicts
    if (req.session) {
      delete req.session.oauth;
    }
    next();
  },
  passport.authenticate('twitter', { 
    includeEmail: true,
    session: true // Use session for storing Twitter OAuth tokens
  })
);

router.get(
  '/twitter/callback',
  (req, res, next) => {
    console.log('Twitter callback received');
    console.log('Session data:', req.session);
    
    passport.authenticate('twitter', { 
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=twitter_oauth_failed` 
    })(req, res, next);
  },
  (req, res) => {
    try {
      // Generate token
      const token = req.user.getSignedJwtToken();
      
      // Check if onboarding is completed
      const onboardingStatus = req.user.onboardingCompleted ? 'false' : 'true';
      
      // Log successful authentication
      console.log('Twitter authentication successful:', {
        userId: req.user.id,
        email: req.user.email || '(email not provided)',
        onboardingStatus,
        emailSource: req.user.email && req.user.email.includes('@placeholder.scripe.com') ? 'generated' : 'provided by user'
      });
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${onboardingStatus}`);
    } catch (error) {
      console.error('Error in Twitter callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=internal_server_error`);
    }
  }
);

// Mock Twitter auth for development
router.get('/mock-twitter-auth', (req, res) => {
  // Get parameters from query string or use defaults
  const { name, twitterId, email, profileImage } = req.query;
  
  const fullName = name || 'Twitter User';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Twitter';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';
  
  // Create a mock user profile
  const mockUser = {
    id: twitterId || 'twitter123456',
    firstName: firstName,
    lastName: lastName,
    email: email || 'twitter.user@example.com',
    isEmailVerified: true,
    profilePicture: profileImage || 'https://via.placeholder.com/150',
    authMethod: 'twitter',
    onboardingCompleted: false,
    getSignedJwtToken: function() {
      const jwt = require('jsonwebtoken');
      return jwt.sign(
        { id: this.id, email: this.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
      );
    }
  };

  console.log('Mock Twitter authentication successful:', mockUser);

  // Generate token
  const token = mockUser.getSignedJwtToken();

  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=true`);
});

// Simple direct development login (no OAuth)
router.get('/dev-login', (req, res) => {
  // Create a mock admin user
  const mockUser = {
    id: 'dev_admin_123',
    firstName: 'Developer',
    lastName: 'Admin',
    email: 'dev.admin@example.com',
    isEmailVerified: true,
    profilePicture: 'https://via.placeholder.com/150',
    authMethod: 'dev',
    onboardingCompleted: false,
  };

  // Generate token
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: mockUser.id, email: mockUser.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

  console.log('Dev login successful:', mockUser);

  // Return the token in JSON format or redirect
  if (req.query.redirect === 'true') {
    res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=true`);
  } else {
    res.json({
      success: true,
      token,
      user: mockUser
    });
  }
});

// Add the direct Twitter auth route 
router.post('/twitter-auth', twitterAuth);

module.exports = router; 