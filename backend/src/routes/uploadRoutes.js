const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure local storage for regular uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Configure local storage for chunked uploads
const chunksDir = path.join(os.tmpdir(), 'cloudinary-chunks');
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir, { recursive: true });
}

const chunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fileId = req.body.fileId;
    const chunkDir = path.join(chunksDir, fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    cb(null, chunkDir);
  },
  filename: function (req, file, cb) {
    cb(null, `chunk-${req.body.chunkIndex}`);
  }
});

const upload = multer({ storage: storage });
const chunkUpload = multer({ storage: chunkStorage });

// Add CORS headers for upload routes
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Regular upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Received file:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'uploads',
      resource_type: 'auto'
    });

    console.log('Cloudinary upload result:', result);

    // Delete temporary file
    fs.unlinkSync(req.file.path);

    // Set CORS headers in the response
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    res.json({
      url: result.url,
      secure_url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temporary file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }

    // Set CORS headers even in error response
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Error handling middleware for upload routes
router.use((err, req, res, next) => {
  console.error('Upload route error:', err);
  
  // Set CORS headers even in error responses
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  
  // Handle other errors
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Chunked upload endpoint
router.post('/chunk', chunkUpload.single('file'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    
    if (!fileId || !chunkIndex || !totalChunks) {
      return res.status(400).json({ error: 'Missing required chunk information' });
    }

    res.json({ success: true, message: `Chunk ${chunkIndex} of ${totalChunks} received` });
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// Finalize chunked upload endpoint
router.post('/finalize', async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId' });
    }

    const chunkDir = path.join(chunksDir, fileId);
    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ error: 'No chunks found for this file' });
    }

    // Combine chunks
    const chunks = fs.readdirSync(chunkDir).sort((a, b) => {
      const aIndex = parseInt(a.split('-')[1]);
      const bIndex = parseInt(b.split('-')[1]);
      return aIndex - bIndex;
    });

    const tempFile = path.join(chunksDir, `${fileId}-complete`);
    const writeStream = fs.createWriteStream(tempFile);
    
    for (const chunk of chunks) {
      const chunkPath = path.join(chunkDir, chunk);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }
    writeStream.end();

    // Upload combined file to Cloudinary
    const result = await cloudinary.uploader.upload(tempFile, {
      folder: 'uploads',
      resource_type: 'auto'
    });

    // Clean up
    fs.rmSync(chunkDir, { recursive: true, force: true });
    fs.unlinkSync(tempFile);

    res.json({
      url: result.url,
      secure_url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height
    });
  } catch (error) {
    console.error('Finalize upload error:', error);
    res.status(500).json({ error: 'Failed to finalize upload' });
  }
});

module.exports = router; 