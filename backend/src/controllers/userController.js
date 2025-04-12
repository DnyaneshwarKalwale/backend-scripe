const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Onboarding = require('../models/onboardingModel');
const generateToken = require('../utils/generateToken');

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Only update fields that were sent in the request
  if (req.body.firstName) {
    user.firstName = req.body.firstName;
  }
  
  if (req.body.lastName) {
    user.lastName = req.body.lastName;
  }
  
  if (req.body.email && user.email !== req.body.email) {
    // Check if email already exists
    const emailExists = await User.findOne({ email: req.body.email });
    if (emailExists) {
      res.status(400);
      throw new Error('Email already in use');
    }
    
    user.email = req.body.email;
    // If email changed, we should mark it as not verified
    user.isEmailVerified = false;
  }
  
  if (req.body.password) {
    user.password = req.body.password;
  }
  
  // Add website and mobileNumber fields to user profile update
  if (req.body.website !== undefined) {
    user.website = req.body.website;
  }
  
  if (req.body.mobileNumber !== undefined) {
    user.mobileNumber = req.body.mobileNumber;
  }

  const updatedUser = await user.save();

  res.status(200).json({
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    isEmailVerified: updatedUser.isEmailVerified,
    profilePicture: updatedUser.profilePicture,
    language: updatedUser.language,
    website: updatedUser.website,
    mobileNumber: updatedUser.mobileNumber,
    role: updatedUser.role,
    token: generateToken(updatedUser._id),
  });
});

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
// @route   DELETE /api/users/delete-account
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Delete user
  await user.remove();

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully',
  });
});

module.exports = {
  updateUserProfile,
  updateOnboarding,
  changePassword,
  deleteAccount,
}; 