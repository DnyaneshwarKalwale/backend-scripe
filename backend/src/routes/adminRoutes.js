const express = require('express');
const router = express.Router();
const { 
  getDashboardStats,
  getAllUsers,
  getUserById,
  promoteUser,
  deleteUser,
  getAllContent,
  deleteContent,
  getUserVideos,
  getUserContent,
  getSavedVideosMetrics,
  getSubscriptionMetrics
} = require('../controllers/adminController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Apply protection middleware to all routes
router.use(protect);
// Ensure user has admin role
router.use(isAdmin);

// Admin dashboard routes
router.get('/dashboard', getDashboardStats);

// Analytics metrics routes
router.get('/saved-videos/metrics', getSavedVideosMetrics);
router.get('/subscriptions/metrics', getSubscriptionMetrics);

// User management routes
router.route('/users')
  .get(getAllUsers);

router.route('/users/:id')
  .get(getUserById)
  .delete(deleteUser);

router.patch('/users/:id/promote', promoteUser);

// Content management routes
router.route('/content')
  .get(getAllContent);

router.route('/content/:id')
  .delete(deleteContent);

// User content routes
router.get('/content/user/:userId/videos', getUserVideos);
router.get('/content/user/:userId/content', getUserContent);

module.exports = router; 