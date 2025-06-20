const express = require('express');
const path = require('path');
const { errorHandler } = require('./middleware/errorMiddleware');
const connectDB = require('./config/db');

// Connect to database
connectDB();

const app = express();

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Special handling for Stripe webhook route to access raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/youtube', require('./routes/youtubeRoutes'));
app.use('/api/twitter', require('./routes/twitterRoutes'));
app.use('/api/linkedin', require('./routes/linkedinRoutes'));
app.use('/api/carousel', require('./routes/carouselRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/stripe', require('./routes/stripeRoutes'));
app.use('/api/user-limits', require('./routes/userLimitsRoutes'));
app.use('/api/carousel-contents', require('./routes/carouselContentRoutes'));
app.use('/api/carousel-requests', require('./routes/carouselRequestRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin-notifications', require('./routes/adminNotificationRoutes'));

// Error handler
app.use(errorHandler);

module.exports = app; 