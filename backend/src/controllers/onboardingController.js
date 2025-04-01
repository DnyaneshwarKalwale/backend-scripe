const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Onboarding = require('../models/onboardingModel');

// @desc    Save onboarding preferences
// @route   POST /api/onboarding
// @access  Private
const saveOnboarding = asyncHandler(async (req, res) => {
  const {
    workspaceType,
    workspaceName,
    teamMembers,
    theme,
    language,
    postFormat,
    postFrequency,
    lastOnboardingStep
  } = req.body;

  // Validation for required fields based on what's provided
  if (workspaceType === undefined && 
      theme === undefined && 
      language === undefined && 
      postFormat === undefined && 
      postFrequency === undefined &&
      lastOnboardingStep === undefined) {
    res.status(400);
    throw new Error('At least one onboarding field must be provided');
  }

  // If team workspace, name is required
  if (workspaceType === 'team' && !workspaceName) {
    res.status(400);
    throw new Error('Workspace name is required for team workspaces');
  }

  // Check if onboarding already exists for user
  let onboarding = await Onboarding.findOne({ user: req.user._id });

  // Determine if this is the final step of onboarding
  // If lastOnboardingStep is 'dashboard', it means user has completed the onboarding process
  // or if user has explicitly clicked "Go to dashboard" from the content-generation page
  const isCompleted = lastOnboardingStep === 'dashboard' || 
                      (lastOnboardingStep === 'content-generation' && req.body.onboardingCompleted === true);

  if (onboarding) {
    // Update existing onboarding
    if (workspaceType !== undefined) {
      onboarding.workspaceType = workspaceType;
    }
    
    if (workspaceName) {
      onboarding.workspaceName = workspaceName;
    }
    
    if (teamMembers && teamMembers.length > 0) {
      onboarding.teamMembers = teamMembers;
    }
    
    if (theme) {
      onboarding.theme = theme;
    }
    
    if (language) {
      onboarding.language = language;
    }
    
    if (postFormat) {
      onboarding.postFormat = postFormat;
    }
    
    if (postFrequency) {
      onboarding.postFrequency = postFrequency;
    }

    // Always save the last step if provided
    if (lastOnboardingStep) {
      onboarding.lastOnboardingStep = lastOnboardingStep;
    }

    await onboarding.save();
  } else {
    // Create new onboarding
    onboarding = await Onboarding.create({
      user: req.user._id,
      workspaceType: workspaceType || null,
      workspaceName: workspaceName || '',
      teamMembers: teamMembers || [],
      theme: theme || 'light',
      language: language || 'english',
      postFormat: postFormat || null,
      postFrequency: postFrequency || null,
      lastOnboardingStep: lastOnboardingStep || 'welcome'
    });
  }

  // Only update user's onboarding status if it's completed
  if (isCompleted) {
    // When onboarding is completed, update user model
    await User.findByIdAndUpdate(req.user._id, { 
      onboardingCompleted: true,
      lastOnboardingStep: 'dashboard'  // Ensure lastOnboardingStep is set to dashboard
    });
  } else if (lastOnboardingStep) {
    // Otherwise, update the lastOnboardingStep but don't mark as completed
    await User.findByIdAndUpdate(req.user._id, { 
      lastOnboardingStep: lastOnboardingStep,
      onboardingCompleted: false
    });
  }

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Get user's onboarding
// @route   GET /api/onboarding
// @access  Private
const getOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({ user: req.user._id });

  if (!onboarding) {
    res.status(404);
    throw new Error('Onboarding not found');
  }

  res.status(200).json({
    success: true,
    data: onboarding,
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

  if (!postFormat || !['standard', 'formatted', 'chunky', 'short', 'emojis'].includes(postFormat)) {
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

// @desc    Complete onboarding and skip to dashboard
// @route   POST /api/onboarding/complete
// @access  Private
const completeOnboarding = asyncHandler(async (req, res) => {
  try {
    // Mark onboarding as completed in the User model
    await User.findByIdAndUpdate(req.user._id, { 
      onboardingCompleted: true,
      lastOnboardingStep: 'dashboard'
    });

    // Also update the onboarding record if it exists
    const onboarding = await Onboarding.findOne({ user: req.user._id });
    if (onboarding) {
      onboarding.lastOnboardingStep = 'dashboard';
      await onboarding.save();
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      redirectTo: '/dashboard'
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while completing onboarding',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = {
  saveOnboarding,
  getOnboarding,
  updateTeamMembers,
  updateTheme,
  updateLanguage,
  updatePostFormat,
  updatePostFrequency,
  completeOnboarding
}; 