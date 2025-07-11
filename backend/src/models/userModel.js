const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Please add a first name'],
    },
    lastName: {
      type: String,
      required: false, // Made optional for OAuth users who might not have a last name
      default: '', // Default to empty string if not provided
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: function() {
        return this.authMethod === 'email'; // Password only required for email auth
      }
    },
    website: {
      type: String,
      // Optional field for user's website
    },
    mobileNumber: {
      type: String,
      // Optional field for user's mobile number
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'pending_deletion', 'deleted'],
      default: 'active'
    },
    deletionScheduledAt: {
      type: Date,
      default: null
    },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    emailVerificationOTP: String,
    emailVerificationOTPExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    googleId: String,
    linkedinId: {
      type: String,
      default: null
    },
    linkedinAccessToken: {
      type: String,
      default: null
    },
    linkedinRefreshToken: String,
    linkedinTokenExpiry: {
      type: Date,
      default: null
    },
    profilePicture: String,
    authMethod: {
      type: String,
      enum: ['email', 'google', 'linkedin'],
      required: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    // New fields for subscription management
    subscription: {
      planId: {
        type: String, 
        enum: ['trial', 'basic', 'premium', 'custom', 'expired'],
        default: 'expired'
      },
      status: {
        type: String,
        enum: ['active', 'past_due', 'canceled', 'inactive'],
        default: 'inactive'
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      currentPeriodEnd: Date,
      canceledAt: Date
    },
    // Credits for AI content generation
    credits: {
      type: Number,
      default: 0
    },
    // Purchased credit packs history
    creditPurchaseHistory: [
      {
        amount: Number,
        date: {
          type: Date,
          default: Date.now
        },
        stripeSessionId: String
      }
    ],
    // Payment methods saved via Stripe 
    paymentMethods: [
      {
        type: {
          type: String,
          enum: ['card', 'paypal']
        },
        lastFour: String,
        brand: String,
        expiryDate: String,
        isDefault: {
          type: Boolean,
          default: false
        },
        stripePaymentMethodId: String
      }
    ],
    stripeCustomerId: {
      type: String,
      required: false
    },
    linkedinConnected: {
      type: Boolean,
      default: false
    },
    linkedinUsername: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
  }
);

// Middleware to hash password before save
userSchema.pre('save', async function (next) {
  // Only hash the password if it's been modified (or is new) and exists
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // Check for account deletion
  if (this.accountStatus === 'pending_deletion' && this.deletionScheduledAt) {
    const now = new Date();
    if (now > this.deletionScheduledAt) {
      await this.model('User').deleteOne({ _id: this._id });
      return next(new Error('Account has been permanently deleted'));
    }
  }
  next();
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    return false; // If no password set (OAuth user), always return false
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email, role: this.role },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE,
    }
  );
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function () {
  // Generate token
  const verificationToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to emailVerificationToken field
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  // Set expire
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return verificationToken;
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Generate email verification OTP
userSchema.methods.generateEmailVerificationOTP = function () {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store OTP in user object
  this.emailVerificationOTP = otp;

  // Set expire time - 30 minutes
  this.emailVerificationOTPExpire = Date.now() + 30 * 60 * 1000;

  return otp;
};

const User = mongoose.model('User', userSchema);

module.exports = User; 