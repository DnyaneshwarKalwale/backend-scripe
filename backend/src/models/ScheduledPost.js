const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ScheduledPostSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    enum: ['linkedin', 'twitter', 'facebook', 'instagram'],
    default: 'linkedin'
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  postData: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'published', 'failed', 'cancelled'],
    default: 'scheduled'
  },
  errorDetails: {
    type: String
  },
  publishedPostId: {
    type: String
  },
  publishedAt: {
    type: Date
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
ScheduledPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ScheduledPost', ScheduledPostSchema); 