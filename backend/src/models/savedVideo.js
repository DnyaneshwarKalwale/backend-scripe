const mongoose = require('mongoose');

const savedVideoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    videoId: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    thumbnailUrl: {
      type: String,
      required: true
    },
    channelTitle: {
      type: String,
      default: 'Unknown Channel'
    },
    publishedAt: {
      type: Date,
      default: Date.now
    },
    savedAt: {
      type: Date,
      default: Date.now
    },
    // New fields for transcript data
    transcript: {
      type: String,
      default: ''
    },
    formattedTranscript: {
      type: [String],
      default: []
    },
    language: {
      type: String,
      default: 'Unknown'
    },
    is_generated: {
      type: Boolean,
      default: false
    },
    // Allow more free-form data to be stored
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound index to ensure a user can only save a video once
savedVideoSchema.index({ userId: 1, videoId: 1 }, { unique: true });

const SavedVideo = mongoose.model('SavedVideo', savedVideoSchema);

module.exports = SavedVideo; 