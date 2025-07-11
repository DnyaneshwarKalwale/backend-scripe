const mongoose = require('mongoose');

const TweetSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  full_text: String,
  created_at: {
    type: String,
    required: true
  },
  public_metrics: {
    retweet_count: Number,
    reply_count: Number,
    like_count: Number,
    quote_count: Number
  },
  author: {
    id: String,
    name: String,
    username: String,
    profile_image_url: String
  },
  attachments: {
    media_keys: [String]
  },
  referenced_tweets: [{
    type: {
      type: String,
      enum: ['replied_to', 'retweeted', 'quoted']
    },
    id: String,
    text: String,
    author: {
      name: String,
      username: String,
      profile_image_url: String
    },
    media: [{
      media_key: String,
      type: {
        type: String,
        enum: ['photo', 'video', 'animated_gif']
      },
      url: String,
      preview_image_url: String,
      alt_text: String,
      duration_ms: Number,
      width: Number,
      height: Number
    }]
  }],
  conversation_id: String,
  in_reply_to_user_id: String,
  in_reply_to_tweet_id: String,
  media: [{
    media_key: String,
    type: {
      type: String,
      enum: ['photo', 'video', 'animated_gif']
    },
    url: String,
    preview_image_url: String,
    alt_text: String,
    duration_ms: Number,
    width: Number,
    height: Number
  }],
  thread_id: String,
  thread_index: Number,
  thread_position: Number,
  is_long: Boolean,
  is_self_thread: Boolean,
  is_root_tweet: Boolean,
  category: {
    type: String,
    enum: ['all', 'normal', 'thread', 'long'],
    default: 'normal'
  },
  savedBy: {
    type: String,
    required: true,
    default: 'anonymous'
  },
  savedAt: {
    type: Date,
    default: Date.now
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create compound unique index to allow same tweet to be saved by different users
TweetSchema.index({ id: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Tweet', TweetSchema); 