const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up storage for profile pictures
const profilePictureStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/profile-pictures';
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Use userId_timestamp.extension as the filename to ensure uniqueness
    const fileExt = path.extname(file.originalname);
    const fileName = `${req.user._id}_${Date.now()}${fileExt}`;
    cb(null, fileName);
  },
});

// Filter to accept only image files
const fileFilter = function (req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Set up multer upload configuration
const upload = multer({ 
  storage: profilePictureStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter,
});

// @desc    Upload profile picture
// @route   POST /api/upload/profile-picture
// @access  Private
const uploadProfilePicture = asyncHandler(async (req, res) => {
  // NOTE: In a real production environment, you would likely use a cloud storage
  // service like AWS S3, Google Cloud Storage, or Cloudinary instead of local storage.
  
  // Set up multer upload as middleware
  const uploadMiddleware = upload.single('file');
  
  // Run the upload middleware
  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred (e.g., file too large)
      res.status(400);
      throw new Error(`Upload error: ${err.message}`);
    } else if (err) {
      // An unknown error occurred
      res.status(500);
      throw new Error(`Something went wrong: ${err.message}`);
    }
    
    // If no file was provided
    if (!req.file) {
      res.status(400);
      throw new Error('Please upload a file');
    }
    
    // Generate URL to the uploaded file based on server configuration
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const fileUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;
    
    // Return success with file URL
    res.status(200).json({
      success: true,
      fileUrl: fileUrl,
      fileName: req.file.filename,
    });
  });
});

module.exports = {
  uploadProfilePicture,
}; 