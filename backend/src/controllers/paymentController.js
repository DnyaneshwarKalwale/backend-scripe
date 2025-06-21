const asyncHandler = require('express-async-handler');
const PaymentTransaction = require('../models/paymentTransactionModel');
const UserLimit = require('../models/userLimitModel');
const PDFDocument = require('pdfkit');
const { isAdmin } = require('../middleware/authMiddleware');
const PaymentMethod = require('../models/paymentMethodModel');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Initialize Stripe only if API key is available
let stripeInitialized = false;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripeInitialized = true;
  }
} catch (error) {
  console.warn('Stripe initialization failed:', error.message);
}

// @desc    Get user's payment methods
// @route   GET /api/payments/methods
// @access  Private
const getPaymentMethods = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    const paymentMethods = await PaymentMethod.find({ 
      userId, 
      isActive: true 
    }).sort({ isDefault: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
});

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
const setDefaultPaymentMethod = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentMethodId = req.params.id;
    
    // Find the payment method
    const paymentMethod = await PaymentMethod.findOne({
      _id: paymentMethodId,
      userId,
      isActive: true
    });
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    // Set as default (the pre-save hook will handle removing default from others)
    paymentMethod.isDefault = true;
    await paymentMethod.save();
    
    res.status(200).json({
      success: true,
      message: 'Default payment method updated',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update default payment method'
    });
  }
});

// @desc    Delete payment method
// @route   DELETE /api/payments/methods/:id
// @access  Private
const deletePaymentMethod = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentMethodId = req.params.id;
    
    // Find the payment method
    const paymentMethod = await PaymentMethod.findOne({
      _id: paymentMethodId,
      userId,
      isActive: true
    });
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    // Detach from Stripe if exists
    try {
      if (paymentMethod.stripePaymentMethodId) {
        await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
      }
    } catch (stripeError) {
      console.log('Could not detach from Stripe:', stripeError);
      // Continue with deletion even if Stripe detach fails
    }
    
    // Mark as inactive instead of deleting for audit purposes
    paymentMethod.isActive = false;
    paymentMethod.isDefault = false;
    await paymentMethod.save();
    
    res.status(200).json({
      success: true,
      message: 'Payment method removed'
    });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove payment method'
    });
  }
});

// @desc    Get payment history/transactions
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const transactions = await PaymentTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await PaymentTransaction.countDocuments({ userId });
    
    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

// @desc    Download invoice
// @route   GET /api/payments/invoices/:id/download
// @access  Private
const downloadInvoice = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const invoiceId = req.params.id;
    
    // Find the transaction
    const transaction = await PaymentTransaction.findOne({
      transactionId: invoiceId,
      userId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Try to get Stripe invoice if available
    try {
      if (transaction.invoiceId) {
        const invoice = await stripe.invoices.retrieve(transaction.invoiceId);
        if (invoice.invoice_pdf) {
          return res.redirect(invoice.invoice_pdf);
        }
      }
    } catch (stripeError) {
      console.log('Could not retrieve Stripe invoice:', stripeError);
    }
    
    // Generate a simple invoice PDF or return transaction details
    res.status(200).json({
      success: true,
      message: 'Invoice details',
      data: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        date: transaction.createdAt,
        paymentMethod: transaction.paymentMethod
      }
    });
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download invoice'
    });
  }
});

// @desc    Download billing history
// @route   GET /api/payments/history/download
// @access  Private
const downloadBillingHistory = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    const transactions = await PaymentTransaction.find({ userId })
      .sort({ createdAt: -1 });
    
    // Return CSV data for download
    const csvData = transactions.map(t => ({
      date: t.createdAt.toISOString().split('T')[0],
      description: t.description,
      amount: t.amount,
      currency: t.currency.toUpperCase(),
      status: t.paymentStatus,
      transactionId: t.transactionId
    }));
    
    res.status(200).json({
      success: true,
      data: csvData,
      message: 'Billing history data'
    });
  } catch (error) {
    console.error('Error downloading billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download billing history'
    });
  }
});

// Helper function to save payment method from Stripe session
const savePaymentMethodFromSession = async (session, userId) => {
  try {
    if (!session.payment_intent) {
      return null;
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
    if (!paymentIntent.payment_method) {
      return null;
    }
    
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
    
    // Check if payment method already exists
    const existingPaymentMethod = await PaymentMethod.findOne({
      stripePaymentMethodId: stripePaymentMethod.id,
      userId
    });
    
    if (existingPaymentMethod) {
      // Update last used date
      existingPaymentMethod.lastUsedAt = new Date();
      await existingPaymentMethod.save();
      return existingPaymentMethod;
    }
    
    // Create new payment method record
    const paymentMethodData = {
      userId,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      lastUsedAt: new Date()
    };
    
    // Add type-specific details
    if (stripePaymentMethod.type === 'card' && stripePaymentMethod.card) {
      paymentMethodData.card = {
        brand: stripePaymentMethod.card.brand,
        last4: stripePaymentMethod.card.last4,
        expMonth: stripePaymentMethod.card.exp_month,
        expYear: stripePaymentMethod.card.exp_year,
        funding: stripePaymentMethod.card.funding,
        country: stripePaymentMethod.card.country
      };
    }
    
    // Add billing details if available
    if (stripePaymentMethod.billing_details) {
      paymentMethodData.billingDetails = {
        name: stripePaymentMethod.billing_details.name,
        email: stripePaymentMethod.billing_details.email,
        phone: stripePaymentMethod.billing_details.phone,
        address: stripePaymentMethod.billing_details.address
      };
    }
    
    // Check if this should be the default payment method (if user has no other payment methods)
    const userPaymentMethodCount = await PaymentMethod.countDocuments({ 
      userId, 
      isActive: true 
    });
    
    if (userPaymentMethodCount === 0) {
      paymentMethodData.isDefault = true;
    }
    
    const newPaymentMethod = new PaymentMethod(paymentMethodData);
    await newPaymentMethod.save();
    
    console.log(`Payment method saved for user ${userId}:`, newPaymentMethod._id);
    return newPaymentMethod;
  } catch (error) {
    console.error('Error saving payment method from session:', error);
    return null;
  }
};

module.exports = {
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  deletePaymentMethod,
  getPaymentHistory,
  downloadInvoice,
  downloadBillingHistory,
  savePaymentMethodFromSession
}; 