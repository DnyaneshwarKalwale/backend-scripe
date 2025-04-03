const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/userModel');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { getTranslation } = require('../utils/translations');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/jwt');

// @desc    Register user with email
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  // Validation
  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error(getTranslation('missingFields', req.language));
  }

  // Email validation
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error(getTranslation('invalidEmail', req.language));
  }

  // Password validation (at least 8 characters)
  if (password.length < 8) {
    res.status(400);
    throw new Error(getTranslation('passwordLength', req.language));
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error(getTranslation('emailAlreadyExists', req.language));
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Get language preference from request or default to English
  const language = req.language || 'english';

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    language, // Store user's language preference
    authMethod: 'email',
  });

  if (user) {
    // Generate OTP code
    const otp = user.generateEmailVerificationOTP();
    await user.save();

    // Send verification email with OTP
    try {
      await sendVerificationEmail(user, null);

      res.status(201).json({
        success: true,
        message: getTranslation('userRegistered', req.language),
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          language: user.language,
          isEmailVerified: user.isEmailVerified,
          onboardingCompleted: user.onboardingCompleted,
        },
      });
    } catch (error) {
      console.error('Email sending error:', error);
      user.emailVerificationOTP = undefined;
      user.emailVerificationOTPExpire = undefined;
      await user.save();

      res.status(500);
      throw new Error(getTranslation('emailSendingError', req.language));
    }
  } else {
    res.status(400);
    throw new Error(getTranslation('serverError', req.language));
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
    throw new Error(getTranslation('invalidOrExpiredToken', req.language));
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
    message: getTranslation('emailVerified', req.language),
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      language: user.language,
      isEmailVerified: user.isEmailVerified,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
});

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Private
const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error(getTranslation('userNotFound', req.language));
  }

  if (user.isEmailVerified) {
    res.status(400);
    throw new Error(getTranslation('emailAlreadyVerified', req.language));
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
      message: getTranslation('verificationEmailResent', req.language),
    });
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error(getTranslation('emailSendingError', req.language));
  }
});

// @desc    Verify OTP code
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error(getTranslation('missingFields', req.language));
  }

  // Find user
  const user = await User.findOne({
    email,
    emailVerificationOTP: otp,
    emailVerificationOTPExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error(getTranslation('invalidOrExpiredOTP', req.language));
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationOTP = undefined;
  user.emailVerificationOTPExpire = undefined;
  await user.save();

  // Generate token
  const token = user.getSignedJwtToken();

  res.status(200).json({
    success: true,
    message: getTranslation('emailVerified', req.language),
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      language: user.language,
      isEmailVerified: user.isEmailVerified,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
});

// @desc    Resend verification OTP
// @route   POST /api/auth/resend-otp
// @access  Public
const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error(getTranslation('missingFields', req.language));
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error(getTranslation('userNotFound', req.language));
  }

  if (user.isEmailVerified) {
    res.status(400);
    throw new Error(getTranslation('emailAlreadyVerified', req.language));
  }

  // Generate new OTP
  const otp = user.generateEmailVerificationOTP();
  await user.save();

  // Send verification email with OTP
  try {
    await sendVerificationEmail(user, null);

    res.status(200).json({
      success: true,
      message: getTranslation('verificationEmailResent', req.language),
    });
  } catch (error) {
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error(getTranslation('emailSendingError', req.language));
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
    throw new Error(getTranslation('userNotFound', req.language));
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    res.status(401);
    throw new Error(getTranslation('invalidCredentials', req.language));
  }

  // Check if email is verified for email auth method
  if (user.authMethod === 'email' && !user.isEmailVerified) {
    // Generate new OTP if needed
    if (!user.emailVerificationOTP || !user.emailVerificationOTPExpire || user.emailVerificationOTPExpire < Date.now()) {
      const otp = user.generateEmailVerificationOTP();
      await user.save();
      await sendVerificationEmail(user, null);
    }

    res.status(403).json({
      success: false,
      message: getTranslation('emailNotVerified', req.language),
      requireVerification: true,
      email: user.email
    });
    return;
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
      language: user.language,
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
      language: user.language,
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
    throw new Error(getTranslation('userNotFound', req.language));
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
      message: getTranslation('passwordResetEmailSent', req.language),
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error(getTranslation('emailSendingError', req.language));
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
    throw new Error(getTranslation('invalidOrExpiredToken', req.language));
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
    message: getTranslation('passwordResetSuccessful', req.language),
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      language: user.language,
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

  try {
    if (!twitterId || !name) {
      res.status(400);
      throw new Error(getTranslation('twitterIDAndNameRequired', req.language));
    }

    // Split name into first and last name
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Generate a Twitter username-based email if one is not provided
    const username = name.replace(/\s+/g, '').toLowerCase();
    const generatedEmail = email || `${username}.twitter@placeholder.scripe.com`;

    console.log(`Twitter Auth: Using ${email ? 'provided email: ' + email : 'generated email: ' + generatedEmail}`);

    // Find user by Twitter ID first
    let user = await User.findOne({ twitterId });

    // If not found by Twitter ID but email is provided, try to find by email
    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        // Update user with Twitter ID if found by email
        user.twitterId = twitterId;
        if (!user.profilePicture && profileImage) {
          user.profilePicture = profileImage;
        }
        await user.save();
      }
    }

    // If user still not found, create a new one
    if (!user) {
      user = await User.create({
        twitterId,
        firstName,
        lastName,
        email: generatedEmail,
        isEmailVerified: email ? true : false, // Only mark as verified if real email provided
        profilePicture: profileImage || null,
        authMethod: 'twitter',
        onboardingCompleted: false,
      });
    }

    // Generate JWT token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        language: user.language,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        profilePicture: user.profilePicture,
      },
      redirectTo: !user.onboardingCompleted ? '/onboarding' : '/dashboard',
    });
  } catch (error) {
    console.error('Twitter Auth Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterAuthError', req.language));
  }
});

// @desc    Logout user
// @route   GET /api/auth/logout
// @access  Public
const logout = asyncHandler(async (req, res) => {
  req.logout(function(err) {
    if (err) { 
      res.status(500);
      throw new Error(getTranslation('serverError', req.language));
    }
    // Destroy session
    req.session.destroy();
    
    res.status(200).json({ 
      message: getTranslation('logoutSuccess', req.language) 
    });
  });
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
  logout,
  verifyOTP,
  resendOTP,
}; 