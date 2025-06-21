const asyncHandler = require('express-async-handler');
const Font = require('../models/fontModel');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const fontkit = require('fontkit');

// Set up multer storage for font files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fontDir = path.join(process.cwd(), 'uploads', 'fonts');
    if (!fs.existsSync(fontDir)) {
      fs.mkdirSync(fontDir, { recursive: true });
    }
    cb(null, fontDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'font-' + uniqueSuffix + ext);
  }
});

// Filter to only allow font files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'font/ttf', 
    'font/otf', 
    'font/woff', 
    'font/woff2',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/font-woff',
    'application/font-woff2',
    'application/octet-stream', // Generic binary type often used for fonts
    'binary/octet-stream',
    'application/x-font', // Generic font type
    'font/sfnt'           // Structured font type (used for TTF/OTF)
  ];
  
  // First check the extension since MIME type detection isn't reliable
  const ext = path.extname(file.originalname).toLowerCase();
  const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
  
  if (validExtensions.includes(ext)) {
    // Extension is valid, accept the file
    cb(null, true);
  } else if (allowedMimeTypes.includes(file.mimetype)) {
    // MIME type is in our list, accept the file
    cb(null, true);
  } else {
    // Neither extension nor MIME type is valid
    cb(new Error('Invalid font file format. Supported formats: .ttf, .otf, .woff, .woff2'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// @desc    Upload a new font
// @route   POST /api/fonts
// @access  Private
const uploadFont = asyncHandler(async (req, res) => {
  // Multer will have processed the file
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a font file');
  }

  // Extract font format from file extension
  const ext = path.extname(req.file.filename).toLowerCase();
  let format = ext.substring(1); // remove the dot
  
  // Validate format
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(format)) {
    // Default to ttf if we can't determine
    format = 'ttf';
  }
  
  // Generate a normalized font family name if not provided
  let fontFamily = req.body.fontFamily;
  let fontName = req.body.name;
  
  // Extract font metadata - try multiple methods
  if (!fontName) {
    try {
      // Method 1: Try to read font metadata with fontkit
      const fontFile = fs.readFileSync(req.file.path);
      try {
        const font = fontkit.create(fontFile);
        fontName = font.familyName || font.fullName || font.postscriptName;
        console.log('Found font name from metadata:', fontName);
      } catch (fontkitError) {
        console.error('Error reading font with fontkit:', fontkitError);
        // Fallback to original filename
        fontName = path.basename(req.file.originalname, path.extname(req.file.originalname));
      }
    } catch (fileError) {
      console.error('Error reading font file:', fileError);
      fontName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    }
  }
  
  // Ensure we have a font name
  if (!fontName || fontName.trim() === '') {
    fontName = `Custom Font ${new Date().toLocaleDateString()}`;
  }
  
  // Normalize font family name for CSS
  if (!fontFamily) {
    fontFamily = `custom-${fontName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}`;
  }
  
  // Create file URL
  const fileUrl = `/uploads/fonts/${req.file.filename}`;
  
  // Create the font in database
  const font = await Font.create({
    name: fontName,
    fontFamily,
    fileUrl,
    format,
    addedBy: req.user ? req.user._id : null
  });
  
  res.status(201).json(font);
});

// @desc    Get all fonts
// @route   GET /api/fonts
// @access  Public
const getFonts = asyncHandler(async (req, res) => {
  const fonts = await Font.find({}).sort({ createdAt: -1 });
  res.status(200).json(fonts);
});

// @desc    Get a single font
// @route   GET /api/fonts/:id
// @access  Public
const getFont = asyncHandler(async (req, res) => {
  const font = await Font.findById(req.params.id);
  
  if (!font) {
    res.status(404);
    throw new Error('Font not found');
  }
  
  res.status(200).json(font);
});

// @desc    Delete a font
// @route   DELETE /api/fonts/:id
// @access  Private/Admin
const deleteFont = asyncHandler(async (req, res) => {
  const font = await Font.findById(req.params.id);
  
  if (!font) {
    res.status(404);
    throw new Error('Font not found');
  }
  
  // Check if the user is the one who added the font or an admin
  if (req.user.role !== 'admin' && 
      font.addedBy && 
      font.addedBy.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error('Not authorized to delete this font');
  }
  
  // Delete the font file
  try {
    const filePath = path.join(
      process.cwd(), 
      font.fileUrl.replace(/^\//, '') // Remove leading slash
    );
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting font file:', error);
    // Continue even if file deletion fails
  }
  
  // Delete from database
  await font.deleteOne();
  
  res.status(200).json({ message: 'Font removed' });
});

// Generate CSS for fonts
const generateFontCSS = asyncHandler(async (req, res) => {
  const fonts = await Font.find({});
  
  // Generate CSS for all fonts
  let css = '';
  
  fonts.forEach(font => {
    css += `@font-face {
  font-family: "${font.fontFamily}";
  src: url("${font.fileUrl}") format("${font.format}");
  font-weight: normal;
  font-style: normal;
}
`;
  });
  
  res.set('Content-Type', 'text/css');
  res.send(css);
});

module.exports = {
  uploadFont,
  getFonts,
  getFont,
  deleteFont,
  generateFontCSS,
  upload // Export multer middleware
}; 