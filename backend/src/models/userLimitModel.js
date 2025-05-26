const mongoose = require('mongoose');

const userLimitSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  limit: {
    type: Number,
    required: true,
    default: 0  // Default to 0 credits for new users
  },
  count: {
    type: Number,
    required: true,
    default: 0
  },
  // Add subscription plan fields
  planId: {
    type: String,
    default: 'expired',  // Default to expired plan
    enum: ['trial', 'basic', 'premium', 'custom', 'expired']
  },
  planName: {
    type: String,
    default: 'No Plan'  // Default to No Plan
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled'],
    default: 'inactive'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  subscriptionStartDate: {
    type: Date,
    default: Date.now
  },
  lastReset: {
    type: Date,
    default: Date.now
  },
  adminModified: {
    type: Boolean,
    default: false
  },
  // Add auto-pay setting
  autoPay: {
    type: Boolean,
    default: false  // Default to not auto-renew
  },
  // Add billing details
  billingDetails: {
    name: String,
    email: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'paypal'],
      default: 'card'
    },
    lastFour: String,
    brand: String,
    expiryDate: String,
    updatedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
userLimitSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual property for remaining credits
userLimitSchema.virtual('remaining').get(function() {
  return Math.max(0, this.limit - this.count);
});

// Method to check if subscription has expired
userLimitSchema.methods.hasExpired = function() {
  if (!this.expiresAt) return true;
  return new Date() > new Date(this.expiresAt);
};

// Method to reset the count based on plan subscription
userLimitSchema.methods.resetCount = function() {
  this.count = 0;
  this.lastReset = new Date();
  return this.save();
};

// Method to update plan
userLimitSchema.methods.updatePlan = function(planData) {
  const { planId, planName, limit, expiresAt } = planData;
  
  this.planId = planId || this.planId;
  this.planName = planName || this.planName;
  this.limit = limit || this.limit;
  
  if (expiresAt) {
    this.expiresAt = new Date(expiresAt);
  }
  
  // For expired plans or unlimited plans, ensure expiresAt is null
  if (planId === 'expired' || planId === 'unlimited') {
    this.expiresAt = null;
    this.status = 'inactive';
  }
  
  // For trial plans, set expiration if not provided
  if (planId === 'trial' && !expiresAt) {
    const trialDays = 7; // 7-day trial
    const trialExpiration = new Date();
    trialExpiration.setDate(trialExpiration.getDate() + trialDays);
    this.expiresAt = trialExpiration;
    this.status = 'active';
  }
  
  // For paid plans, set 30-day expiration if not provided
  if ((planId === 'basic' || planId === 'premium' || planId === 'custom') && !expiresAt) {
    const paidPlanDays = 30; // 30-day subscription
    const paidExpiration = new Date();
    paidExpiration.setDate(paidExpiration.getDate() + paidPlanDays);
    this.expiresAt = paidExpiration;
    this.status = 'active';
  }
  
  return this.save();
};

// Add method to check if user can use credits
userLimitSchema.methods.canUseCredits = function(amount = 1) {
  return this.planId !== 'expired' && 
         this.limit > 0 && 
         (this.count + amount) <= this.limit &&
         (!this.expiresAt || new Date(this.expiresAt) > new Date());
};

// Add method to get remaining credits
userLimitSchema.methods.getRemainingCredits = function() {
  return Math.max(0, this.limit - this.count);
};

// Add method to check if plan is active
userLimitSchema.methods.isPlanActive = function() {
  return this.planId !== 'expired' && 
         (!this.expiresAt || new Date(this.expiresAt) > new Date());
};

const UserLimit = mongoose.model('UserLimit', userLimitSchema);

module.exports = UserLimit; 