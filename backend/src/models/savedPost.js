const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['twitter', 'linkedin', 'youtube']
  },
  postData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for faster queries
savedPostSchema.index({ userId: 1, platform: 1 });

const SavedPost = mongoose.model('SavedPost', savedPostSchema);

module.exports = SavedPost; 