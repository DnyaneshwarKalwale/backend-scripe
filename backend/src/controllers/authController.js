const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/userModel');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

// @desc    Register user with email
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: first name, last name, email, and password'
      });
    }

    // Email validation
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Password validation (at least 8 characters)
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      authMethod: 'email',
    });

    if (user) {
      // Generate verification token
      const verificationToken = user.getEmailVerificationToken();
      await user.save();

      // Create verification url
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

      // Set default response
      const responseData = {
        success: true,
        message: 'User registered successfully',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          onboardingCompleted: user.onboardingCompleted,
        }
      };

      // Try to send verification email
      let emailSent = false;
      try {
        // Check if email config is properly set
        if (process.env.EMAIL_USERNAME === 'your_email@gmail.com' || 
            process.env.EMAIL_PASSWORD === 'your_app_password' ||
            !process.env.EMAIL_USERNAME ||
            !process.env.EMAIL_PASSWORD) {
          console.log('WARNING: Email service not properly configured. Skipping email sending.');
          responseData.warning = 'Email verification is disabled. Email service not configured.';
        } else {
          // Try to send the email
          await sendVerificationEmail(user, verificationUrl);
          emailSent = true;
          responseData.message = 'User registered. Please check your email to verify your account';
          console.log('Verification email sent successfully to:', email);
        }
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        responseData.warning = 'Account created, but verification email could not be sent. Please contact support.';
      }

      // If email failed to send but we want to allow registration anyway
      if (!emailSent) {
        console.log('Proceeding with registration despite email issues');
      }

      return res.status(201).json(responseData);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user data'
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    // Ensure we always return a proper response, never throw
    return res.status(500).json({
      success: false,
      message: 'Server error during registration. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  try {
    // Get hashed token
    const emailVerificationToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    // Find user
    const user = await User.findOne({
      emailVerificationToken,
      emailVerificationExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Verify email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    // Generate token
    const token = user.getSignedJwtToken();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        lastOnboardingStep: user.lastOnboardingStep || 'welcome',
        authMethod: user.authMethod,
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Generate verification token
    const verificationToken = user.getEmailVerificationToken();
    await user.save();

    // Create verification url
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

    // Send verification email with better error handling
    try {
      // Check if email config is valid
      if (process.env.EMAIL_USERNAME === 'your_email@gmail.com' || 
          process.env.EMAIL_PASSWORD === 'your_app_password' ||
          !process.env.EMAIL_USERNAME ||
          !process.env.EMAIL_PASSWORD) {
        console.log('WARNING: Email service not properly configured.');
        return res.status(200).json({
          success: true, 
          message: 'Email verification is currently disabled. Please contact support.',
          warning: 'Email service not configured'
        });
      }
      
      await sendVerificationEmail(user, verificationUrl);
      return res.status(200).json({
        success: true,
        message: 'Verification email resent',
      });
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      
      // Don't fail completely, but let the user know there was an issue
      return res.status(200).json({
        success: true,
        message: 'Requested verification email, but could not send due to technical issues',
        warning: 'Verification email could not be sent'
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while trying to resend verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Check if email exists
// @route   POST /api/auth/check-email
// @access  Public
const checkEmailExists = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    // Return true if user exists, false otherwise
    return res.status(200).json({
      success: true,
      exists: !!user
    });
  } catch (error) {
    console.error('Error checking email existence:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error when checking email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = user.getSignedJwtToken();

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        lastOnboardingStep: user.lastOnboardingStep || 'welcome',
        authMethod: user.authMethod,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePicture: user.profilePicture,
      isEmailVerified: user.isEmailVerified,
      onboardingCompleted: user.onboardingCompleted,
      lastOnboardingStep: user.lastOnboardingStep || 'welcome',
      role: user.role,
      authMethod: user.authMethod,
    },
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Generate reset token
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // Create reset url
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    await sendPasswordResetEmail(user, resetUrl);

    res.status(200).json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error('Email could not be sent');
  }
});

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired token');
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Generate token
  const token = user.getSignedJwtToken();

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
});

// @desc    Google OAuth callback
// @route   GET /api/auth/google/callback
// @access  Public
const googleCallback = asyncHandler(async (req, res) => {
  // Generate token
  const token = req.user.getSignedJwtToken();

  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${!req.user.onboardingCompleted}`);
});

// @desc    Twitter OAuth callback
// @route   GET /api/auth/twitter/callback
// @access  Public
const twitterCallback = asyncHandler(async (req, res) => {
  // Generate token
  const token = req.user.getSignedJwtToken();

  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${!req.user.onboardingCompleted}`);
});

// @desc    Direct Twitter auth (for development)
// @route   POST /api/auth/twitter-auth
// @access  Public
const twitterAuth = asyncHandler(async (req, res) => {
  const { twitterId, name, email, profileImage } = req.body;

  if (!twitterId || !name) {
    res.status(400);
    throw new Error('Twitter ID and name are required');
  }

  // Split name into first and last name
  const nameParts = name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  
  // Generate a username from the name
  const username = name.replace(/\s+/g, '').toLowerCase();
  
  // If no email is provided, generate a placeholder email
  const generatedEmail = email || `${username}.twitter@placeholder.scripe.com`;

  try {
    // Check if user exists by Twitter ID
    let user = await User.findOne({ twitterId });
    
    // If not found by Twitter ID but email is provided, check by email
    if (!user && email) {
      user = await User.findOne({ email });
      
      // If user exists by email, update Twitter ID
      if (user) {
        user.twitterId = twitterId;
        if (!user.profilePicture && profileImage) {
          user.profilePicture = profileImage;
        }
        await user.save();
      }
    }
    
    // If user doesn't exist, create a new one
    if (!user) {
      user = await User.create({
        twitterId,
        firstName,
        lastName,
        email: generatedEmail, // Use the actual email or generated one
        isEmailVerified: email ? true : false,
        profilePicture: profileImage || null,
        authMethod: 'twitter',
        onboardingCompleted: false,
      });
    }

    // Generate token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        profilePicture: user.profilePicture,
      },
      redirectTo: !user.onboardingCompleted ? '/onboarding' : '/dashboard',
    });
  } catch (error) {
    console.error('Twitter Auth Error:', error);
    res.status(500);
    throw new Error('Error authenticating with Twitter');
  }
});

// @desc    Update user data
// @route   PUT /api/auth/update-user
// @access  Private
const updateUser = asyncHandler(async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      profilePicture, 
      onboardingCompleted, 
      lastOnboardingStep 
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields if provided
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (onboardingCompleted !== undefined) user.onboardingCompleted = onboardingCompleted;
    if (lastOnboardingStep !== undefined) user.lastOnboardingStep = lastOnboardingStep;

    // Save updated user
    const updatedUser = await user.save();

    return res.status(200).json({
      success: true,
      user: {
        id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        profilePicture: updatedUser.profilePicture,
        isEmailVerified: updatedUser.isEmailVerified,
        onboardingCompleted: updatedUser.onboardingCompleted,
        lastOnboardingStep: updatedUser.lastOnboardingStep,
        authMethod: updatedUser.authMethod,
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during user update',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = {
  registerUser,
  verifyEmail,
  resendVerification,
  checkEmailExists,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  googleCallback,
  twitterCallback,
  twitterAuth,
  updateUser,
}; 