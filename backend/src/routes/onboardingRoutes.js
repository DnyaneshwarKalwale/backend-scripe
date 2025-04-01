const express = require('express');
const { 
  saveOnboarding,
  getOnboarding,
  updateTeamMembers,
  updateTheme,
  updateLanguage,
  updatePostFormat,
  updatePostFrequency,
  completeOnboarding
} = require('../controllers/onboardingController');
const { protect, checkEmailVerified } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);
router.use(checkEmailVerified);

// Onboarding routes
router.route('/')
  .post(saveOnboarding)
  .get(getOnboarding);

// Route to complete onboarding and go to dashboard
router.post('/complete', completeOnboarding);

router.put('/team-members', updateTeamMembers);
router.put('/theme', updateTheme);
router.put('/language', updateLanguage);
router.put('/post-format', updatePostFormat);
router.put('/post-frequency', updatePostFrequency);

module.exports = router; 