const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserTokenSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    enum: ['linkedin', 'twitter', 'facebook', 'instagram', 'youtube'],
    required: true
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  expiresAt: {
    type: Date
  },
  tokenType: {
    type: String,
    default: 'Bearer'
  },
  scope: {
    type: String
  },
  profileData: {
    type: Object
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

// Update the updatedAt timestamp before save
UserTokenSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('UserToken', UserTokenSchema); 