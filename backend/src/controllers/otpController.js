const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');
const { getTranslation } = require('../utils/translations');

// Generate OTP
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp;
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error(getTranslation('provideBothEmailAndCode', req.language));
  }

  // Get user by email
  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error(getTranslation('userNotFound', req.language));
  }

  // Check if OTP matches and is not expired
  if (user.otpCode !== otp || user.otpExpire < Date.now()) {
    res.status(400);
    throw new Error(getTranslation('invalidOrExpiredCode', req.language));
  }

  // Set user as verified
  user.isEmailVerified = true;
  user.otpCode = undefined;
  user.otpExpire = undefined;
  await user.save();

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
      isEmailVerified: true,
      onboardingCompleted: user.onboardingCompleted,
    }
  });
});

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error(getTranslation('provideEmail', req.language));
  }

  // Get user by email
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
  const otp = generateOTP();
  user.otpCode = otp;
  user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();

  // Send OTP verification email
  const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Email Verification</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>Please use the following code to verify your email:</p>
      <div style="text-align: center; margin: 30px 0;">
        <h2 style="font-size: 36px; letter-spacing: 5px; padding: 10px; background-color: #f5f5f5; border-radius: 5px;">${otp}</h2>
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you did not request this code, please ignore this email.</p>
      <p>Best regards,<br>The Scripe Team</p>
    </div>
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: getTranslation('emailVerificationCode', req.language),
      html: message,
    });

    res.status(200).json({ 
      success: true,
      message: getTranslation('verificationCodeSent', req.language)
    });
  } catch (error) {
    user.otpCode = undefined;
    user.otpExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error(getTranslation('emailSendingError', req.language));
  }
});

module.exports = {
  verifyOTP,
  resendOTP,
  generateOTP
}; 