/**
 * Simplified translations utility
 * Returns the English string regardless of language parameter
 */

/**
 * Get the translation for a specific key in the given language
 * @param {string} key - The translation key
 * @param {string} language - The language (ignored in this implementation)
 * @returns {string} - The English translation
 */
const getTranslation = (key, language) => {
  // Simplified translations object with only English
  const translations = {
    // Auth translations
    missingFields: 'Please provide all required fields',
    invalidEmail: 'Please provide a valid email address',
    passwordLength: 'Password must be at least 6 characters',
    emailAlreadyExists: 'Email already exists',
    userRegistered: 'User registered successfully',
    invalidOrExpiredToken: 'Invalid or expired token',
    emailVerified: 'Email verified successfully',
    userNotFound: 'User not found',
    emailAlreadyVerified: 'Email already verified',
    verificationEmailResent: 'Verification email resent',
    emailSendingError: 'Error sending email',
    invalidOrExpiredOTP: 'Invalid or expired OTP',
    invalidCredentials: 'Invalid credentials',
    passwordResetEmailSent: 'Password reset email sent',
    passwordResetSuccessful: 'Password reset successful',
    logoutSuccess: 'Logged out successfully',
    serverError: 'Server error',
  };
  
  // Return the English translation or the key itself as fallback
  return translations[key] || key;
};

module.exports = { getTranslation }; 