const PaymentTransaction = require('../models/paymentTransactionModel');
const UserLimit = require('../models/userLimitModel');
const PDFDocument = require('pdfkit');
const { isAdmin } = require('../middleware/authMiddleware');
const PaymentMethod = require('../models/paymentMethodModel');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @desc    Get user's payment methods
// @route   GET /api/payments/methods
// @access  Private
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ userId: req.user.id });
    
    // Return empty array if no methods found
    res.status(200).json({
      success: true,
      data: paymentMethods || []
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
};

// @desc    Add a new payment method
// @route   POST /api/payments/methods
// @access  Private
const addPaymentMethod = async (req, res) => {
  try {
    const { type, lastFour, expiryDate, brand, email, isDefault } = req.body;

    // If this is set as default, unset any existing default
    if (isDefault) {
      await PaymentMethod.updateMany(
        { userId: req.user.id },
        { $set: { isDefault: false } }
      );
    }

    const paymentMethod = await PaymentMethod.create({
      userId: req.user.id,
      type,
      lastFour,
      expiryDate,
      brand,
      email,
      isDefault
    });

    res.status(201).json({
      success: true,
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add payment method'
    });
  }
};

// @desc    Set default payment method
// @route   PUT /api/payments/methods/:id/default
// @access  Private
const setDefaultPaymentMethod = async (req, res) => {
  try {
    // Unset current default
    await PaymentMethod.updateMany(
      { userId: req.user.id },
      { $set: { isDefault: false } }
    );

    // Set new default
    const paymentMethod = await PaymentMethod.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { isDefault: true } },
      { new: true }
    );

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    res.status(200).json({
      success: true,
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default payment method'
    });
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    // Return empty array if no transactions found
    res.status(200).json({
      success: true,
      data: {
        transactions: transactions || []
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
};

// @desc    Download invoice
// @route   GET /api/payments/invoices/:id/download
// @access  Private
const downloadInvoice = async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Return transaction data that can be used to generate an invoice on the frontend
    res.status(200).json({
      success: true,
      data: {
        transaction
      }
    });
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download invoice'
    });
  }
};

// @desc    Get user's payment transaction history
// @route   GET /api/payments/history
// @access  Private
exports.getUserPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = -1 } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Create sort object
    const sort = {};
    sort[sortBy] = parseInt(sortOrder);
    
    // Find transactions for user
    const transactions = await PaymentTransaction.find({ userId })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await PaymentTransaction.countDocuments({ userId });
    
    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment history'
    });
  }
};

// @desc    Download invoice PDF
// @route   GET /api/payments/invoices/:invoiceId/download
// @access  Private
exports.downloadInvoicePDF = async (req, res) => {
  try {
    // If Stripe is not initialized, return error
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: 'Payment service not available'
      });
    }

    const { invoiceId } = req.params;
    
    // Get invoice from Stripe
    const invoice = await stripe.invoices.retrieve(invoiceId);
    
    // Check if invoice belongs to user
    if (invoice.customer !== req.user.stripeCustomerId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }
    
    // Create PDF
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceId}.pdf`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(25).text('Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice ID: ${invoice.id}`);
    doc.text(`Date: ${new Date(invoice.created * 1000).toLocaleDateString()}`);
    doc.text(`Amount: $${(invoice.amount_paid / 100).toFixed(2)}`);
    doc.text(`Status: ${invoice.status}`);
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download invoice'
    });
  }
};

// @desc    Download billing history PDF
// @route   GET /api/payments/history/download
// @access  Private
exports.downloadBillingHistory = async (req, res) => {
  try {
    // Get all transactions for user
    const transactions = await PaymentTransaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    // Create PDF
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=billing-history.pdf');
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(25).text('Billing History', { align: 'center' });
    doc.moveDown();
    
    transactions.forEach(transaction => {
      doc.fontSize(12).text(`Transaction ID: ${transaction.transactionId}`);
      doc.text(`Date: ${transaction.createdAt.toLocaleDateString()}`);
      doc.text(`Amount: $${transaction.amount.toFixed(2)}`);
      doc.text(`Status: ${transaction.paymentStatus}`);
      doc.text(`Type: ${transaction.paymentType}`);
      doc.moveDown();
    });
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error downloading billing history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download billing history'
    });
  }
};

// @desc    Get transaction by ID
// @route   GET /api/payments/transactions/:id
// @access  Private/Admin
exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction'
    });
  }
};

// @desc    Get all transactions (admin only)
// @route   GET /api/payments/transactions
// @access  Private/Admin
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const transactions = await PaymentTransaction.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    const count = await PaymentTransaction.countDocuments();
    
    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions'
    });
  }
};

// @desc    Get user spending summary
// @route   GET /api/payments/spending-summary
// @access  Private/Admin
exports.getUserSpendingSummary = async (req, res) => {
  try {
    const summary = await PaymentTransaction.aggregate([
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          lastTransaction: { $max: '$createdAt' }
        }
      }
    ]);
    
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error generating spending summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate spending summary'
    });
  }
};

module.exports = {
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentHistory,
  downloadInvoice,
  downloadInvoicePDF,
  downloadBillingHistory,
  getUserPaymentHistory,
  getTransactionById,
  getAllTransactions,
  getUserSpendingSummary
}; 