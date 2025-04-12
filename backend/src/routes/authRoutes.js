const express = require('express');
const passport = require('passport');
const { 
  registerUser, 
  loginUser, 
  getMe, 
  verifyEmail,
  verifyOTP,
  resendOTP,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleCallback,
  linkedinCallback,
  linkedinAuth,
  logout
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Email/password routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/verify-email/:token', verifyEmail);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/resend-verification', protect, resendVerification);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

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

// LinkedIn OAuth routes
router.get(
  '/linkedin',
  (req, res, next) => {
    console.log('Starting LinkedIn OAuth flow...');
    next();
  },
  passport.authenticate('linkedin', { 
    state: true,
    session: false
  })
);

router.get(
  '/linkedin/callback',
  (req, res, next) => {
    console.log('LinkedIn callback received');
    console.log('Session data:', req.session);
    
    passport.authenticate('linkedin', { 
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed` 
    })(req, res, next);
  },
  (req, res) => {
    try {
      // Generate token
      const token = req.user.getSignedJwtToken();
      
      // Check if onboarding is completed
      const onboardingStatus = req.user.onboardingCompleted ? 'false' : 'true';
      
      // Log successful authentication
      console.log('LinkedIn authentication successful:', {
        userId: req.user.id,
        email: req.user.email,
        onboardingStatus
      });
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${onboardingStatus}`);
    } catch (error) {
      console.error('Error in LinkedIn callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=internal_server_error`);
    }
  }
);

// Mock LinkedIn auth for development
router.get('/mock-linkedin-auth', (req, res) => {
  // Get parameters from query string or use defaults
  const { name, linkedinId, email, profileImage } = req.query;
  
  const fullName = name || 'LinkedIn User';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'LinkedIn';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';
  
  // Create a mock user profile
  const mockUser = {
    id: linkedinId || 'linkedin123456',
    firstName: firstName,
    lastName: lastName,
    email: email || 'linkedin.user@example.com',
    isEmailVerified: true,
    profilePicture: profileImage || 'https://via.placeholder.com/150',
    authMethod: 'linkedin',
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

  console.log('Mock LinkedIn authentication successful:', mockUser);

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

// Add the direct LinkedIn auth route 
router.post('/linkedin-auth', linkedinAuth);

module.exports = router; 