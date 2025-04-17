const mongoose = require('mongoose');

const YouTubeCarouselSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['in_progress', 'delivered'],
    default: 'in_progress'
  },
  thumbnailUrl: {
    type: String
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: {
    type: Date
  },
  slideCount: {
    type: Number,
    default: 8
  },
  downloadUrl: {
    type: String
  },
  transcript: {
    type: String,
    required: true
  },
  generatedContent: {
    type: String
  },
  preferences: {
    format: {
      type: String,
      default: 'short'
    },
    tone: {
      type: String,
      default: 'professional'
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('YouTubeCarousel', YouTubeCarouselSchema); 