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
  count: {
    type: Number,
    required: true,
    default: 0
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

const UserLimit = mongoose.model('UserLimit', userLimitSchema);

module.exports = UserLimit; 