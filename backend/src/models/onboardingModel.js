const mongoose = require('mongoose');

const onboardingSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    currentStep: {
      type: String,
      enum: [
        'welcome',
        'team-selection',
        'team-workspace',
        'team-invite',
        'theme-selection',
        'language-selection',
        'post-format',
        'post-frequency',
        'registration',
        'extension-install',
        'completion',
        'dashboard'
      ],
      default: 'welcome'
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
      enum: ['thread', 'concise', 'hashtag', 'visual', 'viral'],
      default: 'thread',
    },
    postFrequency: {
      type: Number,
      min: 1,
      max: 7,
      default: 2,
    },
    firstName: {
      type: String,
      default: ''
    },
    lastName: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Onboarding', onboardingSchema); 