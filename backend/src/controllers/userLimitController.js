const UserLimit = require('../models/userLimitModel');
const User = require('../models/userModel');
const { isAdmin } = require('../middleware/authMiddleware');

// Define plan mappings - trial plan requires purchase
const PLAN_LIMITS = {
  trial: { limit: 3, name: 'Trial', duration: 7, price: 20 }, // 7 days, 3 credits, $20
  basic: { limit: 10, name: 'Basic', duration: 30, price: 100 }, // $100/month, 30 days
  premium: { limit: 25, name: 'Premium', duration: 30, price: 200 }, // $200/month, 30 days
  custom: { limit: 0, name: 'Custom', duration: 30, price: 200 } // Custom limits are set individually
};

// Default plan for new users is expired (no plan)
const DEFAULT_PLAN = 'expired';

// Helper function to check if a subscription has expired and handle accordingly
exports.checkAndHandleSubscriptionExpiration = async (userId) => {
  try {
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      return null;
    }
    
    // Check if subscription has expired
    if (userLimit.expiresAt && new Date() > new Date(userLimit.expiresAt)) {
      // Check if auto-pay is enabled (you would implement this flag in your userLimit model)
      const hasAutoPay = userLimit.autoPay === true;
      
      if (!hasAutoPay) {
        // If auto-pay is not enabled, mark as expired but keep the current count
        userLimit.planId = 'expired';
        userLimit.planName = 'No Plan';
        userLimit.status = 'inactive';
        // Keep count as is, but set limit to 0 to prevent further usage
        userLimit.limit = 0;
        await userLimit.save();
        
        console.log(`Subscription expired for user ${userId}. Auto-pay not enabled, setting to expired plan.`);
        return userLimit;
      } else {
        // If auto-pay is enabled, this would be handled by Stripe webhooks
        // Here we just log that we're waiting for Stripe to process the renewal
        console.log(`Subscription expired for user ${userId} with auto-pay enabled. Waiting for payment processing.`);
      }
    }
    
    return userLimit;
  } catch (error) {
    console.error('Error checking subscription expiration:', error);
    return null;
  }
};

// Get current user's limit
exports.getCurrentUserLimit = async (req, res) => {
  // Set CORS headers explicitly
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  try {
    // Get User model for additional information
    const User = require('../models/userModel');

    // First check if the user limit exists
    let userLimit = await UserLimit.findOne({ userId: req.user.id });
    
    if (!userLimit) {
      // Create with expired plan by default (no credits)
      const newUserLimit = await UserLimit.create({
        userId: req.user.id,
        limit: 0,
        count: 0,
        planId: 'expired',
        planName: 'No Plan',
        expiresAt: null,
        status: 'inactive',
        autoPay: false // Default to auto-pay disabled
      });
      
      return res.status(200).json({
        success: true,
        data: {
          ...newUserLimit.toObject(),
          remaining: 0,
          userEmail: req.user.email,
          userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.name || 'Unknown User',
          status: 'inactive',
          planId: 'expired',
          planName: 'No Plan',
          limit: 0,
          count: 0,
          expiresAt: null
        }
      });
    }

    // Check for subscription expiration and handle accordingly
    userLimit = await exports.checkAndHandleSubscriptionExpiration(req.user.id) || userLimit;
    
    // Get user details
    const user = await User.findById(req.user.id);
    
    // Create response object with all necessary data
    const responseData = {
      ...userLimit.toObject(),
      remaining: Math.max(0, userLimit.limit - userLimit.count),
      userEmail: user?.email || req.user.email,
      userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name : 'Unknown User',
      status: userLimit.status || 'inactive',
      planId: userLimit.planId,
      planName: userLimit.planName,
      limit: userLimit.limit,
      count: userLimit.count,
      expiresAt: userLimit.expiresAt
    };
    
    // Log the response data for debugging
    console.log('User limit response data:', JSON.stringify(responseData, null, 2));
    
    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting user limit:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get user limit'
    });
  }
};

// Get user's limit
exports.getUserLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check access permission (user can only access their own limit unless admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this user\'s limit'
      });
    }
    
    const userLimit = await UserLimit.findOne({ userId });

    if (!userLimit) {
      // Create with expired plan by default (no credits)
      const newLimit = await UserLimit.create({
        userId,
        limit: 0,
        count: 0,
        planId: DEFAULT_PLAN,
        planName: 'Expired',
        expiresAt: null
      });
      
      return res.status(200).json({
        success: true,
        data: {
          ...newLimit.toObject(),
          remaining: 0
        }
      });
    }
    
    // If this is an admin request, include user details
    let userData = {};
    if (req.user.role === 'admin') {
      const User = require('../models/userModel');
      const user = await User.findById(userId, 'email firstName lastName name');
      if (user) {
        userData = {
          userEmail: user.email || '',
          userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'
        };
      }
    }
    
    const limitObj = {
      ...userLimit.toObject(),
      remaining: Math.max(0, userLimit.limit - userLimit.count),
      ...userData
    };
    
    res.status(200).json({
      success: true,
      data: limitObj
    });
  } catch (error) {
    console.error('Error fetching user limit:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch user limit',
      error: error.message 
    });
  }
};

// Increment user's count
exports.incrementUserCount = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check access permission (user can only increment their own count unless admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this user\'s limit'
      });
    }
    
    let userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      // Create with expired plan by default (no credits)
      userLimit = await UserLimit.create({
        userId,
        limit: 0,
        count: 0,
        planId: DEFAULT_PLAN,
        planName: 'Expired',
        expiresAt: null
      });
    }
    
    // Check if subscription has expired
    if (userLimit.hasExpired()) {
      // Revert to expired plan if expired
      await userLimit.updatePlan({
        planId: DEFAULT_PLAN,
        planName: 'Expired',
        limit: 0,
        expiresAt: null
      });
      
      return res.status(402).json({  // 402 Payment Required
        success: false,
        message: 'Your subscription has expired. Please purchase a plan for full access.',
        data: {
          limit: userLimit.limit,
          count: userLimit.count,
          remaining: userLimit.limit - userLimit.count,
          planId: userLimit.planId,
          planName: userLimit.planName,
          expiresAt: userLimit.expiresAt,
          expired: true,
          renewed: false,
          userEmail: req.user.email || '',
          userName: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Unknown User'
        }
      });
    }
    
    // Check if user has already reached their limit
    if (userLimit.count >= userLimit.limit) {
      return res.status(402).json({  // 402 Payment Required
        success: false,
        message: 'You have reached your credit limit. Please upgrade your plan.',
        data: {
          limit: userLimit.limit,
          count: userLimit.count,
          remaining: 0,
          planId: userLimit.planId,
          planName: userLimit.planName,
          expiresAt: userLimit.expiresAt,
          userEmail: req.user.email || '',
          userName: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Unknown User'
        }
      });
    }
    
    // Increment the count
    userLimit.count += 1;
    await userLimit.save();
    
    // Get user info if this is an admin request
    let userData = {};
    if (req.user.role === 'admin' && req.user.id !== userId) {
      try {
        const user = await User.findById(userId, 'email firstName lastName name');
        if (user) {
          userData = {
            userEmail: user.email || '',
            userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'
          };
        }
      } catch (error) {
        console.log('Error fetching user data:', error);
      }
    } else {
      // Include the current user's info
      userData = {
        userEmail: req.user.email || '',
        userName: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Unknown User'
      };
    }
    
    return res.status(200).json({
      success: true,
      message: 'Credit count incremented successfully',
      data: {
        limit: userLimit.limit,
        count: userLimit.count,
        remaining: userLimit.limit - userLimit.count,
        planId: userLimit.planId,
        planName: userLimit.planName,
        expiresAt: userLimit.expiresAt,
        ...userData
      }
    });
  } catch (error) {
    console.error('Error incrementing user count:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to increment user count',
      error: error.message
    });
  }
};

// Reset user limit
exports.resetUserLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admin can reset limits
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can reset limits'
      });
    }
    
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      return res.status(404).json({
        success: false,
        message: 'User limit not found'
      });
    }
    
    await userLimit.resetCount();
    
    // Get user info
    let userData = {};
    try {
      const user = await User.findById(userId, 'email firstName lastName name');
      if (user) {
        userData = {
          userEmail: user.email || '',
          userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'
        };
      }
    } catch (error) {
      console.log('Error fetching user data:', error);
    }
    
    return res.status(200).json({
      success: true,
      message: 'User limit reset successfully',
      data: {
        limit: userLimit.limit,
        count: userLimit.count,
        remaining: userLimit.limit,
        planId: userLimit.planId,
        planName: userLimit.planName,
        ...userData
      }
    });
  } catch (error) {
    console.error('Error resetting user limit:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset user limit',
      error: error.message
    });
  }
};

// Update user's subscription plan
exports.updateUserPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, planName, limit, expiresAt } = req.body;
    
    console.log(`Updating user ${userId} to plan ${planId} (${planName}) with limit ${limit} and expiry ${expiresAt}`);
    
    // Validate plan ID
    if (!planId || !PLAN_LIMITS[planId] && planId !== 'expired') {
      return res.status(400).json({
        success: false,
        message: `Invalid plan ID: ${planId}`
      });
    }
    
    // Get current user limit
    let userLimit = await UserLimit.findOne({ userId });
    if (!userLimit) {
      // Create new user limit if not found
      userLimit = new UserLimit({
        userId,
        limit: 0,
        count: 0,
        planId: 'expired',
        planName: 'No Plan',
        expiresAt: null,
        status: 'inactive'
      });
    }
    
    // Get plan details
    let status = 'active';
    let finalExpiresAt = expiresAt;
    let finalLimit = limit;
    let finalPlanName = planName;
    
    // Set default values based on plan type if not provided
    if (planId !== 'expired') {
      const planDetails = PLAN_LIMITS[planId];
      finalLimit = limit || planDetails.limit;
      finalPlanName = planName || planDetails.name;
      
      if (!finalExpiresAt) {
        // Calculate expiry based on plan type
        const now = new Date();
        if (planId === 'trial') {
          // Trial is 7 days
          const trialExpiry = new Date(now);
          trialExpiry.setDate(trialExpiry.getDate() + 7);
          finalExpiresAt = trialExpiry.toISOString();
        } else {
          // Paid plans are 30 days
          const paidExpiry = new Date(now);
          paidExpiry.setDate(paidExpiry.getDate() + 30);
          finalExpiresAt = paidExpiry.toISOString();
        }
      }
    } else {
      // For expired plans
      status = 'inactive';
      finalExpiresAt = null;
      finalLimit = 0;
      finalPlanName = 'No Plan';
    }
    
    // Update the user limit
    userLimit.planId = planId;
    userLimit.planName = finalPlanName;
    userLimit.limit = finalLimit;
    userLimit.status = status;
    
    if (finalExpiresAt) {
      userLimit.expiresAt = new Date(finalExpiresAt);
    } else {
      userLimit.expiresAt = null;
    }
    
    // If changing to a new plan, reset the count
    if (userLimit.isModified('planId')) {
      userLimit.count = 0;
      userLimit.subscriptionStartDate = new Date();
    }
    
    // Save the updated user limit
    await userLimit.save();
    
    // Updated corresponding user subscription fields
    try {
      const user = await User.findById(userId);
      if (user) {
        user.subscription = {
          ...user.subscription,
          planId,
          status: status,
          currentPeriodEnd: finalExpiresAt ? new Date(finalExpiresAt) : null
        };
        await user.save();
      }
    } catch (userError) {
      console.error('Error updating user subscription:', userError);
      // Continue even if user update fails
    }
    
    return res.status(200).json({
      success: true,
      message: `Successfully updated user plan to ${finalPlanName}`,
      data: userLimit
    });
  } catch (error) {
    console.error('Error updating user plan:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user plan'
    });
  }
};

// Update user limit (admin)
exports.updateUserLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Only admin can update limits
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update limits'
      });
    }

    let userLimit = await UserLimit.findOne({ userId });

    if (!userLimit) {
      // Create new limit if it doesn't exist
      userLimit = await UserLimit.create({ 
        userId,
        ...updates,
        adminModified: true
      });
    } else {
      // Update existing limit
      Object.keys(updates).forEach(key => {
        if (userLimit.schema.paths[key]) {
          userLimit[key] = updates[key];
        }
      });
      
      userLimit.adminModified = true;
      await userLimit.save();
    }

    return res.status(200).json({
      success: true,
      message: 'User limit updated successfully',
      data: {
        limit: userLimit.limit,
        count: userLimit.count,
        remaining: userLimit.limit - userLimit.count,
        planId: userLimit.planId,
        planName: userLimit.planName,
        expiresAt: userLimit.expiresAt
      }
    });
  } catch (error) {
    console.error('Error updating user limit:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user limit',
      error: error.message 
    });
  }
};

// Get all user limits (Admin only)
exports.getAllUserLimits = async (req, res) => {
  try {
    // Get all user limits
    const userLimits = await UserLimit.find().sort({ updatedAt: -1 });
    
    // Get all user data to map with limits
    const User = require('../models/userModel');
    const users = await User.find({}, 'email firstName lastName name');
    
    // Create a map of userId to user details
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: user.name || ''
      };
    });
    
    // Enhance user limits with user details
    const enhancedUserLimits = userLimits.map(limit => {
      const userData = userMap[limit.userId] || {};
      return {
        ...limit.toObject(),
        userEmail: userData.email || '',
        userName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User'
      };
    });
    
    res.status(200).json({
      success: true,
      count: enhancedUserLimits.length,
      data: enhancedUserLimits
    });
  } catch (error) {
    console.error('Error fetching all user limits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user limits',
      error: error.message
    });
  }
};

// Update multiple user limits (bulk update)
exports.updateMultipleUserLimits = async (req, res) => {
  try {
    const { users } = req.body;
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users provided for update'
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each user update
    for (const user of users) {
      try {
        const { userId, planId, limit, count, expiresAt } = user;
        
        if (!userId) {
          errors.push({ userId: 'unknown', error: 'Missing userId' });
          continue;
        }
        
        let userLimit = await UserLimit.findOne({ userId });
        
        if (!userLimit) {
          // Create new limit
          userLimit = await UserLimit.create({
            userId,
            planId: planId || 'expired',
            limit: limit || PLAN_LIMITS[planId]?.limit || 0,
            count: count || 0,
            adminModified: true
          });
        } else {
          // Update existing limit
          if (planId) userLimit.planId = planId;
          if (limit !== undefined) userLimit.limit = limit;
          if (count !== undefined) userLimit.count = count;
          if (expiresAt) userLimit.expiresAt = new Date(expiresAt);
          
          userLimit.adminModified = true;
          await userLimit.save();
        }
        
        results.push({
          userId,
          success: true,
          data: {
            limit: userLimit.limit,
            count: userLimit.count,
            remaining: userLimit.limit - userLimit.count,
            planId: userLimit.planId,
            planName: userLimit.planName
          }
        });
      } catch (userError) {
        errors.push({
          userId: user.userId || 'unknown',
          error: userError.message
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `Updated ${results.length} users, ${errors.length} errors`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error updating multiple user limits:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user limits',
      error: error.message 
    });
  }
};

// Update all user limits based on criteria
exports.updateAllUserLimits = async (req, res) => {
  try {
    const { planId, resetCounts, addCredits } = req.body;
    
    if (!planId && resetCounts === undefined && addCredits === undefined) {
      return res.status(400).json({
        success: false,
        message: 'No update actions specified'
      });
    }
    
    // Build update object
    const updateObj = {};
    
    if (planId) {
      updateObj.planId = planId;
      updateObj.planName = PLAN_LIMITS[planId]?.name || planId;
      
      if (PLAN_LIMITS[planId]?.limit) {
        updateObj.limit = PLAN_LIMITS[planId].limit;
      }
      
      // Handle trial expirations
      if (planId === 'trial') {
        const trialDays = PLAN_LIMITS.trial.duration;
        const trialExpiration = new Date();
        trialExpiration.setDate(trialExpiration.getDate() + trialDays);
        updateObj.expiresAt = trialExpiration;
      }
    }
    
    // Apply the updates
    let result;
    
    if (Object.keys(updateObj).length > 0) {
      // Update all users with the same plan settings
      result = await UserLimit.updateMany({}, { $set: updateObj });
    }
    
    // Handle count resets
    if (resetCounts) {
      await UserLimit.updateMany({}, { $set: { count: 0 } });
    }
    
    // Handle credit additions
    if (addCredits && addCredits > 0) {
      // This requires more complex logic since we need to add to existing values
      const allLimits = await UserLimit.find({});
      
      for (const limit of allLimits) {
        limit.limit += addCredits;
        await limit.save();
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Updated all user limits successfully',
      data: {
        updated: result?.modifiedCount || 0,
        resetCounts: resetCounts || false,
        addCredits: addCredits || 0
      }
    });
  } catch (error) {
    console.error('Error updating all user limits:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update all user limits',
      error: error.message 
    });
  }
};

// Set user to trial plan
exports.setUserToTrialPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    
    let userLimit = await UserLimit.findOne({ userId });
    
    // Set trial expiration date (7 days from now)
    const trialExpiration = new Date();
    trialExpiration.setDate(trialExpiration.getDate() + PLAN_LIMITS.trial.duration);
    
    if (!userLimit) {
      // Create new user limit with trial plan
      userLimit = await UserLimit.create({
        userId,
        limit: PLAN_LIMITS.trial.limit,
        count: 0,
        planId: 'trial',
        planName: PLAN_LIMITS.trial.name,
        expiresAt: trialExpiration
      });
    } else {
      // Update to trial plan
      await userLimit.updatePlan({
        planId: 'trial',
        planName: PLAN_LIMITS.trial.name,
        limit: PLAN_LIMITS.trial.limit,
        expiresAt: trialExpiration
      });
      
      // Reset count to 0 when starting a trial
      userLimit.count = 0;
      await userLimit.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'User set to trial plan successfully',
      data: {
        limit: userLimit.limit,
        count: userLimit.count,
        remaining: userLimit.limit - userLimit.count,
        planId: userLimit.planId,
        planName: userLimit.planName,
        expiresAt: userLimit.expiresAt
      }
    });
  } catch (error) {
    console.error('Error setting user to trial plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set user to trial plan',
      error: error.message 
    });
  }
};

// Add billing details to user limit model
exports.updateBillingDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { billingDetails } = req.body;
    
    const userLimit = await UserLimit.findOne({ userId });

    if (!userLimit) {
      return res.status(404).json({
        success: false,
        message: 'User limit not found'
      });
    }
    
    // Update billing details
    userLimit.billingDetails = {
      ...billingDetails,
      updatedAt: new Date()
    };
    
    await userLimit.save();
    
    return res.status(200).json({
      success: true,
      data: userLimit
    });
  } catch (error) {
    console.error('Error updating billing details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update billing details'
    });
  }
}; 