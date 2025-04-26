const mongoose = require('mongoose');

const carouselContentSchema = mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['post-short', 'post-long', 'carousel'],
      required: true
    },
    videoId: {
      type: String,
      default: null
    },
    videoTitle: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('CarouselContent', carouselContentSchema); 