const PaymentTransaction = require('../models/paymentTransactionModel');
const UserLimit = require('../models/userLimitModel');
const PDFDocument = require('pdfkit');
const { isAdmin } = require('../middleware/authMiddleware');
const PaymentMethod = require('../models/paymentMethodModel');

// Initialize Stripe only if API key is available
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.warn('Stripe initialization failed:', error.message);
}

// @desc    Get user's payment methods
// @route   GET /api/payments/methods
// @access  Private
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ user: req.user.id });
    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment methods'
    });
  }
};

// @desc    Add a new payment method
// @route   POST /api/payments/methods
// @access  Private
const addPaymentMethod = async (req, res) => {
  try {
    const { type, cardDetails, paypalEmail } = req.body;

    if (!type || (type === 'card' && !cardDetails) || (type === 'paypal' && !paypalEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method details'
      });
    }

    const paymentMethod = new PaymentMethod({
      user: req.user.id,
      type,
      ...(type === 'card' ? {
        lastFour: cardDetails.lastFour,
        expiryDate: cardDetails.expiryDate,
        brand: cardDetails.brand
      } : {
        email: paypalEmail
      }),
      isDefault: false
    });

    await paymentMethod.save();

    res.status(201).json({
      success: true,
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding payment method'
    });
  }
};

// @desc    Set default payment method
// @route   PUT /api/payments/methods/:id/default
// @access  Private
const setDefaultPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    // Reset all payment methods to non-default
    await PaymentMethod.updateMany(
      { user: req.user.id },
      { isDefault: false }
    );
    
    // Set the selected payment method as default
    const paymentMethod = await PaymentMethod.findOneAndUpdate(
      { _id: id, user: req.user.id },
      { isDefault: true },
      { new: true }
    );
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    res.json({
      success: true,
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting default payment method'
    });
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: {
        transactions
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment history'
    });
  }
};

// @desc    Download invoice
// @route   GET /api/payments/invoices/:id/download
// @access  Private
const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await PaymentTransaction.findOne({
      _id: id,
      user: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Create PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${id}.pdf`);

    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(25).text('Invoice', 100, 80);
    doc.fontSize(12).text(`Invoice ID: ${transaction._id}`, 100, 120);
    doc.text(`Date: ${transaction.createdAt.toLocaleDateString()}`, 100, 140);
    doc.text(`Amount: $${transaction.amount}`, 100, 160);
    doc.text(`Status: ${transaction.status}`, 100, 180);

    doc.end();
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading invoice'
    });
  }
};

module.exports = {
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentHistory,
  downloadInvoice
}; 