const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/userModel');
const { sendVerificationEmail, sendPasswordResetEmail, sendEmail } = require('../utils/emailService');
const { getTranslation } = require('../utils/translations');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/jwt');

// Generate OTP
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp;
};

// @desc    Register user with email
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  // Validation
  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  // Validate email format
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error('Please add a valid email');
  }

  // Check password length
  if (password.length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters');
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Generate OTP
  const otp = generateOTP();
  const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    authMethod: 'email',
    otpCode: otp,
    otpExpire
  });

  if (user) {
    // Send OTP verification email
    const message = `
      <h1>Email Verification</h1>
      <p>Thank you for registering with our platform. Please use the following code to verify your email:</p>
      <h2>${otp}</h2>
      <p>This code will expire in 10 minutes.</p>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Email Verification Code',
        html: message,
      });

      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        token: generateToken(user._id),
      });
    } catch (error) {
      user.otpCode = undefined;
      user.otpExpire = undefined;
      await user.save();

      res.status(500);
      throw new Error('Email could not be sent');
    }
  } else {
    res.status(400);
    throw new Error('Invalid user data');
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

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  // Check for user email
  const user = await User.findOne({ email });

  if (!user) {
    res.status(400);
    throw new Error('Invalid credentials');
  }

  if (user.authMethod !== 'email') {
    res.status(400);
    throw new Error(`This email is registered with ${user.authMethod}. Please sign in with ${user.authMethod}.`);
  }

  if (await user.matchPassword(password)) {
    // If email is not verified, generate new OTP and ask user to verify
    if (!user.isEmailVerified) {
      // Generate new OTP
      const otp = generateOTP();
      user.otpCode = otp;
      user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save();

      // Send OTP verification email
      const message = `
        <h1>Email Verification</h1>
        <p>Please use the following code to verify your email:</p>
        <h2>${otp}</h2>
        <p>This code will expire in 10 minutes.</p>
      `;

      try {
        await sendEmail({
          to: user.email,
          subject: 'Email Verification Code',
          html: message,
        });
      } catch (error) {
        user.otpCode = undefined;
        user.otpExpire = undefined;
        await user.save();

        res.status(500);
        throw new Error('Email could not be sent');
      }

      res.status(200).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: false,
        onboardingCompleted: user.onboardingCompleted,
        token: generateToken(user._id),
        requiresVerification: true
      });
      return;
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      onboardingCompleted: user.onboardingCompleted,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid credentials');
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
  try {
    // Generate token
    const token = req.user.getSignedJwtToken();
    
    // Check if onboarding is completed
    const onboardingStatus = req.user.onboardingCompleted ? 'false' : 'true';
    
    // Log successful authentication
    console.log('Google authentication successful:', {
      userId: req.user.id,
      email: req.user.email || '(email not provided)',
      onboardingStatus
    });
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${onboardingStatus}`);
  } catch (error) {
    console.error('Error in Google callback:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=internal_server_error`);
  }
});

// @desc    Twitter OAuth callback
// @route   GET /api/auth/twitter/callback
// @access  Public
const twitterCallback = asyncHandler(async (req, res) => {
  try {
    // Generate token
    const token = req.user.getSignedJwtToken();
    
    // Check if onboarding is completed
    const onboardingStatus = req.user.onboardingCompleted ? 'false' : 'true';
    
    // Log successful authentication
    console.log('Twitter authentication successful:', {
      userId: req.user.id,
      email: req.user.email || '(email not provided)',
      onboardingStatus,
      emailSource: req.user.email && req.user.email.includes('@placeholder.scripe.com') ? 'generated' : 'provided by user'
    });
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${onboardingStatus}`);
  } catch (error) {
    console.error('Error in Twitter callback:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=internal_server_error`);
  }
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

// OTP functions moved to a separate controller (otpController.js)

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
}; 