const {
  createWelcomeNotification,
  createTrialReminderNotification,
  createLimitAlertNotification,
  createCarouselStatusNotification
} = require('../controllers/notificationController');
const UserLimit = require('../models/userLimitModel');
const User = require('../models/userModel');

/**
 * Triggers notifications based on user events/actions
 */
const notificationHelper = {
  /**
   * Check for users on trial plan and send reminder notifications
   * Intended to be called by a daily cron job
   */
  async sendTrialReminders() {
    try {
      // Find trial users who haven't been reminded
      const trialUsers = await UserLimit.find({
        planId: 'trial',
        expiresAt: { $exists: true, $ne: null }
      });
      
      let count = 0;
      
      for (const userLimit of trialUsers) {
        const now = new Date();
        const expiresAt = new Date(userLimit.expiresAt);
        
        // Calculate days until expiration
        const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        
        // Send notifications at specific intervals
        if (daysLeft === 1 || daysLeft === 3 || daysLeft === 7) {
          await createTrialReminderNotification(userLimit.userId, daysLeft);
          count++;
        }
      }
      
      console.log(`Sent ${count} trial reminder notifications`);
      return count;
    } catch (error) {
      console.error('Error sending trial reminders:', error);
      return 0;
    }
  },
  
  /**
   * Send welcome notification to new user
   * @param {string} userId - ID of new user
   */
  async sendWelcomeNotification(userId) {
    try {
      const notification = await createWelcomeNotification(userId);
      return notification;
    } catch (error) {
      console.error('Error sending welcome notification:', error);
      return null;
    }
  },
  
  /**
   * Check limits and send alert when approaching usage limits
   * @param {string} userId - User ID to check
   * @param {string} limitType - Type of limit (carousel, content)
   */
  async checkAndSendLimitAlert(userId) {
    try {
      const userLimit = await UserLimit.findOne({ userId });
      if (!userLimit || !userLimit.limit) {
        return null;
      }
      
      const used = userLimit.count || 0;
      const total = userLimit.limit || 0;
      
      // Only notify if there's significant usage
      if (used < 1 || total < 1) {
        return null;
      }
      
      // Calculate percentage used
      const percentUsed = Math.round((used / total) * 100);
      
      // Only send at 80% and 95% thresholds
      if (percentUsed === 80 || percentUsed === 95) {
        const notification = await createLimitAlertNotification(
          userId,
          'general', // Generic limit type
          used,
          total
        );
        return notification;
      }
      
      return null;
    } catch (error) {
      console.error('Error checking limit alert:', error);
      return null;
    }
  },
  
  /**
   * Send carousel status update notification
   * @param {string} userId - User ID
   * @param {string} requestId - Carousel request ID
   * @param {string} status - Status (pending, processing, completed)
   * @param {string} title - Carousel title
   */
  async sendCarouselStatusUpdate(userId, requestId, status, title) {
    try {
      const notification = await createCarouselStatusNotification(
        userId,
        requestId,
        status,
        title
      );
      return notification;
    } catch (error) {
      console.error('Error sending carousel status update:', error);
      return null;
    }
  },
  
  /**
   * Send inactivity reminder to users who haven't created content
   * Intended to be called by a weekly cron job
   */
  async sendInactivityReminders() {
    try {
      // Find users who haven't been active in the last 10 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      
      // Find users who registered more than 10 days ago but haven't created content
      // or haven't been active in the last 10 days
      const inactiveUsers = await User.find({
        createdAt: { $lt: tenDaysAgo },
        $or: [
          { lastActive: { $lt: tenDaysAgo } },
          { lastActive: { $exists: false } }
        ],
        // Skip users who already received inactivity notification recently
        lastNotified: { $lt: thirtyDaysAgo }
      }).limit(50); // Process in batches to avoid overloading
      
      let count = 0;
      
      for (const user of inactiveUsers) {
        try {
          // Create notification for each inactive user
          const notification = await Notification.create({
            userId: user._id,
            title: 'Ready to create amazing content?',
            message: 'We noticed you haven\'t created content recently. Come back and try our AI-powered content generation tools to enhance your LinkedIn presence!',
            type: 'general',
            link: '/dashboard',
            sendEmail: true
          });
          
          // Send email
          if (user.email) {
            try {
              await sendEmail({
                email: user.email,
                subject: 'Ready to create amazing content?',
                message: `Hi ${user.name || 'there'},\n\nWe've missed you! It's been a while since you created content with Scripe.\n\nCome back and try our AI-powered tools to enhance your LinkedIn presence. It only takes a few minutes to create engaging posts and carousels.\n\nBest regards,\nThe Scripe Team`
              });
              
              notification.emailSent = true;
              await notification.save();
            } catch (emailError) {
              console.error('Error sending inactivity email:', emailError);
            }
          }
          
          // Update user's lastNotified timestamp
          user.lastNotified = new Date();
          await user.save();
          
          count++;
        } catch (userError) {
          console.error(`Error sending inactivity reminder to user ${user._id}:`, userError);
        }
      }
      
      console.log(`Sent ${count} inactivity reminder notifications`);
      return count;
    } catch (error) {
      console.error('Error sending inactivity reminders:', error);
      return 0;
    }
  }
};

module.exports = notificationHelper; 