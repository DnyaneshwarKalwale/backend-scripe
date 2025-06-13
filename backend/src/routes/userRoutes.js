const express = require('express');
const { 
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteAccount,
  updateAutoPay
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes
router.use(protect);
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.delete('/account', deleteAccount);
router.post('/subscription/auto-pay', updateAutoPay);

module.exports = router; 