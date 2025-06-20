const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');

// Load env variables
dotenv.config();

// Connect to database
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/scripe')
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define example notifications
const createSeedNotifications = async () => {
  try {
    // Find all users 
    const users = await User.find({}).select('_id');
    
    if (users.length === 0) {
      console.log('No users found. Please create users first.');
      return;
    }
    
    // Create notifications for each user
    for (const user of users) {
      const userId = user._id;
      
      // Welcome notification
      await Notification.create({
        userId,
        title: 'Welcome to BrandOut!',
        message: 'We're excited to have you on board! Start creating amazing content with AI today.',
        type: 'welcome',
        link: '/dashboard/home',
        read: false,
        createdAt: new Date()
      });
      
      // Subscription notification
      await Notification.create({
        userId,
        title: '7 days left in your trial',
        message: 'Your trial will end in 7 days. Upgrade your plan to continue enjoying premium features and avoid any interruption in service.',
        type: 'subscription',
        link: '/dashboard/billing',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
      });
      
      // Usage limits notification
      await Notification.create({
        userId,
        title: 'You\'ve used 80% of your content credits',
        message: 'You\'ve used 80% of your content generation credits for this month. Consider upgrading your plan for more credits.',
        type: 'limit',
        link: '/dashboard/billing',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) // 2 days ago
      });
      
      // Carousel update notification
      await Notification.create({
        userId,
        title: 'Your Carousel is Ready!',
        message: 'Your carousel "LinkedIn Growth Strategies" is now ready! Check it out and start sharing your content.',
        type: 'carousel',
        link: '/dashboard/carousels',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) // 3 days ago
      });
      
      console.log(`Created notifications for user ${userId}`);
    }
    
    console.log('Seed notifications created successfully!');
  } catch (error) {
    console.error('Error creating seed notifications:', error);
  } finally {
    mongoose.disconnect();
  }
};

// Run the seed function
createSeedNotifications(); 