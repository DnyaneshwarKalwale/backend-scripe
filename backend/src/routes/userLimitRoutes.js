const express = require('express');
const router = express.Router();
const userLimitController = require('../controllers/userLimitController');
const { checkAdmin, protect } = require('../middleware/authMiddleware');

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

// Get current user's limit
router.get('/me', protect, userLimitController.getCurrentUserLimit);

// Get all user limits (Admin only)
router.get('/all', protect, checkAdmin, userLimitController.getAllUserLimits);

// Get user's limit
router.get('/:userId', protect, userLimitController.getUserLimit);

// Increment user's count
router.post('/:userId/increment', protect, userLimitController.incrementUserCount);

// Reset user limit
router.post('/:userId/reset', protect, checkAdmin, userLimitController.resetUserLimit);

// Update user's subscription plan
router.post('/:userId/update-plan', protect, checkAdmin, userLimitController.updateUserPlan);

// Set user to trial plan
router.post('/:userId/set-trial', protect, checkAdmin, userLimitController.setUserToTrialPlan);

// Admin routes
router.put('/:userId', protect, checkAdmin, userLimitController.updateUserLimit);
router.post('/multiple', protect, checkAdmin, userLimitController.updateMultipleUserLimits);
router.post('/all', protect, checkAdmin, userLimitController.updateAllUserLimits);

module.exports = router; 