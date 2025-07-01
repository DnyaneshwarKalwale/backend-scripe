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
    default: true  // Default to auto-renew for new subscriptions
  },
  // Stripe subscription details for auto-billing
  stripeSubscriptionId: {
    type: String,
    default: null
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  // Auto-billing settings
  autoRenewal: {
    enabled: {
      type: Boolean,
      default: true  // Auto-enable for new subscriptions
    },
    lastRenewalDate: {
      type: Date,
      default: null
    },
    nextRenewalDate: {
      type: Date,
      default: null
    },
    failedAttempts: {
      type: Number,
      default: 0
    },
    lastFailureReason: {
      type: String,
      default: null
    }
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
  if (this.planId === 'expired') return true;
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
  
  // For expired plans, ensure all fields are properly reset
  if (planId === 'expired') {
    this.expiresAt = null;
    this.status = 'inactive';
    this.limit = 0;
    this.count = 0;
    return this.save();
  }
  
  // For trial plans, enforce 7-day expiration
  if (planId === 'trial') {
    const trialDays = 7;
    const trialExpiration = new Date();
    trialExpiration.setDate(trialExpiration.getDate() + trialDays);
    this.expiresAt = trialExpiration;
    this.status = 'active';
    return this.save();
  }
  
  // For paid plans
  if (planId === 'basic' || planId === 'premium' || planId === 'custom') {
    if (expiresAt) {
      this.expiresAt = new Date(expiresAt);
    } else {
      const paidPlanDays = 30;
      const paidExpiration = new Date();
      paidExpiration.setDate(paidExpiration.getDate() + paidPlanDays);
      this.expiresAt = paidExpiration;
    }
    this.status = 'active';
  }
  
  return this.save();
};

// Add method to check if user can use credits
userLimitSchema.methods.canUseCredits = function(amount = 1) {
  // First check if plan is expired
  if (this.hasExpired()) {
    return false;
  }
  
  // Then check if user has enough credits
  return this.planId !== 'expired' && 
         this.status === 'active' &&
         this.limit > 0 && 
         (this.count + amount) <= this.limit;
};

// Add method to get remaining credits
userLimitSchema.methods.getRemainingCredits = function() {
  // If plan is expired or inactive, return 0
  if (this.hasExpired() || this.status === 'inactive' || this.planId === 'expired') {
    return 0;
  }
  return Math.max(0, this.limit - this.count);
};

// Add method to check if plan is active
userLimitSchema.methods.isPlanActive = function() {
  return !this.hasExpired() && 
         this.planId !== 'expired' &&
         this.status === 'active';
};

const UserLimit = mongoose.model('UserLimit', userLimitSchema);

module.exports = UserLimit; 