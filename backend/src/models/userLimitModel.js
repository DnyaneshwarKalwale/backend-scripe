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
    default: 10
  },
  dailyLimit: {
    type: Number,
    required: true,
    default: 10
  },
  count: {
    type: Number,
    required: true,
    default: 0
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

// Method to check if limit should be reset
userLimitSchema.methods.shouldReset = function() {
  const now = new Date();
  const lastReset = new Date(this.lastResetAt);
  
  // Check if it's a new day (after 12 AM)
  return now.getDate() !== lastReset.getDate() || 
         now.getMonth() !== lastReset.getMonth() || 
         now.getFullYear() !== lastReset.getFullYear();
};

// Method to reset the count
userLimitSchema.methods.resetCount = function() {
  this.count = 0;
  this.lastResetAt = new Date();
  return this.save();
};

const UserLimit = mongoose.model('UserLimit', userLimitSchema);

module.exports = UserLimit; 