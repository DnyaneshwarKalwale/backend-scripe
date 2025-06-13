const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentHistory,
  downloadInvoice
} = require('../controllers/paymentController');

// @desc    Get user's payment methods
// @route   GET /api/payments/methods
// @access  Private
router.get('/methods', protect, getPaymentMethods);

// @desc    Add a new payment method
// @route   POST /api/payments/methods
// @access  Private
router.post('/methods', protect, addPaymentMethod);

// @desc    Set default payment method
// @route   PUT /api/payments/methods/:id/default
// @access  Private
router.put('/methods/:id/default', protect, setDefaultPaymentMethod);

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
router.get('/history', protect, getPaymentHistory);

// @desc    Download invoice
// @route   GET /api/payments/invoices/:id/download
// @access  Private
router.get('/invoices/:id/download', protect, downloadInvoice);

module.exports = router; 