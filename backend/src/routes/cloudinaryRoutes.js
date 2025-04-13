const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer storage with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'linkedin_content',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1080, crop: 'limit' }],
  },
});

// Initialize multer upload
const upload = multer({ storage: storage });

/**
 * @route   POST /api/cloudinary/upload
 * @desc    Upload image to Cloudinary
 * @access  Private
 */
router.post('/upload', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    return res.status(200).json({
      success: true,
      data: {
        url: req.file.path,
        public_id: req.file.filename,
        secure_url: req.file.secure_url || req.file.path.replace('http://', 'https://'),
        format: req.file.format,
        width: req.file.width,
        height: req.file.height
      }
    });
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to upload image',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   POST /api/cloudinary/generate
 * @desc    Generate image with OpenAI and upload to Cloudinary
 * @access  Private
 */
router.post('/generate', protect, async (req, res) => {
  try {
    const { prompt, size = '1024x1024', style = 'vivid' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Image description (prompt) is required' });
    }
    
    // Generate image with DALL-E 3
    const response = await openAI.images.generate({
      model: "dall-e-3",
      prompt: `Create a professional, high-quality LinkedIn post image about: ${prompt}. The image should be suitable for a professional audience and business context.`,
      n: 1,
      size: size,
      style: style,
    });

    // Get the image URL from the response
    const imageUrl = response.data[0].url;
    
    // Upload the generated image to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageUrl, {
      folder: 'linkedin_generated',
      resource_type: 'auto'
    });

    return res.status(200).json({
      success: true,
      data: {
        url: uploadResult.url,
        secure_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        original_prompt: prompt,
        revised_prompt: response.data[0].revised_prompt
      }
    });
  } catch (error) {
    console.error('Error generating/uploading image:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate/upload image',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   GET /api/cloudinary/suggestions
 * @desc    Get suggested images from Cloudinary
 * @access  Private
 */
router.get('/suggestions', protect, async (req, res) => {
  try {
    // Get images from LinkedIn generated folder
    const result = await cloudinary.search
      .expression('folder:linkedin_generated')
      .sort_by('created_at', 'desc')
      .max_results(20)
      .execute();

    return res.status(200).json({
      success: true,
      data: result.resources.map(resource => ({
        url: resource.url,
        secure_url: resource.secure_url,
        public_id: resource.public_id,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        created_at: resource.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch image suggestions',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   GET /api/cloudinary/gallery
 * @desc    Get user's image gallery
 * @access  Private
 */
router.get('/gallery', protect, async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    // Search for user's images in Cloudinary
    // This search uses a folder naming convention: 'user_[userId]'
    const searchExpression = `folder=user_${userId}`;
    
    const result = await cloudinary.search
      .expression(searchExpression)
      .sort_by('created_at', 'desc')
      .max_results(100)
      .execute();

    return res.status(200).json({
      success: true,
      data: result.resources.map(resource => ({
        id: resource.asset_id,
        userId: userId,
        url: resource.url,
        secure_url: resource.secure_url,
        public_id: resource.public_id,
        title: resource.context?.title || '',
        prompt: resource.context?.prompt || '',
        tags: resource.tags || [],
        createdAt: resource.created_at,
        type: resource.folder === 'linkedin_generated' ? 'ai-generated' : 'uploaded',
        width: resource.width,
        height: resource.height
      }))
    });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch gallery',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   POST /api/cloudinary/gallery
 * @desc    Save image to user's gallery
 * @access  Private
 */
router.post('/gallery', protect, async (req, res) => {
  try {
    const { userId, url, secure_url, public_id, title, prompt, type } = req.body;
    
    if (!userId || !public_id) {
      return res.status(400).json({ success: false, message: 'User ID and public_id are required' });
    }
    
    // If the image is not already in the user's folder, copy it there
    const targetFolder = `user_${userId}`;
    const newPublicId = `${targetFolder}/${Date.now()}`;
    
    // We need to copy/move the asset to the user's folder
    const copyResult = await cloudinary.uploader.rename(
      public_id,
      newPublicId,
      {
        type: 'upload',
        context: {
          title: title || '',
          prompt: prompt || ''
        },
        overwrite: true
      }
    );
    
    return res.status(200).json({
      success: true,
      data: {
        id: copyResult.asset_id,
        userId,
        url: copyResult.url,
        secure_url: copyResult.secure_url,
        public_id: copyResult.public_id,
        title: title || '',
        prompt: prompt || '',
        tags: copyResult.tags || [],
        createdAt: copyResult.created_at,
        type: type || 'uploaded',
        width: copyResult.width,
        height: copyResult.height
      }
    });
  } catch (error) {
    console.error('Error saving to gallery:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to save to gallery',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   DELETE /api/cloudinary/gallery/:id
 * @desc    Delete image from user's gallery
 * @access  Private
 */
router.delete('/gallery/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ success: false, message: 'Image ID is required' });
    }
    
    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(id);
    
    if (result.result !== 'ok') {
      throw new Error('Failed to delete image from Cloudinary');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting from gallery:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete from gallery',
      error: error.response?.data || error.toString()
    });
  }
});

module.exports = router; 