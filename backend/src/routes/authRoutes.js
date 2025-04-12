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
    console.log('Query params:', req.query);
    
    // Check for LinkedIn error
    if (req.query.error) {
      console.error('LinkedIn returned an error:', req.query.error);
      console.error('Error description:', req.query.error_description);
      
      // Handle common LinkedIn errors
      if (req.query.error_description && req.query.error_description.includes('scope')) {
        console.error('This appears to be a scope authorization issue. Please check your LinkedIn app settings.');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_scope_unauthorized&details=${encodeURIComponent(req.query.error_description)}`);
      }
      
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed&details=${encodeURIComponent(req.query.error_description || '')}`);
    }
    
    // Check if auth code is present (a basic validation)
    if (!req.query.code) {
      console.error('LinkedIn callback missing code parameter');
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed&details=Missing authorization code`);
    }
    
    // Use a try-catch to catch any synchronous errors in passport authenticate
    try {
      passport.authenticate('linkedin', { 
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed`,
        failWithError: true
      })(req, res, next);
    } catch (error) {
      console.error('Error during LinkedIn authentication:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed&details=Authentication process failed`);
    }
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

// Error handler specifically for LinkedIn auth failures
router.use((err, req, res, next) => {
  // Check if this is a LinkedIn auth error (from the callback route)
  if (req.path === '/linkedin/callback' && err) {
    console.error('LinkedIn authentication error middleware caught:', err);
    
    // Create a readable error message for the user
    let errorDetails = 'Authentication failed';
    if (err.message) {
      errorDetails = err.message;
      
      // Look for specific known error messages
      if (err.message.includes('failed to fetch user profile')) {
        errorDetails = 'Failed to retrieve LinkedIn profile. Please try again later.';
      } else if (err.message.includes('Invalid OAuth state')) {
        errorDetails = 'Security verification failed. Please try again.';
      } else if (err.message.includes('access_denied')) {
        errorDetails = 'LinkedIn access was denied or cancelled.';
      }
    }
    
    // Redirect to login with appropriate error
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed&details=${encodeURIComponent(errorDetails)}`);
  }
  
  // For other errors, continue to the next error handler
  next(err);
});

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

// Debug route for LinkedIn configuration
router.get('/linkedin-debug', (req, res) => {
  try {
    // Check LinkedIn configuration
    const linkedinConfig = {
      clientID: process.env.LINKEDIN_CLIENT_ID ? '✓ Configured' : '✗ Missing',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ? '✓ Configured' : '✗ Missing',
      callbackURL: process.env.LINKEDIN_CALLBACK_URL ? process.env.LINKEDIN_CALLBACK_URL : '✗ Missing',
      scope: ['openid', 'profile', 'email'],
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    // Check axios installation
    let axiosStatus = '✓ Installed';
    try {
      require('axios');
    } catch (error) {
      axiosStatus = '✗ Not installed or accessible';
    }
    
    res.json({
      success: true,
      message: 'LinkedIn debug information',
      config: linkedinConfig,
      dependencies: {
        axios: axiosStatus
      },
      networkTest: {
        message: 'Check server logs for network test results'
      }
    });
    
    // Perform a simple network test in the background
    console.log('LinkedIn debug - Testing network access to LinkedIn API endpoints...');
    const axios = require('axios');
    axios.get('https://api.linkedin.com/v2/', { timeout: 5000 })
      .then(response => {
        console.log('LinkedIn debug - API root accessible:', response.status);
      })
      .catch(error => {
        console.error('LinkedIn debug - API root test failed:', error.message);
      });
      
  } catch (error) {
    console.error('Error in LinkedIn debug route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve LinkedIn debug information'
    });
  }
});

// LinkedIn auth logging (for production troubleshooting)
router.post('/linkedin-auth-log', (req, res) => {
  try {
    const { error, details, clientInfo } = req.body;
    
    console.log('LinkedIn auth client-side error log:');
    console.log('Error:', error);
    console.log('Details:', details);
    console.log('Client Info:', clientInfo);
    
    // Always return success to avoid exposing info
    res.json({ received: true });
  } catch (err) {
    console.error('Error in LinkedIn logging endpoint:', err);
    res.json({ received: true });
  }
});

module.exports = router; 