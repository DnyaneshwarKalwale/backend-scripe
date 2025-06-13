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

// All routes are protected
router.use(protect);

// Payment methods routes
router.get('/methods', getPaymentMethods);
router.post('/methods', addPaymentMethod);
router.put('/methods/:id/default', setDefaultPaymentMethod);

// Payment history routes
router.get('/history', getPaymentHistory);
router.get('/invoices/:id/download', downloadInvoice);

module.exports = router; 