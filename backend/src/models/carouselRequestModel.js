const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const fileSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: false
  },
  originalName: {
    type: String,
    required: false
  },
  mimetype: {
    type: String,
    required: false
  },
  size: {
    type: Number,
    required: false
  }
});

const carouselRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    default: 'Unknown User'
  },
  userEmail: {
    type: String,
    default: ''
  },
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  carouselType: {
    type: String,
    enum: ['professional', 'creative', 'minimalist', 'custom'],
    default: 'professional'
  },
  content: {
    type: String
  },
  videoId: {
    type: String
  },
  videoTitle: {
    type: String
  },
  youtubeUrl: {
    type: String
  },
  files: [fileSchema],
  completedFiles: [fileSchema],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'rejected'],
    default: 'pending'
  },
  adminNotes: {
    type: String
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedCarouselId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carousel'
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

// Update the updatedAt field on save
carouselRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const CarouselRequest = mongoose.model('CarouselRequest', carouselRequestSchema);

module.exports = CarouselRequest; 