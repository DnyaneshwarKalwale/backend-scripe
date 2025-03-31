const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, profilePicture } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Update fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (profilePicture) user.profilePicture = profilePicture;

  // Save user
  const updatedUser = await user.save();

  res.status(200).json({
    success: true,
    user: {
      id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      profilePicture: updatedUser.profilePicture,
      isEmailVerified: updatedUser.isEmailVerified,
      onboardingCompleted: updatedUser.onboardingCompleted,
      authMethod: updatedUser.authMethod,
    },
  });
});

// @desc    Change password
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Current password and new password are required');
  }

  // Password validation (at least 8 characters)
  if (newPassword.length < 8) {
    res.status(400);
    throw new Error('New password must be at least 8 characters long');
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Check if user registered with email/password
  if (user.authMethod !== 'email') {
    res.status(400);
    throw new Error('Password change is only available for email/password accounts');
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
// @route   DELETE /api/users
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Delete user's onboarding data if exists
  const Onboarding = require('../models/onboardingModel');
  await Onboarding.findOneAndDelete({ user: user._id });

  // Delete user
  await User.findByIdAndDelete(user._id);

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully',
  });
});

module.exports = {
  updateProfile,
  changePassword,
  deleteAccount,
}; 