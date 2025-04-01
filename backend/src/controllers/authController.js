const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/userModel');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

// @desc    Register user with email
// @route   POST /api/auth/register
// @access  Public

// @desc    Register user with email
const registerUser = asyncHandler(async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      res.status(400);
      throw new Error('Please provide all required fields: first name, last name, email, and password');
    }

    // Email validation
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      res.status(400);
      throw new Error('Please provide a valid email address');
    }

    // Password validation (at least 8 characters)
    if (password.length < 8) {
      res.status(400);
      throw new Error('Password must be at least 8 characters long');
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
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

      // Try to send verification email if properly configured
      if (process.env.EMAIL_USERNAME === 'your_email@gmail.com' || 
          process.env.EMAIL_PASSWORD === 'your_app_password') {
        console.log('WARNING: Email service not properly configured. Skipping email sending.');
        responseData.warning = 'Email verification is disabled in development mode. Email service not configured.';
      } else {
        try {
          await sendVerificationEmail(user, verificationUrl);
          responseData.message = 'User registered. Please check your email to verify your account';
        } catch (error) {
          console.error('Email sending error:', error);
          responseData.warning = 'Verification email could not be sent. Please contact support.';
        }
      }

      return res.status(201).json(responseData);
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(error.statusCode || 500);
    throw error;
  }
});

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
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
    res.status(400);
    throw new Error('Invalid or expired token');
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  // Generate token
  const token = user.getSignedJwtToken();

  res.status(200).json({
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
    },
  });
});

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.isEmailVerified) {
    res.status(400);
    throw new Error('Email already verified');
  }

  // Generate verification token
  const verificationToken = user.getEmailVerificationToken();
  await user.save();

  // Create verification url
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

  // Send verification email
  try {
    await sendVerificationEmail(user, verificationUrl);

    res.status(200).json({
      success: true,
      message: 'Verification email resent',
    });
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error('Email could not be sent');
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check for user
  const user = await User.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid credentials');
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
    },
  });
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

module.exports = {
  registerUser,
  verifyEmail,
  resendVerification,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  googleCallback,
  twitterCallback,
  twitterAuth,
}; 