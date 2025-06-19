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
const linkedinRoutes = require('./src/routes/linkedinRoutes');
const youtubeRoutes = require('./src/routes/youtubeRoutes');
const rateLimit = require('express-rate-limit');
const apicache = require('apicache');
const compression = require('compression');
const helmet = require('helmet');

// Load env variables
dotenv.config();

// Initialize express app
const app = express();

// Security middleware
app.use(helmet());

// Enable compression
app.use(compression());

// Initialize cache
const cache = apicache.middleware;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all routes
app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:8080', 'https://brandout.ai']
    : ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Cache successful GET requests for 5 minutes
app.use(cache('5 minutes', (req, res) => {
  // Only cache GET requests
  return req.method === 'GET';
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-limits', userLimitRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/twitter', twitterRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/youtube', youtubeRoutes);

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