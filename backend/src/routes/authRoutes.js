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
const axios = require('axios');
const User = require('../models/userModel');

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

// Direct LinkedIn OAuth route (without Passport)
router.get('/linkedin-direct', (req, res) => {
  try {
    // Store connection type and Google user ID in session for callback processing
    const connectType = req.query.type;
    const googleUserId = req.query.googleUserId;
    
    if (connectType === 'google_connect' && googleUserId) {
      req.session.connectType = 'google_connect';
      req.session.googleUserId = googleUserId;
      console.log('Storing Google user LinkedIn connection request:', { googleUserId, connectType });
    }
    
    // Generate LinkedIn authorization URL with OpenID Connect scopes
    console.log('Generating LinkedIn authorization URL with OpenID Connect');
    console.log('Using client ID:', process.env.LINKEDIN_CLIENT_ID.substring(0, 3) + '...');
    console.log('Using callback URL:', process.env.LINKEDIN_DIRECT_CALLBACK_URL || `${process.env.BACKEND_URL || 'https://api.brandout.ai'}/api/auth/linkedin-direct/callback`);
    
    // Use a specific callback URL for direct auth
    const callbackUrl = process.env.LINKEDIN_DIRECT_CALLBACK_URL || `${process.env.BACKEND_URL || 'https://api.brandout.ai'}/api/auth/linkedin-direct/callback`;
    
    // Using OpenID Connect scopes: openid, profile, email, and w_member_social for posting
    const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=openid%20profile%20email%20w_member_social&state=${Math.random().toString(36).substring(2, 15)}`;
    
    console.log('Generated URL:', linkedinAuthUrl);
    res.redirect(linkedinAuthUrl);
  } catch (error) {
    console.error('Error generating LinkedIn auth URL:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed`);
  }
});

// Direct LinkedIn callback handler (without Passport)
router.get('/linkedin-direct/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  
  // Check for LinkedIn error
  if (error) {
    console.error('LinkedIn returned an error:', error);
    console.error('Error description:', error_description);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_oauth_failed&details=${encodeURIComponent(error_description || '')}`);
  }
  
  if (!code) {
    console.error('No authorization code received from LinkedIn');
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
  }
  
  try {
    // Use a specific callback URL for direct auth
    const callbackUrl = process.env.LINKEDIN_DIRECT_CALLBACK_URL || `${process.env.BACKEND_URL || 'https://api.brandout.ai'}/api/auth/linkedin-direct/callback`;
    
    console.log('Received authorization code, exchanging for access token');
    // Exchange authorization code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Access token received');
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // With OpenID Connect, we can get user info from the userinfo endpoint
    console.log('Fetching user info from OpenID Connect userinfo endpoint');
    const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    console.log('User info received:', JSON.stringify(userInfoResponse.data, null, 2));
    
    // Calculate token expiry time
    const tokenExpiryTime = new Date();
    tokenExpiryTime.setSeconds(tokenExpiryTime.getSeconds() + (expires_in || 3600));
    
    // Extract data from LinkedIn response
    const { sub: linkedinId, email, given_name: firstName, family_name: lastName, picture } = userInfoResponse.data;
    
    // Check if this is a Google user connecting LinkedIn
    const connectType = req.session.connectType;
    const googleUserId = req.session.googleUserId;
    
    if (connectType === 'google_connect' && googleUserId) {
      console.log('Processing LinkedIn connection for Google user:', googleUserId);
      
      // Find the Google user
      const user = await User.findById(googleUserId);
      
      if (!user) {
        console.error('Google user not found:', googleUserId);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=user_not_found`);
      }
      
             // Update Google user with LinkedIn information
       user.linkedinId = linkedinId;
       user.linkedinAccessToken = access_token;
       user.linkedinRefreshToken = refresh_token;
       user.linkedinTokenExpiry = tokenExpiryTime;
       user.linkedinConnected = true;
       
       // Keep authMethod as 'google' but log that LinkedIn is now connected
       console.log(`Google user now has LinkedIn connected. AuthMethod remains "${user.authMethod}" but linkedinConnected is now true`);
       
       // Mark onboarding as completed if not already
       if (!user.onboardingCompleted) {
         console.log('Marking onboarding as completed for Google user connecting LinkedIn');
         user.onboardingCompleted = true;
       }
       
       // Update profile information to use LinkedIn data (if user chooses to)
       // Update name if LinkedIn has different name
       if (firstName && firstName !== user.firstName) {
         console.log(`Updating user name from "${user.firstName}" to "${firstName}"`);
         user.firstName = firstName;
       }
       if (lastName && lastName !== user.lastName) {
         console.log(`Updating user last name from "${user.lastName}" to "${lastName}"`);
         user.lastName = lastName;
       }
       
       // Update profile picture to LinkedIn's if it exists and is different
       if (picture && picture !== user.profilePicture) {
         console.log('Updating profile picture to LinkedIn version');
         user.profilePicture = picture;
       }
      
      await user.save();
      
      // Clear session data
      delete req.session.connectType;
      delete req.session.googleUserId;
      
      console.log('Google user successfully connected to LinkedIn');
      
      // Generate new token with updated user data
      const token = user.getSignedJwtToken();
      
      // Redirect to frontend with the user's token and indicate LinkedIn was connected
      return res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=false&linkedin_connected=true`);
    }
    
    // Handle regular LinkedIn authentication (not Google user connection)
    let user = await User.findOne({ linkedinId });
    
    // If not found by LinkedIn ID, try to find by email
    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        // Update user with LinkedIn ID if found by email
        user.linkedinId = linkedinId;
        // Clear any previous LinkedIn tokens before setting new ones
        user.linkedinAccessToken = null;
        user.linkedinRefreshToken = null;
        user.linkedinTokenExpiry = null;

        // Set new tokens
        user.linkedinAccessToken = access_token;
        user.linkedinRefreshToken = refresh_token;
        user.linkedinTokenExpiry = tokenExpiryTime;
        user.linkedinConnected = true;
        
        if (!user.profilePicture && picture) {
          user.profilePicture = picture;
        }
        
        await user.save();
        console.log(`Updated existing user ${user._id} with fresh LinkedIn credentials`);
      }
    } else if (user) {
      // User found by LinkedIn ID - update tokens
      console.log(`Found existing user ${user._id} with LinkedIn ID ${linkedinId}, updating tokens`);
      
      // Clear old tokens and set new ones
      user.linkedinAccessToken = access_token;
      user.linkedinRefreshToken = refresh_token;
      user.linkedinTokenExpiry = tokenExpiryTime;
      user.linkedinConnected = true;
      await user.save();
      
      console.log(`LinkedIn tokens updated for user ${user._id}, new expiry: ${tokenExpiryTime}`);
    }
    
    // If user still not found, create a new one
    if (!user) {
      if (!email) {
        console.error('LinkedIn did not provide an email address');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_required`);
      }
      
      console.log('Creating new user with LinkedIn credentials');
      user = await User.create({
        linkedinId,
        firstName: firstName || 'LinkedIn',
        lastName: lastName || 'User',
        email,
        isEmailVerified: true, // LinkedIn emails are verified
        profilePicture: picture || null,
        authMethod: 'linkedin',
        onboardingCompleted: false,
        linkedinAccessToken: access_token,
        linkedinRefreshToken: refresh_token,
        linkedinTokenExpiry: tokenExpiryTime,
        linkedinConnected: true
      });
      
      console.log(`New user created with LinkedIn ID ${linkedinId} and ID ${user._id}`);
    }
    
    // Generate token
    const token = user.getSignedJwtToken();
    
    // Check if onboarding is completed
    const needsOnboarding = user.onboardingCompleted ? 'false' : 'true';
    
    // Log successful authentication
    console.log('LinkedIn authentication successful:', {
      userId: user.id,
      email: user.email,
      needsOnboarding
    });
    
    // Redirect to frontend with token and explicit onboarding parameter
    res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${needsOnboarding}`);
  } catch (error) {
    console.error('LinkedIn auth error details:', error.response ? JSON.stringify(error.response.data) : error.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

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
      const needsOnboarding = req.user.onboardingCompleted ? 'false' : 'true';
      
      // Log successful authentication
      console.log('LinkedIn authentication successful:', {
        userId: req.user.id,
        email: req.user.email,
        needsOnboarding
      });
      
      // Redirect to frontend with token and explicit onboarding parameter
      res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${needsOnboarding}`);
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