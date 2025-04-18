const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Onboarding = require('../models/onboardingModel');

// @desc    Save onboarding progress
// @route   POST /api/onboarding
// @access  Private
const saveOnboarding = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Extract onboarding data from request body
    const { 
      currentStep, 
      workspaceType, 
      workspaceName, 
      teamMembers, 
      postFormat, 
      postFrequency,
      firstName,
      lastName,
      email,
      website,
      mobileNumber,
      inspirationProfiles,
      hasExtension
    } = req.body;

    console.log("Saving onboarding data:", {
      userId,
      currentStep, 
      workspaceType, 
      firstName,
      lastName
    });
    
    // Find or create onboarding record for user
    let onboarding = await Onboarding.findOne({ user: userId });
    
    if (!onboarding) {
      // Create new onboarding record with required fields
      const onboardingData = {
        user: userId,
      };
      
      // Only add fields that exist in the request
      if (currentStep !== undefined) onboardingData.currentStep = currentStep;
      if (workspaceType !== undefined) onboardingData.workspaceType = workspaceType || 'personal'; // Default to personal if null
      if (workspaceName !== undefined) onboardingData.workspaceName = workspaceName;
      if (teamMembers !== undefined) onboardingData.teamMembers = teamMembers;
      if (postFormat !== undefined) onboardingData.postFormat = postFormat || 'text'; // Default to text if null
      if (postFrequency !== undefined) onboardingData.postFrequency = postFrequency;
      if (firstName !== undefined) onboardingData.firstName = firstName;
      if (lastName !== undefined) onboardingData.lastName = lastName;
      if (email !== undefined) onboardingData.email = email;
      if (website !== undefined) onboardingData.website = website;
      if (mobileNumber !== undefined) onboardingData.mobileNumber = mobileNumber;
      if (inspirationProfiles !== undefined) onboardingData.inspirationProfiles = inspirationProfiles;
      if (hasExtension !== undefined) onboardingData.hasExtension = hasExtension;
      
      onboarding = new Onboarding(onboardingData);
    } else {
      // Update existing onboarding record
      if (currentStep !== undefined) onboarding.currentStep = currentStep;
      if (workspaceType !== undefined) onboarding.workspaceType = workspaceType || 'personal'; // Default to personal if null
      if (workspaceName !== undefined) onboarding.workspaceName = workspaceName;
      if (teamMembers && Array.isArray(teamMembers)) onboarding.teamMembers = teamMembers;
      if (postFormat !== undefined) onboarding.postFormat = postFormat || 'text'; // Default to text if null
      if (postFrequency !== undefined) onboarding.postFrequency = postFrequency;
      if (firstName !== undefined) onboarding.firstName = firstName;
      if (lastName !== undefined) onboarding.lastName = lastName;
      if (email !== undefined) onboarding.email = email;
      if (website !== undefined) onboarding.website = website;
      if (mobileNumber !== undefined) onboarding.mobileNumber = mobileNumber;
      if (inspirationProfiles && Array.isArray(inspirationProfiles)) onboarding.inspirationProfiles = inspirationProfiles;
      if (hasExtension !== undefined) onboarding.hasExtension = hasExtension;
    }
    
    try {
      await onboarding.save();
      
      res.status(200).json({
        success: true,
        data: onboarding,
        message: 'Onboarding progress saved successfully'
      });
    } catch (error) {
      console.error('Error during onboarding save operation:', error);
      // Try to recover with default values if validation fails
      if (error.name === 'ValidationError') {
        // Apply defaults to any fields with validation errors
        if (error.errors.workspaceType) onboarding.workspaceType = 'personal';
        if (error.errors.postFormat) onboarding.postFormat = 'text';
        
        // Try saving again
        await onboarding.save();
        
        res.status(200).json({
          success: true,
          data: onboarding,
          message: 'Onboarding progress saved successfully with defaults'
        });
      } else {
        throw error; // Re-throw if it's not a validation error
      }
    }
  } catch (error) {
    console.error('Error saving onboarding progress:', error);
    res.status(500);
    throw new Error('Error saving onboarding progress: ' + error.message);
  }
});

// @desc    Get user's onboarding
// @route   GET /api/onboarding
// @access  Private
const getOnboarding = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const onboarding = await Onboarding.findOne({ user: userId });
    
    if (!onboarding) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No onboarding data found for this user'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        currentStep: onboarding.currentStep,
        workspaceType: onboarding.workspaceType,
        workspaceName: onboarding.workspaceName,
        teamMembers: onboarding.teamMembers,
        postFormat: onboarding.postFormat,
        postFrequency: onboarding.postFrequency,
        firstName: onboarding.firstName,
        lastName: onboarding.lastName,
        email: onboarding.email,
        website: onboarding.website,
        mobileNumber: onboarding.mobileNumber,
        inspirationProfiles: onboarding.inspirationProfiles || [],
        hasExtension: onboarding.hasExtension
      }
    });
  } catch (error) {
    console.error('Error fetching onboarding data:', error);
    res.status(500);
    throw new Error('Error fetching onboarding data');
  }
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

// @desc    Update post format
// @route   PUT /api/onboarding/post-format
// @access  Private
const updatePostFormat = asyncHandler(async (req, res) => {
  const { postFormat } = req.body;

  if (!postFormat || !['text', 'carousel', 'document', 'visual', 'poll'].includes(postFormat)) {
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
  updatePostFormat,
  updatePostFrequency,
  completeOnboarding,
  updateExtensionStatus,
  generateInitialContent
}; 