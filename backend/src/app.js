const express = require('express');
const cors = require('cors');
const path = require('path');
const { errorHandler, corsHandler } = require('./middleware/errorMiddleware');
const userRoutes = require('./routes/userRoutes');
const carouselRoutes = require('./routes/carouselRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { connectDB } = require('./config/db');

// Set up Express app
const app = express();

// Connect to database susss
connectDB();

// CORS Configuration - only allow production frontend
const corsOptions = {
  origin: 'https://app.brandout.ai',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Apply CORS before other middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Additional CORS error handling
app.use(corsHandler);

// Special handling for Stripe webhook route to access raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

// Add middleware to expose the raw body for signature verification
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    req.rawBody = req.body;
  }
  next();
});

// Standard middleware for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Ensure uploads directory exists
const fs = require('fs');
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/carousels', carouselRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/payments', paymentRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// Error handler middleware
app.use(errorHandler); 

module.exports = app; 