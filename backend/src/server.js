const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
const session = require('express-session');
const { errorHandler } = require('./middleware/errorMiddleware');
const { checkMongoConnection } = require('./utils/dbCheck');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const teamRoutes = require('./routes/teamRoutes');
const linkedinRoutes = require('./routes/linkedinRoutes');
const twitterRoutes = require('./routes/twitterRoutes');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure CORS with more options
app.use(cors({
  origin: [
    'http://localhost:8080', 
    'http://localhost:8081', 
    'https://ea50-43-224-158-115.ngrok-free.app',
    'https://18cd-43-224-158-115.ngrok-free.app',
    'https://deluxe-cassata-51d628.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept-Language'],
  exposedHeaders: ['Set-Cookie']
}));

// Configure session middleware with MongoDB store for production
if (process.env.NODE_ENV === 'production') {
  try {
    const MongoStore = require('connect-mongo');
    app.use(session({
      secret: process.env.JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
      }),
      cookie: { 
        secure: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'none' // Required for cross-domain cookies
      }
    }));
    console.log('Using MongoDB session store for production');
  } catch (error) {
    console.warn('⚠️ connect-mongo not available, falling back to memory store (not recommended for production)');
    console.warn('Please run: npm install connect-mongo --save');
    
    app.use(session({
      secret: process.env.JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: false, // Can't use secure cookies without HTTPS
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
      }
    }));
  }
} else {
  // Use simple memory store for development
  app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true
    }
  }));
  console.log('Using memory session store for development');
}

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Passport session setup
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const User = require('./models/userModel');
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

require('./config/passport')(passport);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/twitter', twitterRoutes);

// Health check route
app.get('/health', async (req, res) => {
  const dbConnected = await checkMongoConnection();
  
  res.status(200).json({ 
    status: 'OK', 
    message: 'Lovable API is running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Root route to confirm server is running
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Scripe API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Error handler middleware
app.use(errorHandler);

// Start server - Make sure to bind to 0.0.0.0 for Render
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
}); 