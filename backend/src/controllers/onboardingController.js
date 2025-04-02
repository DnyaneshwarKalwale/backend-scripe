const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Onboarding = require('../models/onboardingModel');

// @desc    Save onboarding preferences
// @route   POST /api/onboarding
// @access  Private
const saveOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Find the existing onboarding record or create a new one
  let onboarding = await Onboarding.findOne({ user: userId });
  
  if (!onboarding) {
    onboarding = new Onboarding({
      user: userId,
      ...req.body
    });
  } else {
    // Update all fields sent in the request
    Object.keys(req.body).forEach(key => {
      onboarding[key] = req.body[key];
    });
  }
  
  await onboarding.save();
  
  res.status(200).json({
    success: true,
    data: onboarding
  });
});

// @desc    Get user's onboarding
// @route   GET /api/onboarding
// @access  Private
const getOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  const onboarding = await Onboarding.findOne({ user: userId });
  
  if (!onboarding) {
    return res.status(200).json({
      success: true,
      data: null
    });
  }
  
  res.status(200).json({
    success: true,
    data: onboarding
  });
});

// @desc    Update team members
// @route   PUT /api/onboarding/team-members
// @access  Private
const updateTeamMembers = asyncHandler(async (req, res) => {
  const { teamMembers } = req.body;

  if (!teamMembers || !Array.isArray(teamMembers)) {
    res.status(400);
    throw new Error('Team members must be provided as an array');
  }

  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  // Only allow team members update for team workspaces
  if (onboarding.workspaceType !== 'team') {
    res.status(400);
    throw new Error('Team members can only be added to team workspaces');
  }

  onboarding.teamMembers = teamMembers;
  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update theme preference
// @route   PUT /api/onboarding/theme
// @access  Private
const updateTheme = asyncHandler(async (req, res) => {
  const { theme } = req.body;

  if (!theme || !['light', 'dark'].includes(theme)) {
    res.status(400);
    throw new Error('Valid theme (light or dark) is required');
  }

  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  onboarding.theme = theme;
  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update language preference
// @route   PUT /api/onboarding/language
// @access  Private
const updateLanguage = asyncHandler(async (req, res) => {
  const { language } = req.body;

  if (!language || !['english', 'german'].includes(language)) {
    res.status(400);
    throw new Error('Valid language (english or german) is required');
  }

  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  onboarding.language = language;
  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update post format
// @route   PUT /api/onboarding/post-format
// @access  Private
const updatePostFormat = asyncHandler(async (req, res) => {
  const { postFormat } = req.body;

  if (!postFormat || !['thread', 'concise', 'hashtag', 'visual', 'viral'].includes(postFormat)) {
    res.status(400);
    throw new Error('Valid post format is required');
  }

  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  onboarding.postFormat = postFormat;
  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update post frequency
// @route   PUT /api/onboarding/post-frequency
// @access  Private
const updatePostFrequency = asyncHandler(async (req, res) => {
  const { postFrequency } = req.body;

  if (!postFrequency || postFrequency < 1 || postFrequency > 7) {
    res.status(400);
    throw new Error('Valid post frequency (1-7) is required');
  }

  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  onboarding.postFrequency = postFrequency;
  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Complete onboarding and redirect to dashboard
// @route   POST /api/onboarding/complete
// @access  Private
const completeOnboarding = asyncHandler(async (req, res) => {
  // Update user's onboarding status
  await User.findByIdAndUpdate(req.user._id, { onboardingCompleted: true });

  res.status(200).json({
    success: true,
    message: 'Onboarding completed successfully',
    redirectTo: '/dashboard'
  });
});

const updateExtensionStatus = asyncHandler(async (req, res) => {
  const { hasExtension } = req.body;
  const userId = req.user._id;

  const onboarding = await Onboarding.findOne({ user: userId });
  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  onboarding.hasExtension = hasExtension;
  await onboarding.save();

  res.status(200).json({ success: true, data: onboarding });
});

const generateInitialContent = asyncHandler(async (req, res) => {
  const { youtubeLink, file } = req.body;
  const userId = req.user._id;

  // Handle content generation based on input type
  let generatedContent;
  if (youtubeLink) {
    // Process YouTube link
    generatedContent = await processYoutubeLink(youtubeLink);
  } else if (file) {
    // Process uploaded file
    generatedContent = await processUploadedFile(file);
  } else {
    res.status(400);
    throw new Error('Please provide either a YouTube link or a file');
  }

  res.status(200).json({
    success: true,
    data: {
      content: generatedContent
    }
  });
});

module.exports = {
  saveOnboarding,
  getOnboarding,
  updateTeamMembers,
  updateTheme,
  updateLanguage,
  updatePostFormat,
  updatePostFrequency,
  completeOnboarding,
  updateExtensionStatus,
  generateInitialContent
}; 