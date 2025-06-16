const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Onboarding = require('../models/onboardingModel');
const generateToken = require('../utils/generateToken');
const UserLimit = require('../models/userLimitModel');
const PaymentTransaction = require('../models/paymentTransactionModel');
const Notification = require('../models/notificationModel');
const stripe = require('../config/stripe');

// Initialize Stripe only if API key is available
let stripeInitialized = false;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripeInitialized = true;
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.warn('Stripe initialization failed:', error.message);
}

// @desc    Register user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    let stripeCustomerId;
    // Create Stripe customer if Stripe is available
    try {
      const customer = await stripe.customers.create({
        email,
        name: `${firstName} ${lastName}`.trim()
      });
      stripeCustomerId = customer.id;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      // Continue without Stripe customer
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      stripeCustomerId
    });

    // Create initial user limits
    await UserLimit.create({
      userId: user._id,
      limit: 0,
      count: 0,
      planId: 'trial',
      planName: 'Trial',
      status: 'active'
    });

    if (user) {
      return res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          token: generateToken(user._id)
        }
      });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register user'
    });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });

    // Check password
    if (user && (await user.matchPassword(password))) {
      return res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          token: generateToken(user._id)
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to login'
    });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      return res.status(200).json({
        success: true,
        data: user
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
  const user = await User.findById(req.user._id);

    if (user) {
      user.firstName = req.body.firstName || user.firstName;
      user.lastName = req.body.lastName || user.lastName;
      user.email = req.body.email || user.email;
  
  if (req.body.password) {
    user.password = req.body.password;
  }
  
      // Update Stripe customer if available and if email or name changed
      if (stripeInitialized && user.stripeCustomerId && (req.body.email || req.body.firstName || req.body.lastName)) {
        try {
          await stripe.customers.update(user.stripeCustomerId, {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim()
          });
        } catch (error) {
          console.error('Error updating Stripe customer:', error);
          // Continue without Stripe update
        }
  }

  const updatedUser = await user.save();

      return res.status(200).json({
        success: true,
        data: {
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
          token: generateToken(updatedUser._id)
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile'
  });
  }
};

// @desc    Update onboarding settings and mark as complete
// @route   POST /api/users/update-onboarding
// @access  Private
const updateOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Validate required fields in request body
  const { 
    onboardingCompleted,
    workspaceType,
    workspaceName,
    postFormat,
    postFrequency
  } = req.body;

  if (!workspaceType) {
    res.status(400);
    throw new Error('Workspace type is required');
  }

  try {
    // Update user's onboarding status - explicitly set to true since this endpoint completes onboarding
    console.log(`Setting onboardingCompleted to true for user ${userId}`);
    const user = await User.findByIdAndUpdate(
      userId, 
      { onboardingCompleted: true },
      { new: true }
    );

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Find or create onboarding record
    let onboarding = await Onboarding.findOne({ user: userId });
    
    if (!onboarding) {
      onboarding = new Onboarding({
        user: userId,
        workspaceType,
        workspaceName,
        postFormat,
        postFrequency,
        currentStep: 'dashboard' // Set current step to dashboard
      });
    } else {
      // Update all provided fields
      onboarding.workspaceType = workspaceType;
      if (workspaceName) onboarding.workspaceName = workspaceName;
      if (postFormat) onboarding.postFormat = postFormat;
      if (postFrequency) onboarding.postFrequency = postFrequency;
      onboarding.currentStep = 'dashboard'; // Set current step to dashboard
    }
    
    await onboarding.save();

    res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        authMethod: user.authMethod,
      },
      onboarding
    });
  } catch (error) {
    console.error('Error updating onboarding:', error);
    res.status(500);
    throw new Error('Failed to update onboarding: ' + error.message);
  }
});

// @desc    Change user password
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Check for required fields
  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Please provide current and new password');
  }

  // Get user
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Only allow password change for email/password users
  if (user.authMethod !== 'email') {
    res.status(400);
    throw new Error('Password change is only available for email/password users');
  }

  // Check if current password matches
  const isMatch = await user.matchPassword(currentPassword);

  if (!isMatch) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  // Set new password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
  });
});

// @desc    Delete user account
// @route   DELETE /api/users/account
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  try {
  const user = await User.findById(req.user._id);

  if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set account for deletion in 10 days
    user.deletionScheduledAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
    user.accountStatus = 'pending_deletion';
    await user.save();

    // Delete Stripe customer if exists and Stripe is initialized
    if (stripeInitialized && user.stripeCustomerId) {
      try {
        await stripe.customers.del(user.stripeCustomerId);
      } catch (error) {
        console.error('Error deleting Stripe customer:', error);
        // Continue with account deletion even if Stripe deletion fails
      }
    }

    // Delete all user's data in parallel for better performance
    await Promise.all([
      PaymentTransaction.deleteMany({ userId: user._id }),
      UserLimit.deleteMany({ userId: user._id }),
      Notification.deleteMany({ user: user._id })
    ]);

    // Handle OAuth disconnection
    if (user.linkedinConnected) {
      try {
        user.linkedinConnected = false;
        user.linkedinAccessToken = undefined;
        user.linkedinRefreshToken = undefined;
        user.linkedinTokenExpiry = undefined;
        await user.save();
      } catch (error) {
        console.error('Error revoking LinkedIn access:', error);
      }
    }

    if (user.googleId) {
      try {
        user.googleId = undefined;
        await user.save();
      } catch (error) {
        console.error('Error removing Google connection:', error);
      }
    }

    return res.status(200).json({
    success: true,
      message: 'Your account has been scheduled for deletion. You have 10 days to recover your account by logging in. After this period, your account will be permanently deleted.'
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
});

// @desc    Cancel account deletion
// @route   POST /api/users/account/cancel-deletion
// @access  Private
const cancelAccountDeletion = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.accountStatus !== 'pending_deletion') {
      return res.status(400).json({
        success: false,
        message: 'Account is not scheduled for deletion'
  });
    }

    user.deletionScheduledAt = undefined;
    user.accountStatus = 'active';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account deletion cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling account deletion:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel account deletion'
    });
  }
};

// @desc    Update user auto-pay settings
// @route   POST /api/users/subscription/auto-pay
// @access  Private
const updateAutoPay = async (req, res) => {
  try {
    const { autoPay } = req.body;
    
    if (typeof autoPay !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Auto-pay setting must be a boolean value'
      });
    }
    
    // Find user's limit
    let userLimit = await UserLimit.findOne({ userId: req.user.id });
    
    if (!userLimit) {
      // Create default user limit if not exists
      userLimit = await UserLimit.create({
        userId: req.user.id,
        limit: 0,
        count: 0,
        planId: 'expired',
        planName: 'No Plan',
        status: 'inactive',
        autoPay: autoPay
      });
    } else {
      // Update auto-pay setting
      userLimit.autoPay = autoPay;
      await userLimit.save();
    }
    
    return res.status(200).json({
      success: true,
      message: `Auto-pay ${autoPay ? 'enabled' : 'disabled'} successfully`,
      data: {
        autoPay: userLimit.autoPay
      }
    });
  } catch (error) {
    console.error('Error updating auto-pay setting:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update auto-pay setting'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  updateOnboarding,
  changePassword,
  deleteAccount,
  cancelAccountDeletion,
  updateAutoPay
}; 