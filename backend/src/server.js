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
    'http://localhost:3000',  
    'https://ea50-43-224-158-115.ngrok-free.app',
    'https://18cd-43-224-158-115.ngrok-free.app',
    'https://deluxe-cassata-51d628.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept-Language', 'Origin', 'Accept'],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add a middleware to handle redirects
app.use((req, res, next) => {
  // Store the original redirect method to wrap it
  const originalRedirect = res.redirect;
  
  // Override the redirect method
  res.redirect = function(url) {
    console.log('Redirecting to:', url);
    
    // Validate the URL - make sure we're only redirecting to known valid frontend routes
    try {
      const frontendUrl = process.env.FRONTEND_URL.trim();
      const urlObj = new URL(url);
      
      // Check if this is a frontend URL
      if (urlObj.href.startsWith(frontendUrl)) {
        const path = urlObj.pathname;
        
        // List of valid frontend paths
        const validPaths = [
          '/login',
          '/auth/social-callback',
          '/dashboard',
          '/onboarding',
          '/onboarding/welcome'
        ];
        
        // Check if the path is valid or is a subpath of a valid path
        const isValidPath = validPaths.some(validPath => 
          path === validPath || path.startsWith(`${validPath}/`)
        );
        
        // If invalid, redirect to the homepage instead
        if (!isValidPath) {
          console.warn(`Redirect to invalid path '${path}', redirecting to homepage instead`);
          url = frontendUrl;
        }
      }
    } catch (e) {
      console.error('Error validating redirect URL:', e);
      // If there's an error parsing the URL, continue with the original redirect
    }
    
    // Call the original redirect method
    originalRedirect.call(this, url);
  };
  
  next();
});

// Configure session middleware (required for Twitter OAuth)
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to false for both HTTP and HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

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

// Error handler middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 