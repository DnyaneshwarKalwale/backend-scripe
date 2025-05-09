const express = require('express');
const router = express.Router();
const userLimitController = require('../controllers/userLimitController');
const { checkAdmin, protect } = require('../middleware/authMiddleware');

// Get current user's limit
router.get('/me', protect, userLimitController.getCurrentUserLimit);

// Get all user limits (Admin only)
router.get('/all', protect, checkAdmin, userLimitController.getAllUserLimits);

// Get user's limit
router.get('/:userId', protect, userLimitController.getUserLimit);

// Increment user's count
router.post('/:userId/increment', protect, userLimitController.incrementUserCount);

// Reset user limit
router.post('/:userId/reset', protect, userLimitController.resetUserLimit);

// Admin routes
router.put('/:userId', protect, checkAdmin, userLimitController.updateUserLimit);
router.put('/multiple', protect, checkAdmin, userLimitController.updateMultipleUserLimits);
router.put('/all', protect, checkAdmin, userLimitController.updateAllUserLimits);

module.exports = router; 