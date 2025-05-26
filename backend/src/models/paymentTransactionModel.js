const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true  // Index for faster lookup by userId
  },
  transactionId: {
    type: String,
    required: true,
    unique: true  // Ensure unique transaction IDs
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd',
    required: true
  },
  paymentMethod: {
    type: {
      type: String,
      enum: ['card', 'paypal'],
      default: 'card'
    },
    lastFour: String,
    brand: String
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    required: true
  },
  paymentType: {
    type: String,
    enum: ['subscription', 'credit-pack', 'one-time', 'auto-renewal'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    planId: String,
    planName: String,
    credits: Number,
    previousPlanId: String,
    autoRenewal: Boolean,
    expiryDate: Date
  },
  receiptUrl: String,
  invoiceId: String,
  stripeSessionId: String,
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  // Additional admin fields for reference
  notes: String,
  adminModified: {
    type: Boolean,
    default: false
  }
});

// Create index for date range queries
paymentTransactionSchema.index({ createdAt: -1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

module.exports = PaymentTransaction; 