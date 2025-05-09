const express = require('express');
const { 
  updateUserProfile,
  updateOnboarding,
  changePassword,
  deleteAccount
} = require('../controllers/userController');
const { protect, checkEmailVerified } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// User routes
router.put('/profile', checkEmailVerified, updateUserProfile);
router.post('/update-onboarding', updateOnboarding);
router.put('/change-password', checkEmailVerified, changePassword);
router.delete('/delete-account', checkEmailVerified, deleteAccount);

module.exports = router; 