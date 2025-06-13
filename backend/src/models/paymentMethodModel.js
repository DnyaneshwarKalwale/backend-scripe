const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['card', 'paypal'],
    required: true
  },
  lastFour: String,
  expiryDate: String,
  brand: String,
  email: String,
  isDefault: {
    type: Boolean,
    default: false
  },
  stripePaymentMethodId: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema); 