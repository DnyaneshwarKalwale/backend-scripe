const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const userRoutes = require('./src/routes/userRoutes');
const authRoutes = require('./src/routes/authRoutes');
const userLimitRoutes = require('./src/routes/userLimitRoutes');
const stripeRoutes = require('./src/routes/stripeRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const adminNotificationRoutes = require('./src/routes/adminNotificationRoutes');
const twitterRoutes = require('./src/routes/twitterRoutes');

// Load env variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-limits', userLimitRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/twitter', twitterRoutes);

// Schedule subscription check job to run at midnight every day
cron.schedule('0 0 * * *', () => {
  console.log('Running subscription expiry check...');
  const scriptPath = path.join(__dirname, 'src/scripts/checkExpiringSubscriptions.js');
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running subscription check: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Subscription check stderr: ${stderr}`);
      return;
    }
    console.log(`Subscription check completed: ${stdout}`);
  });
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/scripe')
  .then(() => {
    console.log('MongoDB connected...');
    
    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }); 