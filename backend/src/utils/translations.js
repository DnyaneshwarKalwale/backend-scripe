/**
 * Simplified translations utility for error messages
 */

const translations = {
  // Common messages
  userRegistered: "User registered successfully",
  loginSuccess: "Login successful",
  logoutSuccess: "Logged out successfully",
  invalidCredentials: "Invalid credentials",
  userNotFound: "User not found",
  
  // Onboarding messages
  onboardingUpdated: "Onboarding preferences updated",
  onboardingCompleted: "Onboarding completed successfully",
  onboardingSaved: "Onboarding progress saved",
  
  // User-related messages
  profileUpdated: "Profile updated successfully",
  emailAlreadyExists: "Email already exists",
  passwordUpdated: "Password updated successfully",
  accountDeleted: "Account deleted successfully",
  
  // LinkedIn-related messages
  linkedinConnected: "LinkedIn account connected successfully",
  linkedinDisconnected: "LinkedIn account disconnected",
  linkedinNotConnected: "LinkedIn account not connected",
  linkedinFetchError: "Error fetching data from LinkedIn",
  
  // Team-related messages
  teamCreated: "Team created successfully",
  teamUpdated: "Team updated successfully",
  memberAdded: "Team member added successfully",
  memberRemoved: "Team member removed",
  
  // Error messages
  unauthorized: "Unauthorized access",
  serverError: "Server error",
  notFound: "Resource not found"
};

/**
 * Get translation for a key
 * @param {string} key - The translation key
 * @returns {string} - The translated text or the key itself if translation not found
 */
const getTranslation = (key) => {
  return translations[key] || key;
};

module.exports = {
  getTranslation,
  translations
}; 