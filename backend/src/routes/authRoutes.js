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
  checkEmailExists,
  updateUser
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Email/password routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/check-email', checkEmailExists);
router.put('/update-user', protect, updateUser);

// Password reset
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', googleCallback);

router.get('/twitter', passport.authenticate('twitter'));
router.get('/twitter/callback', twitterCallback);

// Direct Twitter auth for development
router.post('/twitter-auth', twitterAuth);

// Mock Twitter auth callback for development
router.get('/mock-twitter-auth', (req, res) => {
  const { name, twitterId, email, profileImage } = req.query;
  
  // Create a simple auth process that mimics what we'd get from Twitter OAuth
  if (!name || !twitterId) {
    return res.status(400).send('Missing required Twitter login parameters');
  }
  
  // This is a mocked endpoint so we'll just redirect to a URL that the frontend can catch
  // In a real app, this would be handled properly with session state
  const params = new URLSearchParams({
    name,
    twitterId,
    ...(email && { email }),
    ...(profileImage && { profileImage })
  });

  // Redirect back to the frontend with the parameters
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?${params.toString()}`);
});

module.exports = router; 