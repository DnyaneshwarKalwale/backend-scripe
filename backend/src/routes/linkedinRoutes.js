const express = require('express');
const router = express.Router();
const axios = require('axios');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const UserToken = require('../models/UserToken');

// LinkedIn API base URL
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

// Middleware to get LinkedIn access token
const getLinkedInToken = async (req, res, next) => {
  try {
    const userToken = await UserToken.findOne({
      user: req.user.id,
      provider: 'linkedin'
    });

    if (!userToken || !userToken.accessToken) {
      return res.status(401).json({
        error: 'LinkedIn account not connected or token expired. Please reconnect your LinkedIn account.'
      });
    }

    req.linkedinToken = userToken.accessToken;
    next();
  } catch (err) {
    console.error('Error retrieving LinkedIn token:', err);
    res.status(500).json({ error: 'Server error getting LinkedIn token' });
  }
};

// Get current user's LinkedIn profile
router.get('/profile', auth, getLinkedInToken, async (req, res) => {
  try {
    const response = await axios.get(`${LINKEDIN_API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${req.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Error fetching LinkedIn profile:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error fetching LinkedIn profile',
      details: err.response?.data || err.message
    });
  }
});

// Create a post
router.post('/posts', [
  auth,
  getLinkedInToken,
  check('specificContent.com\\.linkedin\\.ugc\\.ShareContent.shareCommentary.text', 'Post text is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const response = await axios.post(`${LINKEDIN_API_URL}/ugcPosts`, req.body, {
      headers: {
        'Authorization': `Bearer ${req.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Error creating LinkedIn post:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error creating LinkedIn post',
      details: err.response?.data || err.message
    });
  }
});

// Initialize image upload
router.post('/images/initializeUpload', auth, getLinkedInToken, async (req, res) => {
  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/assets?action=registerUpload`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${req.linkedinToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error('Error initializing LinkedIn image upload:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error initializing LinkedIn image upload',
      details: err.response?.data || err.message
    });
  }
});

// Create a poll
router.post('/polls', auth, getLinkedInToken, async (req, res) => {
  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/polls`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${req.linkedinToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error('Error creating LinkedIn poll:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error creating LinkedIn poll',
      details: err.response?.data || err.message
    });
  }
});

// Schedule a post
router.post('/posts/schedule', auth, getLinkedInToken, async (req, res) => {
  try {
    // For scheduled posts, we'll store them in our database and use a cron job to publish
    // since LinkedIn doesn't have a native scheduling API
    const { scheduledTime, ...postData } = req.body;
    
    // Here you would save to your own database
    // const scheduledPost = new ScheduledPost({
    //   user: req.user.id,
    //   provider: 'linkedin',
    //   scheduledTime: new Date(scheduledTime),
    //   postData: postData
    // });
    // await scheduledPost.save();

    // For this example, we'll just return success with mock data
    res.json({
      id: 'scheduled_' + Date.now(),
      scheduledTime: scheduledTime,
      status: 'scheduled'
    });
  } catch (err) {
    console.error('Error scheduling LinkedIn post:', err);
    res.status(500).json({
      error: 'Error scheduling LinkedIn post',
      details: err.message
    });
  }
});

// Delete a post
router.delete('/posts/:postId', auth, getLinkedInToken, async (req, res) => {
  try {
    await axios.delete(`${LINKEDIN_API_URL}/ugcPosts/${req.params.postId}`, {
      headers: {
        'Authorization': `Bearer ${req.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Error deleting LinkedIn post:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error deleting LinkedIn post',
      details: err.response?.data || err.message
    });
  }
});

// Get user's posts
router.get('/posts', auth, getLinkedInToken, async (req, res) => {
  try {
    const { author, limit = 10 } = req.query;
    
    const response = await axios.get(`${LINKEDIN_API_URL}/ugcPosts?q=authors&authors=${author}&count=${limit}`, {
      headers: {
        'Authorization': `Bearer ${req.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Error fetching LinkedIn posts:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Error fetching LinkedIn posts',
      details: err.response?.data || err.message
    });
  }
});

module.exports = router; 