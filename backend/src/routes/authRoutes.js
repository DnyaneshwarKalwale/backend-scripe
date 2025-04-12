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
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent('Google authentication failed')}` }),
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
      
      // Use encoded parameters for the redirect
      const frontendUrl = process.env.FRONTEND_URL.trim();
      const redirectUrl = `${frontendUrl}/auth/social-callback?token=${encodeURIComponent(token)}&onboarding=${encodeURIComponent(onboardingStatus)}`;
      
      console.log('Redirecting to:', redirectUrl);
      
      // Redirect to frontend with token
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent('Internal server error during authentication')}`);
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
      
      // Always redirect to the main homepage instead of login with error query params
      return res.redirect(`${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent(req.query.error_description || 'LinkedIn authentication failed')}`);
    }
    
    // Check if auth code is present
    if (!req.query.code) {
      console.error('LinkedIn callback missing code parameter');
      return res.redirect(`${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent('Missing authorization code')}`);
    }
    
    // Proceed with LinkedIn authentication
    passport.authenticate('linkedin', { session: false })(req, res, next);
  },
  (req, res) => {
    try {
      if (!req.user) {
        console.error('LinkedIn auth successful but no user object');
        return res.redirect(`${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent('User profile not found')}`);
      }

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
      
      // Create the redirect URL to the frontend
      const frontendUrl = process.env.FRONTEND_URL.trim();
      const redirectUrl = `${frontendUrl}/auth/social-callback?token=${encodeURIComponent(token)}&onboarding=${encodeURIComponent(onboardingStatus)}`;
      
      console.log('Redirecting to frontend:', redirectUrl);
      
      // Direct redirect to frontend with token
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Error in LinkedIn callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}?auth_error=${encodeURIComponent('Authentication error')}`);
    }
  }
);

// Error handler specifically for LinkedIn auth failures
router.use((err, req, res, next) => {
  // Check if this is a LinkedIn auth error (from the callback route)
  if (req.originalUrl.includes('/linkedin/callback') && err) {
    console.error('LinkedIn authentication error middleware caught:');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Original URL:', req.originalUrl);
    console.error('Path:', req.path);
    
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
    
    const frontendUrl = process.env.FRONTEND_URL.trim();
    // Redirect to the main homepage with an error parameter instead
    const errorUrl = `${frontendUrl}?auth_error=${encodeURIComponent(errorDetails)}`;
    console.log('Redirecting to error URL:', errorUrl);
    
    // Redirect to homepage with appropriate error
    return res.redirect(errorUrl);
  }
  
  // For other errors, continue to the next error handler
  next(err);
});

// LinkedIn test route
router.get('/linkedin-test', (req, res) => {
  // Provide clear instructions for LinkedIn setup and testing
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LinkedIn Auth Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px; }
        code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; }
        .important { color: #cc0000; font-weight: bold; }
        button { background: #0077B5; color: white; border: none; padding: 10px 15px; cursor: pointer; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>LinkedIn Authentication Setup</h1>
      
      <div class="card">
        <h2>Step 1: LinkedIn Developer Portal Setup</h2>
        <p>In your LinkedIn Developer Portal, make sure you have <span class="important">ONLY</span> the following redirect URL:</p>
        <pre>${process.env.LINKEDIN_CALLBACK_URL}</pre>
        <p><span class="important">Important:</span> Do NOT add your frontend URL to LinkedIn's redirect URLs.</p>
      </div>
      
      <div class="card">
        <h2>Step 2: Verify Your Backend Config</h2>
        <p>Your current LinkedIn configuration:</p>
        <ul>
          <li>LINKEDIN_CALLBACK_URL: <code>${process.env.LINKEDIN_CALLBACK_URL || 'Not set'}</code></li>
          <li>FRONTEND_URL: <code>${process.env.FRONTEND_URL || 'Not set'}</code></li>
        </ul>
      </div>
      
      <div class="card">
        <h2>Step 3: Test Your Authentication Flow</h2>
        <p>Click the button below to test your LinkedIn authentication:</p>
        <button onclick="window.location.href='${req.protocol}://${req.get('host')}/api/auth/linkedin'">Test LinkedIn Login</button>
        <p>This will start the authentication process with LinkedIn.</p>
        <p>After authentication, the backend will automatically redirect to your frontend:</p>
        <code>${process.env.FRONTEND_URL}/auth/social-callback?token=YOUR_JWT_TOKEN&onboarding=true|false</code>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
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

  // Log what we're doing for debugging
  console.log(`Mock LinkedIn: Redirecting to ${process.env.FRONTEND_URL}/auth/social-callback with token and onboarding=true`);

  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${encodeURIComponent(token)}&onboarding=true`);
});

// HTML page for easy mock auth testing
router.get('/mock-auth-test', (req, res) => {
  // Only show this in development mode
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = process.env.LINKEDIN_CALLBACK_URL 
    ? process.env.LINKEDIN_CALLBACK_URL.split('/').slice(0, 3).join('/')
    : 'http://localhost:5000';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LinkedIn Auth Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        button { background: #0077B5; color: white; border: none; padding: 10px 15px; cursor: pointer; margin: 10px 0; }
        .card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px; }
        pre { background: #f5f5f5; padding: 10px; overflow: auto; }
      </style>
    </head>
    <body>
      <h1>LinkedIn Auth Testing Page</h1>
      
      <div class="card">
        <h2>Mock LinkedIn Login</h2>
        <p>This will simulate a successful LinkedIn login with a mock user:</p>
        <button onclick="window.location.href='${backendUrl}/api/auth/mock-linkedin-auth'">Login with Mock LinkedIn</button>
      </div>
      
      <div class="card">
        <h2>Real LinkedIn Login</h2>
        <p>This will initiate a real LinkedIn OAuth flow:</p>
        <button onclick="window.location.href='${backendUrl}/api/auth/linkedin'">Login with Real LinkedIn</button>
      </div>
      
      <div class="card">
        <h2>Debugging Info</h2>
        <p>Current configuration:</p>
        <pre>
Frontend URL: ${frontendUrl}
Backend URL: ${backendUrl}
Environment: ${process.env.NODE_ENV || 'development'}
        </pre>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
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