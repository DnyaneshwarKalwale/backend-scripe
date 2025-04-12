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
  logout,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  initiateLinkedInAuth,
  linkedInCallback
} = require('../controllers/linkedinController');

const router = express.Router();

// Public Routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.get('/logout', logout);

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', googleCallback);

// LinkedIn OAuth Routes
router.get('/linkedin', passport.authenticate('linkedin', { scope: ['r_emailaddress', 'r_liteprofile'] }));
router.get('/linkedin/callback', passport.authenticate('linkedin', { session: true, failureRedirect: '/api/auth/linkedin-failure' }), linkedInCallback);
router.get('/linkedin-failure', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_authentication_failed`);
});

// Protected Routes
router.get('/me', protect, getMe);
router.post('/resend-verification', protect, resendVerification);

module.exports = router; 