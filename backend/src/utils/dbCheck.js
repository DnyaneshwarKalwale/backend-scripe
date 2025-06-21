const mongoose = require('mongoose');

/**
 * Checks if MongoDB connection is available
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
const checkMongoConnection = async () => {
  try {
    // Check if we're already connected
    if (mongoose.connection.readyState === 1) {
      return true;
    }
    
    // Try connecting to the database
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 2000, // 2 seconds timeout
    });
    
    // Disconnect after check
    await mongoose.disconnect();
    return true;
  } catch (error) {
    console.error('MongoDB connection check failed:', error.message);
    return false;
  }
};

module.exports = { checkMongoConnection }; 