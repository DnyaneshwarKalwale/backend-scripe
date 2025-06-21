const mongoose = require('mongoose');

const postSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  title: {
    type: String,
    required: false
  },
  content: {
    type: String,
    required: true
  },
  hashtags: {
    type: [String],
    default: []
  },
  mediaType: {
    type: String,
    enum: ['none', 'image', 'carousel', 'document', 'article', 'poll'],
    default: 'none'
  },
  mediaUrls: {
    type: [String],
    default: []
  },
  postImage: {
    type: Object,
    default: null
  },
  // For carousel posts
  slides: [
    {
      id: String,
      content: String,
      imageUrl: String,
      cloudinaryImage: Object
    }
  ],
  // For document posts
  documentInfo: {
    documentName: String,
    documentSize: Number,
    documentType: String
  },
  // For article posts
  articleUrl: String,
  articleTitle: String,
  articleDescription: String,
  // For poll posts
  isPollActive: {
    type: Boolean,
    default: false
  },
  pollOptions: {
    type: [String],
    default: []
  },
  pollDuration: {
    type: Number,
    default: 1 // days
  },
  // Status of the post
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'failed', 'deleted'],
    default: 'draft'
  },
  // Platform info
  platform: {
    type: String,
    enum: ['linkedin', 'twitter', 'facebook', 'instagram'],
    default: 'linkedin'
  },
  visibility: {
    type: String,
    enum: ['PUBLIC', 'CONNECTIONS', 'LOGGED_IN'],
    default: 'PUBLIC'
  },
  // For scheduled posts
  scheduledTime: {
    type: Date,
    default: null
  },
  // For published posts
  publishedTime: {
    type: Date,
    default: null
  },
  // For LinkedIn API response
  platformPostId: {
    type: String,
    default: null
  },
  platformResponse: {
    type: Object,
    default: null
  }
}, {
  timestamps: true
});

// Add indexes for efficient querying
postSchema.index({ user: 1, status: 1 });
postSchema.index({ scheduledTime: 1 }, { sparse: true });

const Post = mongoose.model('Post', postSchema);

module.exports = Post; 