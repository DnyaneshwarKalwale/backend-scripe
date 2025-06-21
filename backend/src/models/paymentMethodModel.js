const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  stripePaymentMethodId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['card', 'paypal', 'bank_account'],
    required: true
  },
  // Card details
  card: {
    brand: String, // visa, mastercard, etc.
    last4: String,
    expMonth: Number,
    expYear: Number,
    funding: String, // credit, debit, prepaid
    country: String
  },
  // PayPal details
  paypal: {
    email: String
  },
  // Bank account details
  bankAccount: {
    bankName: String,
    last4: String,
    accountType: String // checking, savings
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date
  }
});

// Ensure only one default payment method per user
paymentMethodSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Remove default flag from other payment methods for this user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Index for faster queries
paymentMethodSchema.index({ userId: 1, isDefault: 1 });
paymentMethodSchema.index({ userId: 1, isActive: 1 });

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

module.exports = PaymentMethod; 