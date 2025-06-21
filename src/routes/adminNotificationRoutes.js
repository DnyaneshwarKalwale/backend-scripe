const express = require('express');
const { 
  createNotification, 
  getAllNotifications 
} = require('../controllers/notificationController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes and require admin
router.use(protect);
router.use(isAdmin);

// Get all notifications (admin)
router.get('/', getAllNotifications);

// Create notification (admin)
router.post('/', createNotification);

module.exports = router; 