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

// Routes that require authentication
router.post('/create-checkout-session', protect, createCheckoutSession);
router.get('/subscription', protect, getSubscription);
router.post('/cancel-subscription', protect, cancelSubscription);

// Webhook doesn't require authentication as it's called by Stripe
router.post('/webhook', handleWebhook);

// Verify session
router.post('/verify-session', protect, verifySession);

module.exports = router;
