const mongoose = require('mongoose');

const onboardingSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    workspaceType: {
      type: String,
      enum: ['team', 'personal'],
      required: true,
    },
    workspaceName: {
      type: String,
      required: function() {
        return this.workspaceType === 'team';
      },
    },
    teamMembers: [
      {
        email: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ['admin', 'member'],
          default: 'member',
        },
      },
    ],
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
    language: {
      type: String,
      enum: ['english', 'german'],
      default: 'english',
    },
    postFormat: {
      type: String,
      enum: ['standard', 'formatted', 'chunky', 'short', 'emojis'],
      default: 'standard',
    },
    postFrequency: {
      type: Number,
      min: 1,
      max: 7,
      default: 2,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Onboarding', onboardingSchema); 