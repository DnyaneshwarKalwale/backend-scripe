const express = require('express');
const router = express.Router();
const { getTranscript } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Enable CORS for transcript endpoint
const transcriptCors = cors({
  origin: [
    'http://localhost:8080', 
    'http://localhost:8081',
    'https://deluxe-cassata-51d628.netlify.app',
    'https://ea50-43-224-158-115.ngrok-free.app',
    'https://18cd-43-224-158-115.ngrok-free.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Make transcript endpoint public with CORS
router.options('/', transcriptCors);
router.post('/', transcriptCors, getTranscript);

// Fallback endpoint for transcript retrieval
router.get('/fallback', transcriptCors, (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Video ID is required'
    });
  }
  
  try {
    // First try reading dummy transcript as fallback
    const dummyPath = path.join(__dirname, '..', '..', 'dummy_transcript.json');
    
    if (fs.existsSync(dummyPath)) {
      const dummyData = JSON.parse(fs.readFileSync(dummyPath, 'utf8'));
      console.log(`Serving dummy transcript for video ID: ${id} (fallback mode)`);
      
      // Personalize the dummy transcript with the video ID
      dummyData.videoId = id;
      dummyData.message = `This is a fallback transcript for video ID: ${id}`;
      
      return res.status(200).json(dummyData);
    } else {
      return res.status(404).json({
        success: false,
        error: 'Fallback transcript not found'
      });
    }
  } catch (error) {
    console.error('Error in fallback endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to serve fallback transcript',
      details: error.message
    });
  }
});

module.exports = router; 