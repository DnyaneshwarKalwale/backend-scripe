const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCheckoutSession,
  handleWebhook,
  getSubscription,
  cancelSubscription,
  verifySession
} = require('../controllers/stripeController');

// CORS handling middleware
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

// Routes that require authentication
router.post('/create-checkout-session', protect, createCheckoutSession);
router.get('/subscription', protect, getSubscription);
router.post('/cancel-subscription', protect, cancelSubscription);

// Webhook doesn't require authentication as it's called by Stripe
router.post('/webhook', handleWebhook);

// Verify session
router.post('/verify-session', protect, verifySession);

module.exports = router;
