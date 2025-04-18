const express = require('express');
const router = express.Router();
const { getTranscript } = require('../controllers/transcriptController');
const { protect } = require('../middleware/authMiddleware');
const cors = require('cors');
const axios = require('axios');

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
  
  // Return error without dummy data
  return res.status(500).json({
    success: false,
    error: 'Fallback transcript disabled - showing real error',
    videoId: id
  });
});

// Direct transcript endpoint that attempts to fetch from YouTube directly
router.get('/direct', transcriptCors, async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Video ID is required'
    });
  }
  
  try {
    // Try direct fetch from a public API
    const response = await axios.get(`https://yt-transcript-api.vercel.app/api/transcript?id=${id}`, {
      timeout: 10000 // 10 second timeout
    });
    
    if (response.data && response.data.transcript) {
      return res.status(200).json({
        success: true,
        transcript: response.data.transcript,
        language: response.data.language || 'en',
        is_generated: true,
        source: 'direct_api'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'No transcript found via direct API',
        videoId: id
      });
    }
  } catch (error) {
    console.error('Error in direct transcript endpoint:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get transcript: ${error.message}`,
      videoId: id,
      details: error.response?.data || error.toString()
    });
  }
});

module.exports = router; 