const express = require('express');
const path = require('path');
const { errorHandler } = require('./middleware/errorMiddleware');
const userRoutes = require('./routes/userRoutes');
const carouselRoutes = require('./routes/carouselRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { connectDB } = require('./config/db');

// Set up Express app
const app = express();

// Connect to database susss
connectDB();

// Standard middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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