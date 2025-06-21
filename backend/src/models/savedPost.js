const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
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

// Drop any existing indexes
savedPostSchema.pre('save', async function(next) {
  try {
    await this.collection.dropIndexes();
  } catch (error) {
    console.log('No indexes to drop');
  }
  next();
});

// Create new compound index for uniqueness
savedPostSchema.index({ 
  userId: 1, 
  platform: 1,
  'postData.id': 1
}, { 
  unique: true,
  name: 'unique_post_per_user'  // Give it a specific name
});

const SavedPost = mongoose.model('SavedPost', savedPostSchema);

// Ensure indexes are created
SavedPost.createIndexes().catch(console.error);

module.exports = SavedPost; 