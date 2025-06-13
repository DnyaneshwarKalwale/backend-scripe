const cron = require('node-cron');
const User = require('../models/userModel');
const PaymentTransaction = require('../models/paymentTransactionModel');
const UserLimit = require('../models/userLimitModel');
const Notification = require('../models/notificationModel');
const stripe = require('../config/stripe');

// Run every day at midnight
const accountDeletionJob = cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Running account deletion cron job...');

    // Find all users scheduled for deletion where the grace period has expired
    const usersToDelete = await User.find({
      accountStatus: 'pending_deletion',
      deletionScheduledAt: { $lt: new Date() }
    });

    console.log(`Found ${usersToDelete.length} users to delete`);

    for (const user of usersToDelete) {
      try {
        console.log(`Processing deletion for user: ${user._id}`);

        // Delete Stripe customer if exists
        if (stripe && user.stripeCustomerId) {
          try {
            await stripe.customers.del(user.stripeCustomerId);
            console.log(`Deleted Stripe customer for user ${user._id}`);
          } catch (error) {
            console.error(`Error deleting Stripe customer for user ${user._id}:`, error);
          }
        }

        // Delete all associated data in parallel
        await Promise.all([
          PaymentTransaction.deleteMany({ userId: user._id }),
          UserLimit.deleteMany({ userId: user._id }),
          Notification.deleteMany({ user: user._id }),
          User.deleteOne({ _id: user._id })
        ]);

        console.log(`Successfully deleted user account and associated data: ${user._id}`);
      } catch (error) {
        console.error(`Error deleting user ${user._id}:`, error);
        
        // Mark the user as having a failed deletion attempt
        try {
          await User.findByIdAndUpdate(user._id, {
            $set: {
              accountStatus: 'deletion_failed',
              deletionError: error.message
            }
          });
        } catch (updateError) {
          console.error(`Error updating user status for failed deletion ${user._id}:`, updateError);
        }
      }
    }

    console.log('Account deletion cron job completed');
  } catch (error) {
    console.error('Error in account deletion cron job:', error);
  }
});

module.exports = accountDeletionJob; 