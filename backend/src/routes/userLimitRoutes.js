const express = require('express');
const router = express.Router();
const userLimitController = require('../controllers/userLimitController');
const { checkAdmin, protect } = require('../middleware/authMiddleware');

// Get current user's limit
router.get('/me', protect, userLimitController.getCurrentUserLimit);

// Activate free trial for current user
router.post('/activate-trial', protect, userLimitController.activateFreeTrial);

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