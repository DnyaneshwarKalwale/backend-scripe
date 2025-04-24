const mongoose = require('mongoose');

const fontSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a font name'],
      trim: true
    },
    fontFamily: {
      type: String,
      required: [true, 'Font family is required'],
      unique: true
    },
    fileUrl: {
      type: String,
      required: [true, 'Font file URL is required']
    },
    format: {
      type: String,
      enum: ['ttf', 'otf', 'woff', 'woff2'],
      required: [true, 'Font format is required']
    },
    isGlobal: {
      type: Boolean,
      default: true,
      description: 'Whether the font is available to all users'
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Font', fontSchema); 