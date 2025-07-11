const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const linkedinController = require('../controllers/linkedinController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up storage for image uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Serve uploaded files statically
router.use('/uploads', express.static(uploadsDir));

// Get current user's LinkedIn profile
router.get('/profile', protect, linkedinController.getLinkedInProfile);

// Get user's posts
router.get('/posts', protect, linkedinController.getUserPosts);

// Analytics route removed - requires additional API permissions

// Create a post
router.post('/post', [
  protect,
  check('postContent', 'Post content is required').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  linkedinController.createLinkedInPost(req, res);
});

// Upload image endpoint
router.post('/upload', protect, (req, res, next) => {
  const uploadMiddleware = upload.single('image');
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Error uploading image:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.message || 'Error uploading image',
        details: err.code === 'LIMIT_FILE_SIZE' ? 'File size should be less than 5MB' : err.message 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    // Return the file path that can be accessed from the client
    const filePath = `uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
    
    res.json({ 
      success: true,
      message: 'Image uploaded successfully',
      filePath: filePath,
      fullUrl: fullUrl,
      filename: req.file.filename
    });
  });
});

// Initialize image upload
router.post('/images/initializeUpload', protect, (req, res) => {
  linkedinController.initializeImageUpload(req, res);
});

// Get LinkedIn basic profile without API calls
router.get('/basic-profile', protect, linkedinController.getLinkedInBasicProfile);

// Delete LinkedIn post
router.delete('/delete-linkedin-post', protect, (req, res) => {
  linkedinController.deleteLinkedInPost(req, res);
});

// Scrape LinkedIn profile (public endpoint - no auth required)
router.post('/scrape-profile', [
  check('username', 'LinkedIn username is required').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  linkedinController.scrapeLinkedInProfile(req, res);
});

// Save scraped LinkedIn posts
router.post('/save-scraped-posts', [
  protect,
  check('posts', 'Posts array is required').isArray().notEmpty(),
  check('profileData', 'Profile data is required').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  linkedinController.saveScrapedLinkedInPosts(req, res);
});

// Get saved LinkedIn posts
router.get('/saved-posts', protect, (req, res) => {
  linkedinController.getSavedLinkedInPosts(req, res);
});

// LinkedIn OAuth routes
router.get('/auth/linkedin-direct', (req, res) => {
  const baseUrl = 'https://www.linkedin.com/oauth/v2/authorization';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state: 'random_state_string',
    scope: 'r_liteprofile r_emailaddress w_member_social'
  });
  
  // Store login type in session
  req.session.loginType = req.query.type || 'direct';
  if (req.query.googleUserId) {
    req.session.googleUserId = req.query.googleUserId;
  }
  
  res.redirect(`${baseUrl}?${params.toString()}`);
});

router.get('/auth/linkedin/callback', linkedinController.handleLinkedInCallback);

// Protected routes
router.use(protect);

// LinkedIn connection for Google users
router.post('/connect-linkedin', linkedinController.handleGoogleUserLinkedInConnection);

module.exports = router; 