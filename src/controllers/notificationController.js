const asyncHandler = require('express-async-handler');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const UserLimit = require('../models/userLimitModel');
const sendEmail = require('../utils/sendEmail');

// @desc    Get all notifications for a user
// @route   GET /api/notifications
// @access  Private
const getUserNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const type = req.query.type || null;
  const unreadOnly = req.query.unreadOnly === 'true';

  // Build query conditions
  const userSpecificQuery = { userId: req.user.id };
  const broadcastQuery = { 
    'metadata.isBroadcast': true,
    $or: [
      // Include if user is in recipients array
      { 'metadata.recipients': { $in: [req.user.id] } },
      // Or if created after user joined (for older broadcast notifications without explicit recipients)
      { 'createdAt': { $gt: req.user.createdAt } }
    ]
  };
  const multiRecipientQuery = {
    'metadata.isMultiRecipient': true,
    'metadata.recipients': { $in: [req.user.id] }
  };
  
  // Apply type filter if provided
  if (type) {
    userSpecificQuery.type = type;
    broadcastQuery.type = type;
    multiRecipientQuery.type = type;
  }
  
  // Apply read filter if requested
  if (unreadOnly) {
    userSpecificQuery.read = false;
    broadcastQuery.read = false;
    multiRecipientQuery.read = false;
  }

  // Combine queries with OR operator
  const query = {
    $or: [
      userSpecificQuery,
      broadcastQuery,
      multiRecipientQuery
    ]
  };

  // Get total count for pagination
  const total = await Notification.countDocuments(query);
  
  // Get notifications with complex query
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Process the notifications to ensure they have the right context for this user
  const processedNotifications = notifications.map(notification => {
    const notifObj = notification.toJSON();
    
    // If it's a broadcast notification, set the userId to the current user
    if (notifObj.metadata && (notifObj.metadata.isBroadcast || notifObj.metadata.isMultiRecipient)) {
      notifObj.userId = req.user.id;
    }
    
    return notifObj;
  });

  // Count unread notifications (including broadcasts)
  const unreadCount = await Notification.countDocuments({ 
    $or: [
      { userId: req.user.id, read: false },
      { 'metadata.isBroadcast': true, 'metadata.recipients': { $in: [req.user.id] }, read: false },
      { 'metadata.isMultiRecipient': true, 'metadata.recipients': { $in: [req.user.id] }, read: false }
    ]
  });

  res.status(200).json({
    success: true,
    data: {
      notifications: processedNotifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check if this is a broadcast notification
  const isBroadcast = notification.metadata && notification.metadata.isBroadcast;
  const isMultiRecipient = notification.metadata && notification.metadata.isMultiRecipient;
  
  // For broadcast notifications, check if user is in recipients
  if (isBroadcast || isMultiRecipient) {
    const recipients = notification.metadata.recipients || [];
    const isRecipient = recipients.some(id => id.toString() === req.user.id);
    
    if (!isRecipient) {
      res.status(401);
      throw new Error('Not authorized to access this notification');
    }
    
    // For broadcast notifications, we need to create a read receipt instead of modifying the notification
    // Create a read receipt entry in a separate collection or update the notification's metadata
    if (!notification.metadata.readBy) {
      notification.metadata.readBy = [];
    }
    
    // Add user to readBy array if not already there
    if (!notification.metadata.readBy.includes(req.user.id)) {
      notification.metadata.readBy.push(req.user.id);
      await notification.save();
    }
    
    // Return success with a modified notification object for this user
    const userNotification = notification.toJSON();
    userNotification.read = true; // Mark as read for this user's view
    userNotification.userId = req.user.id; // Set userId to this user
    
    return res.status(200).json({
      success: true,
      data: userNotification
    });
  }
  
  // For regular notifications, check if it belongs to user
  if (notification.userId.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to access this notification');
  }

  // Update regular notification
  notification.read = true;
  await notification.save();

  res.status(200).json({
    success: true,
    data: notification
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  // Mark all direct notifications as read
  await Notification.updateMany(
    { userId: req.user.id, read: false },
    { read: true }
  );

  // Find all broadcast notifications that haven't been read by this user
  const broadcastNotifications = await Notification.find({
    $or: [
      { 'metadata.isBroadcast': true, 'metadata.recipients': { $in: [req.user.id] } },
      { 'metadata.isMultiRecipient': true, 'metadata.recipients': { $in: [req.user.id] } }
    ]
  });

  // Mark each broadcast notification as read by this user
  for (const notification of broadcastNotifications) {
    if (!notification.metadata.readBy) {
      notification.metadata.readBy = [];
    }
    
    if (!notification.metadata.readBy.includes(req.user.id)) {
      notification.metadata.readBy.push(req.user.id);
      await notification.save();
    }
  }

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read'
  });
});

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check if notification belongs to user
  if (notification.userId.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to delete this notification');
  }

  await notification.remove();

  res.status(200).json({
    success: true,
    message: 'Notification deleted'
  });
});

// ADMIN CONTROLLER FUNCTIONS

// @desc    Create notification for specific user or all users
// @route   POST /api/admin/notifications
// @access  Private/Admin
const createNotification = asyncHandler(async (req, res) => {
  const { 
    userId, 
    userIds,
    title, 
    message, 
    type = 'general', 
    sendToAll = false,
    link = null,
    sendEmail = false,
    imageUrl = null,
    organizationLogo = null,
    organizationName = null
  } = req.body;

  // Validate required fields
  if (!title || !message) {
    res.status(400);
    throw new Error('Title and message are required');
  }

  // If sending to all, get all active users
  if (sendToAll) {
    // Changed to get ALL users, not just active ones
    const users = await User.find({}).select('_id email');
    
    console.log(`Found ${users.length} users to send notifications to`);
    
    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users found to send notification to',
        data: 0
      });
    }

    // Create a single notification with a recipients array instead of individual notifications
    const notificationData = {
      userId: null, // Will be set per recipient when displayed
      title,
      message,
      type,
      link,
      sendEmail,
      imageUrl,
      organizationLogo,
      organizationName,
      // Store recipients list as metadata
      metadata: {
        isBroadcast: true,
        recipientCount: users.length,
        recipients: users.map(user => user._id)
      }
    };
    
    console.log(`Creating broadcast notification for ${users.length} users`);
    
    // Create a single broadcast notification
    const broadcastNotification = await Notification.create(notificationData);
    
    console.log(`Created notification: ${broadcastNotification._id}`);
    
    // Track email sending success
    let emailsSent = 0;
    
    // Send emails if requested
    if (sendEmail) {
      for (const user of users) {
        if (user.email) {
          try {
            await sendEmail({
              email: user.email,
              subject: title,
              message
            });
            emailsSent++;
          } catch (error) {
            console.error(`Error sending email to ${user.email}:`, error);
          }
        }
      }
      
      // Update notification to reflect emails sent
      broadcastNotification.emailSent = emailsSent > 0;
      broadcastNotification.metadata.emailsSent = emailsSent;
      await broadcastNotification.save();
    }
    
    return res.status(201).json({
      success: true,
      message: `Notification created for ${users.length} users`,
      data: users.length,
      emails: emailsSent,
      notification: broadcastNotification
    });
  } 
  // If userIds array is provided (multiple specific users)
  else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
    // Create a single notification with recipients metadata
    const notificationData = {
      userId: userIds[0], // Use first user as primary
      title,
      message,
      type,
      link,
      sendEmail,
      imageUrl,
      organizationLogo,
      organizationName,
      // Store all recipients
      metadata: {
        isMultiRecipient: true,
        recipientCount: userIds.length,
        recipients: userIds
      }
    };
    
    const multiNotification = await Notification.create(notificationData);
    
    // Track email sending success
    let emailsSent = 0;
    
    // Send emails if requested
    if (sendEmail) {
      for (const id of userIds) {
        const user = await User.findById(id).select('email');
        if (user && user.email) {
          try {
            await sendEmail({
              email: user.email,
              subject: title,
              message
            });
            emailsSent++;
          } catch (error) {
            console.error(`Error sending email to user ${id}:`, error);
          }
        }
      }
      
      // Update notification to reflect emails sent
      multiNotification.emailSent = emailsSent > 0;
      multiNotification.metadata.emailsSent = emailsSent;
      await multiNotification.save();
    }
    
    return res.status(201).json({
      success: true,
      message: `Notification created for ${userIds.length} users`,
      data: userIds.length,
      emails: emailsSent,
      notification: multiNotification
    });
  }
  // Single user notification
  else {
    // Validate userId if not sending to all or multiple users
    if (!userId) {
      res.status(400);
      throw new Error('User ID is required when sending to a specific user');
    }
    
    // Create notification for specific user
    const notificationData = {
      userId,
      title,
      message,
      type,
      link,
      sendEmail,
      imageUrl,
      organizationLogo,
      organizationName
    };
    
    const notification = await Notification.create(notificationData);
    
    // Send email if requested
    let emailSent = false;
    if (sendEmail) {
      const user = await User.findById(userId).select('email');
      if (user && user.email) {
        try {
          await sendEmail({
            email: user.email,
            subject: title,
            message
          });
          
          // Update notification to mark email as sent
          notification.emailSent = true;
          await notification.save();
          emailSent = true;
        } catch (error) {
          console.error('Error sending email:', error);
        }
      }
    }
    
    return res.status(201).json({
      success: true,
      data: 1,
      emails: emailSent ? 1 : 0,
      notification
    });
  }
});

// @desc    Get all notifications (admin view)
// @route   GET /api/admin/notifications
// @access  Private/Admin
const getAllNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const type = req.query.type || null;
  const userId = req.query.userId || null;

  // Build query
  const query = {};
  
  if (type) {
    query.type = type;
  }
  
  if (userId) {
    query.userId = userId;
  }

  // Get total count for pagination
  const total = await Notification.countDocuments(query);
  
  // Get notifications
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'name email');

  // Process notifications to add context about broadcast and multi-recipient notifications
  const processedNotifications = notifications.map(notification => {
    const notif = notification.toJSON();
    
    // Add recipient info for broadcast notifications
    if (notif.metadata && notif.metadata.isBroadcast) {
      notif.recipientCount = notif.metadata.recipientCount || 0;
      notif.isBroadcast = true;
    }
    
    // Add recipient info for multi-recipient notifications
    if (notif.metadata && notif.metadata.isMultiRecipient) {
      notif.recipientCount = notif.metadata.recipientCount || 0;
      notif.isMultiRecipient = true;
    }
    
    return notif;
  });

  res.status(200).json({
    success: true,
    data: {
      notifications: processedNotifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// UTILITY FUNCTIONS FOR SYSTEM NOTIFICATIONS

// Create welcome notification for new user
const createWelcomeNotification = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;
    
    const notification = await Notification.create({
      userId,
      title: 'Welcome to Scripe!',
      message: `Welcome ${user.name || 'there'}! We're excited to have you on board. Start creating amazing content with AI today.`,
      type: 'welcome',
      link: '/dashboard',
      sendEmail: true
    });
    
    // Send email
    if (user.email) {
      try {
        await sendEmail({
          email: user.email,
          subject: 'Welcome to Scripe!',
          message: `Hi ${user.name || 'there'},\n\nWelcome to Scripe! We're excited to have you on board.\n\nGet started by creating your first AI-generated content. Just upload a YouTube video, and we'll help you create engaging LinkedIn posts and carousels.\n\nBest regards,\nThe Scripe Team`
        });
        
        notification.emailSent = true;
        await notification.save();
      } catch (error) {
        console.error('Error sending welcome email:', error);
      }
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating welcome notification:', error);
    return null;
  }
};

// Create subscription notification for trial reminder
const createTrialReminderNotification = async (userId, daysLeft) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;
    
    const title = daysLeft <= 1 
      ? 'Your trial ends today!' 
      : `${daysLeft} days left in your trial`;
    
    const message = daysLeft <= 1
      ? 'Your trial period is ending today. Upgrade now to continue enjoying premium features!'
      : `Your trial will end in ${daysLeft} days. Upgrade your plan to continue enjoying premium features.`;
    
    const notification = await Notification.create({
      userId,
      title,
      message,
      type: 'subscription',
      link: '/settings/billing',
      sendEmail: true
    });
    
    // Send email
    if (user.email) {
      try {
        await sendEmail({
          email: user.email,
          subject: title,
          message: `Hi ${user.name || 'there'},\n\n${message}\n\nUpgrade your subscription to continue creating amazing content with Scripe.\n\nBest regards,\nThe Scripe Team`
        });
        
        notification.emailSent = true;
        await notification.save();
      } catch (error) {
        console.error('Error sending trial reminder email:', error);
      }
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating trial reminder notification:', error);
    return null;
  }
};

// Create limit notification when user is close to limits
const createLimitAlertNotification = async (userId, limitType, used, total) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;
    
    const percentUsed = Math.round((used / total) * 100);
    
    // Only notify at 80% and 95% usage
    if (percentUsed !== 80 && percentUsed !== 95) {
      return null;
    }
    
    const limitName = limitType === 'carousel' ? 'carousel creations' : 'content generations';
    
    const title = `You've used ${percentUsed}% of your ${limitName}`;
    const message = percentUsed === 95
      ? `You're almost out of ${limitName}! You've used ${used} out of ${total}. Upgrade your plan to get more.`
      : `You've used ${used} out of ${total} ${limitName} this month. Consider upgrading your plan for more.`;
    
    const notification = await Notification.create({
      userId,
      title,
      message,
      type: 'limit',
      link: '/settings/billing',
      sendEmail: percentUsed === 95 // Only send email at 95%
    });
    
    // Send email if at 95%
    if (percentUsed === 95 && user.email) {
      try {
        await sendEmail({
          email: user.email,
          subject: title,
          message: `Hi ${user.name || 'there'},\n\n${message}\n\nUpgrade your subscription to get more ${limitName}.\n\nBest regards,\nThe Scripe Team`
        });
        
        notification.emailSent = true;
        await notification.save();
      } catch (error) {
        console.error('Error sending limit alert email:', error);
      }
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating limit alert notification:', error);
    return null;
  }
};

// Create carousel request status notification
const createCarouselStatusNotification = async (userId, requestId, status, title) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;
    
    let message = '';
    let notificationTitle = '';
    
    switch (status) {
      case 'pending':
        notificationTitle = 'Carousel Request Received';
        message = 'Your carousel request has been received and is queued for processing. We\'ll notify you once it\'s ready!';
        break;
      case 'processing':
        notificationTitle = 'Carousel Being Created';
        message = 'Great news! Your carousel request is now being processed. It should be ready within the next few hours.';
        break;
      case 'completed':
        notificationTitle = 'Your Carousel is Ready!';
        message = `Your carousel "${title}" is now ready! Check it out and start sharing your content.`;
        break;
      default:
        notificationTitle = 'Carousel Request Update';
        message = 'There\'s an update to your carousel request. Check your dashboard for details.';
    }
    
    const notification = await Notification.create({
      userId,
      title: notificationTitle,
      message,
      type: 'carousel',
      link: `/carousel/${requestId}`,
      sendEmail: status === 'completed' // Only send email when completed
    });
    
    // Send email when completed
    if (status === 'completed' && user.email) {
      try {
        await sendEmail({
          email: user.email,
          subject: notificationTitle,
          message: `Hi ${user.name || 'there'},\n\n${message}\n\nView your carousel now on your dashboard.\n\nBest regards,\nThe Scripe Team`
        });
        
        notification.emailSent = true;
        await notification.save();
      } catch (error) {
        console.error('Error sending carousel status email:', error);
      }
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating carousel status notification:', error);
    return null;
  }
};

module.exports = {
  // User notification routes
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  
  // Admin notification routes
  createNotification,
  getAllNotifications,
  
  // Utility functions
  createWelcomeNotification,
  createTrialReminderNotification,
  createLimitAlertNotification,
  createCarouselStatusNotification
}; 