const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure CORS specifically for upload routes
const uploadCorsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://brandout.vercel.app',
      'http://localhost:5000'
    ];
    
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('netlify.app')) {
      callback(null, true);
    } else {
      console.log(`Upload Routes: Origin ${origin} not allowed by CORS`);
      callback(null, true); // Still allow but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
};

// Apply CORS to all upload routes
router.use(cors(uploadCorsOptions));

// Handle preflight requests
router.options('*', cors(uploadCorsOptions));

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

// Regular upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'uploads',
      resource_type: 'auto'
    });

    // Delete temporary file
    fs.unlinkSync(req.file.path);

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
    res.status(500).json({ error: 'Failed to upload file' });
  }
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