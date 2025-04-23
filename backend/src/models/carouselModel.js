const mongoose = require('mongoose');

const carouselSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
    },
    slides: [{
      content: String,
      imageUrl: String,
      order: Number,
      backgroundColor: String,
      metadata: String // JSON stringified metadata
    }],
    dimensions: {
      width: {
        type: Number,
        default: 1080
      },
      height: {
        type: Number,
        default: 1080
      }
    },
    slideCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published'],
      default: 'draft',
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    publishDate: {
      type: Date,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    comments: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Carousel', carouselSchema); 