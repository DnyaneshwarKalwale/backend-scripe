const express = require('express');
const {
  getUserPaymentHistory,
  getTransactionById,
  getAllTransactions,
  getUserSpendingSummary
} = require('../controllers/paymentController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// User routes
router.get('/history', getUserPaymentHistory);
router.get('/summary', getUserSpendingSummary);
router.get('/:transactionId', getTransactionById);

// Admin routes
router.get('/admin/all', isAdmin, getAllTransactions);

module.exports = router; 