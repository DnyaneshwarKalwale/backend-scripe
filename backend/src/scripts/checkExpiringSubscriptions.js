const mongoose = require('mongoose');
const dotenv = require('dotenv');
const UserLimit = require('../models/userLimitModel');
const Notification = require('../models/notificationModel');

// Load env variables
dotenv.config();

// Connect to database
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/scripe')
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// Check for subscriptions expiring in the next 7 days
const checkExpiringSubscriptions = async () => {
  try {
    // Calculate dates for the next 7 days
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);
    
    // Find all subscriptions expiring in the next 7 days
    const expiringSubscriptions = await UserLimit.find({
      status: 'active',
      expiresAt: { 
        $gte: now,  // Expires after today
        $lte: sevenDaysFromNow  // But before or on 7 days from now
      }
    });
    
    console.log(`Found ${expiringSubscriptions.length} subscriptions expiring in the next 7 days`);
    
    // For each expiring subscription, create a notification
    for (const subscription of expiringSubscriptions) {
      // Calculate days until expiration
      const daysUntilExpiry = Math.ceil((subscription.expiresAt - now) / (1000 * 60 * 60 * 24));
      
      // Check if user has auto-pay enabled
      const autoPayMessage = subscription.autoPay 
        ? "Your subscription will automatically renew"
        : "Please renew your subscription to avoid service interruption";
      
      // Create different notification texts based on days remaining
      let notificationTitle, notificationMessage, notificationType;
      
      if (daysUntilExpiry <= 1) {
        notificationTitle = 'Your subscription expires tomorrow!';
        notificationType = 'subscription';
      } else {
        notificationTitle = `${daysUntilExpiry} days left in your ${subscription.planName} plan`;
        notificationType = 'subscription';
      }
      
      notificationMessage = `Your ${subscription.planName} plan will expire in ${daysUntilExpiry} days. ${autoPayMessage}.`;
      
      // Check if a similar notification was sent in the last 24 hours to avoid duplicates
      const existingNotification = await Notification.findOne({
        userId: subscription.userId,
        type: 'subscription',
        title: { $regex: 'days left|expires tomorrow', $options: 'i' },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      if (!existingNotification) {
        // Create notification for user
        await Notification.create({
          userId: subscription.userId,
          title: notificationTitle,
          message: notificationMessage,
          type: notificationType,
          link: '/dashboard/billing',
          read: false,
          createdAt: new Date()
        });
        
        console.log(`Created expiration notification for user ${subscription.userId}`);
      } else {
        console.log(`Skipped notification for user ${subscription.userId} - recent notification exists`);
      }
    }
    
    console.log('Subscription expiry check completed successfully!');
  } catch (error) {
    console.error('Error checking expiring subscriptions:', error);
  } finally {
    mongoose.disconnect();
  }
};

// Run the function
checkExpiringSubscriptions(); 