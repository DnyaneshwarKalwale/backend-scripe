const UserLimit = require('../models/userLimitModel');
const User = require('../models/userModel');
const { isAdmin } = require('../middleware/authMiddleware');

// Get user's limit
exports.getUserLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      return res.status(404).json({ message: 'User limit not found' });
    }
    
    res.status(200).json(userLimit);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user limit', error: error.message });
  }
};

// Increment user's count
exports.incrementUserCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      return res.status(404).json({ message: 'User limit not found' });
    }
    
    if (userLimit.count >= userLimit.limit) {
      return res.status(400).json({ message: 'User has reached their limit' });
    }
    
    userLimit.count += 1;
    await userLimit.save();
    
    res.status(200).json(userLimit);
  } catch (error) {
    res.status(500).json({ message: 'Error incrementing user count', error: error.message });
  }
};

// Update user's limit (Admin only)
exports.updateUserLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit } = req.body;
    
    if (!limit || limit < 0) {
      return res.status(400).json({ message: 'Invalid limit value' });
    }
    
    const userLimit = await UserLimit.findOneAndUpdate(
      { userId },
      { limit },
      { new: true, upsert: true }
    );
    
    res.status(200).json(userLimit);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user limit', error: error.message });
  }
};

// Update multiple users' limits (Admin only)
exports.updateMultipleUserLimits = async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: 'Updates must be an array' });
    }
    
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { userId: update.userId },
        update: { limit: update.limit },
        upsert: true
      }
    }));
    
    await UserLimit.bulkWrite(bulkOps);
    
    const updatedLimits = await UserLimit.find({
      userId: { $in: updates.map(u => u.userId) }
    });
    
    res.status(200).json(updatedLimits);
  } catch (error) {
    res.status(500).json({ message: 'Error updating multiple user limits', error: error.message });
  }
};

// Update all users' limits (Admin only)
exports.updateAllUserLimits = async (req, res) => {
  try {
    const { limit } = req.body;
    
    if (!limit || limit < 0) {
      return res.status(400).json({ message: 'Invalid limit value' });
    }
    
    await UserLimit.updateMany({}, { limit });
    
    const updatedLimits = await UserLimit.find();
    res.status(200).json(updatedLimits);
  } catch (error) {
    res.status(500).json({ message: 'Error updating all user limits', error: error.message });
  }
};

// Get all user limits (Admin only)
exports.getAllUserLimits = async (req, res) => {
  try {
    const userLimits = await UserLimit.find();
    
    // Get all user IDs from the limits
    const userIds = userLimits.map(limit => limit.userId);
    
    // Fetch all users in one query
    const users = await User.find({ _id: { $in: userIds } }, 'firstName lastName email');
    
    // Create a map of user data for quick lookup
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      };
      return acc;
    }, {});
    
    // Combine user data with limits
    const userLimitsWithData = userLimits.map(limit => ({
      ...limit.toObject(),
      user: userMap[limit.userId] || {
        firstName: 'Unknown',
        lastName: 'User',
        email: 'N/A'
      }
    }));
    
    res.status(200).json({
      success: true,
      data: userLimitsWithData
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error fetching all user limits', 
      error: error.message 
    });
  }
};

// Get current user's limit
exports.getCurrentUserLimit = async (req, res) => {
  try {
    const userId = req.user._id; // Get user ID from the authenticated request
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      // If no limit exists, create a default one
      const defaultLimit = new UserLimit({
        userId,
        limit: 10, // Default limit
        count: 0
      });
      await defaultLimit.save();
      return res.status(200).json(defaultLimit);
    }
    
    res.status(200).json(userLimit);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user limit', error: error.message });
  }
}; 