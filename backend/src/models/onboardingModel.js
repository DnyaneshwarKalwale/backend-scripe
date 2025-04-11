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
        'personal-info',
        'team-selection',
        'team-workspace',
        'team-invite',
        'post-format',
        'post-frequency',
        'inspiration-profiles',
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
    postFormat: {
      type: String,
      enum: ['text', 'carousel', 'document', 'visual', 'poll'],
      default: 'text',
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
    },
    website: {
      type: String,
      default: ''
    },
    mobileNumber: {
      type: String,
      default: ''
    },
    inspirationProfiles: {
      type: [String],
      default: []
    },
    hasExtension: {
      type: Boolean,
      default: false
    },
    onboardingCompleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Onboarding', onboardingSchema); 