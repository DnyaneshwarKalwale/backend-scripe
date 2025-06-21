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

  // Validation - lastName is now optional
  if (!firstName || !email || !password) {
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
    lastName: lastName || '', // Use empty string if lastName is not provided
    email,
    password: hashedPassword,
    language, // Store user's language preference
    authMethod: 'email',
  });

  if (user) {
    // Automatically activate free trial for new users
    try {
      const UserLimit = require('../models/userLimitModel');
      
      // Check if user already has a trial (prevent duplicate trials)
      const existingLimit = await UserLimit.findOne({ userId: user._id });
      
      if (!existingLimit) {
        // Set trial expiration date (7 days from now)
        const trialExpiration = new Date();
        trialExpiration.setDate(trialExpiration.getDate() + 7);
        
        // Create user limit with trial plan
        await UserLimit.create({
          userId: user._id,
          limit: 3, // 3 credits for trial
          count: 0,
          planId: 'trial',
          planName: 'Free Trial',
          expiresAt: trialExpiration,
          status: 'active',
          subscriptionStartDate: new Date()
        });
        
        console.log(`Free trial automatically activated for new user: ${user.email}`);
      } else {
        console.log(`User ${user.email} already has a user limit, skipping trial activation`);
      }
    } catch (limitError) {
      console.error('Error creating user limit for new user:', limitError);
      // Continue with registration even if limit creation fails
    }

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

  // Validation
  if (!email || !password) {
    res.status(400);
    throw new Error(getTranslation('missingFields', req.language));
  }

  // Find user
  const user = await User.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error(getTranslation('invalidCredentials', req.language));
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    res.status(401);
    throw new Error(getTranslation('invalidCredentials', req.language));
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
      profilePicture: user.profilePicture,
      authMethod: user.authMethod,
      role: user.role,
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
      linkedinConnected: user.linkedinConnected,
      linkedinId: user.linkedinId,
      googleId: user.googleId,
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

// @desc    LinkedIn OAuth callback
// @route   GET /api/auth/linkedin/callback
// @access  Public
const linkedinCallback = asyncHandler(async (req, res) => {
  // Generate token
  const token = req.user.getSignedJwtToken();

  // Convert boolean to string 'true' or 'false' for URL parameter
  const needsOnboarding = req.user.onboardingCompleted ? 'false' : 'true';
  console.log(`LinkedIn callback - User needs onboarding: ${needsOnboarding}`);

  // Redirect to frontend with token and explicit onboarding parameter
  res.redirect(`${process.env.FRONTEND_URL}/auth/social-callback?token=${token}&onboarding=${needsOnboarding}`);
});

// @desc    Direct LinkedIn auth (for development)
// @route   POST /api/auth/linkedin-auth
// @access  Public
const linkedinAuth = asyncHandler(async (req, res) => {
  const { linkedinId, name, email, profileImage } = req.body;

  try {
    if (!linkedinId || !name || !email) {
      res.status(400);
      throw new Error(getTranslation('linkedinInfoRequired', req.language));
    }

    // Handle name - use the full name as firstName if no space is found
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Find user by LinkedIn ID first
    let user = await User.findOne({ linkedinId });

    // If not found by LinkedIn ID, try to find by email
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        // Update user with LinkedIn ID if found by email
        user.linkedinId = linkedinId;
        if (!user.profilePicture && profileImage) {
          user.profilePicture = profileImage;
        }
        await user.save();
      }
    }

    // If user still not found, create a new one
    if (!user) {
      user = await User.create({
        linkedinId,
        firstName,
        lastName,
        email,
        isEmailVerified: true, // LinkedIn emails are verified
        profilePicture: profileImage || null,
        authMethod: 'linkedin',
        onboardingCompleted: false,
      });
      
      // Automatically activate free trial for new LinkedIn direct auth users
      try {
        const UserLimit = require('../models/userLimitModel');
        
        // Check if user already has a trial (prevent duplicate trials)
        const existingLimit = await UserLimit.findOne({ userId: user._id });
        
        if (!existingLimit) {
          // Set trial expiration date (7 days from now)
          const trialExpiration = new Date();
          trialExpiration.setDate(trialExpiration.getDate() + 7);
          
          // Create user limit with trial plan
          await UserLimit.create({
            userId: user._id,
            limit: 3, // 3 credits for trial
            count: 0,
            planId: 'trial',
            planName: 'Free Trial',
            expiresAt: trialExpiration,
            status: 'active',
            subscriptionStartDate: new Date()
          });
          
          console.log(`Free trial automatically activated for new LinkedIn direct auth user: ${user.email}`);
        } else {
          console.log(`LinkedIn direct auth user ${user.email} already has a user limit, skipping trial activation`);
        }
      } catch (limitError) {
        console.error('Error creating user limit for new LinkedIn direct auth user:', limitError);
        // Continue with auth even if limit creation fails
      }
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
    console.error('LinkedIn Auth Error:', error);
    res.status(500);
    throw new Error(getTranslation('linkedinAuthError', req.language));
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
  linkedinCallback,
  linkedinAuth,
  logout,
  verifyOTP,
  resendOTP,
}; 