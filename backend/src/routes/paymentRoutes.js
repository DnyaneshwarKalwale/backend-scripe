const express = require('express');
const {
  getUserPaymentHistory,
  getTransactionById,
  getAllTransactions,
  getUserSpendingSummary,
  getUserPaymentMethods,
  setDefaultPaymentMethod,
  downloadInvoice,
  downloadBillingHistory,
  getPaymentMethods,
  addPaymentMethod,
  getPaymentHistory
} = require('../controllers/paymentController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// Payment methods routes
router.get('/methods', getPaymentMethods);
router.post('/methods', addPaymentMethod);
router.put('/methods/:id/default', setDefaultPaymentMethod);

// Payment history routes
router.get('/history', getPaymentHistory);
router.get('/history/download', downloadBillingHistory);
router.get('/invoices/:id/download', downloadInvoice);

// Admin only routes
router.use(isAdmin);
router.get('/transactions', getAllTransactions);
router.get('/transactions/:id', getTransactionById);
router.get('/spending-summary', getUserSpendingSummary);

module.exports = router; 