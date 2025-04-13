const asyncHandler = require('express-async-handler');
const OpenAI = require('openai');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'dexlsqpbv',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * @desc    Generate LinkedIn post content based on prompt
 * @route   POST /api/openai/generate-content
 * @access  Private
 */
const generateLinkedInContent = asyncHandler(async (req, res) => {
  const { prompt, format, tone, industry, audience } = req.body;

  if (!prompt) {
    res.status(400);
    throw new Error('Please provide a prompt');
  }

  try {
    // Construct system message based on format and other parameters
    let systemMessage = 'You are an expert LinkedIn content creator.';
    
    if (industry) {
      systemMessage += ` You specialize in creating content for the ${industry} industry.`;
    }
    
    if (audience) {
      systemMessage += ` The target audience is ${audience}.`;
    }
    
    // Add format-specific instructions
    if (format === 'short') {
      systemMessage += ' Create a concise LinkedIn post (150-300 characters) that is engaging and professional.';
    } else if (format === 'long') {
      systemMessage += ' Create a detailed LinkedIn post (500-1500 characters) with paragraphs, bullet points if appropriate, and a call to action.';
    } else if (format === 'listicle') {
      systemMessage += ' Create a listicle-style LinkedIn post with 3-5 numbered points and a brief introduction and conclusion.';
    } else if (format === 'carousel') {
      systemMessage += ' Create content for a LinkedIn carousel with 5-7 slides. Each slide should be separated by [SLIDE X] where X is the slide number.';
    } else if (format === 'hook') {
      systemMessage += ' Create only an attention-grabbing first line for a LinkedIn post (hook) to drive curiosity and engagement.';
    }
    
    // Add tone instructions
    if (tone) {
      systemMessage += ` The tone should be ${tone}.`;
    }
    
    // Request to include hashtags nnenw
    systemMessage += ' Include 3-5 relevant hashtags at the end of the post.';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = completion.choices[0].message.content;
    
    // Extract hashtags - This is a simple regex approach
    const hashtagRegex = /#[\w\d]+/g;
    const hashtags = content.match(hashtagRegex) || [];
    
    res.status(200).json({
      success: true,
      data: {
        content,
        hashtags: hashtags.map(tag => tag.substring(1)), // Remove the # symbol
      }
    });
  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate content');
  }
});

/**
 * @desc    Generate an image for LinkedIn post using OpenAI
 * @route   POST /api/openai/generate-image
 * @access  Private
 */
const generateImage = asyncHandler(async (req, res) => {
  const { prompt, size = '1024x1024', style = 'vivid' } = req.body;

  if (!prompt) {
    res.status(400);
    throw new Error('Please provide an image prompt');
  }

  try {
    // Generate image with OpenAI
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional LinkedIn image: ${prompt}`,
      n: 1,
      size: size,
      style: style,
    });

    const imageUrl = response.data[0].url;
    
    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(imageUrl, {
      folder: 'linkedin_ai_generated',
      resource_type: 'image',
    });

    res.status(200).json({
      success: true,
      data: {
        original_url: imageUrl,
        cloudinary_url: uploadResponse.secure_url,
        public_id: uploadResponse.public_id,
      }
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate image');
  }
});

/**
 * @desc    Upload local image to Cloudinary
 * @route   POST /api/openai/upload-image
 * @access  Private
 */
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  try {
    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(req.file.path, {
      folder: 'linkedin_user_uploads',
      resource_type: 'image',
    });

    // Remove the file from server after upload
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      data: {
        url: uploadResponse.secure_url,
        public_id: uploadResponse.public_id,
      }
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to upload image');
  }
});

/**
 * @desc    Generate a carousel post with multiple slides
 * @route   POST /api/openai/generate-carousel
 * @access  Private
 */
const generateCarousel = asyncHandler(async (req, res) => {
  const { topic, slideCount = 5, industry, audience, tone } = req.body;

  if (!topic) {
    res.status(400);
    throw new Error('Please provide a topic');
  }

  try {
    // Construct system message
    let systemMessage = 'You are an expert LinkedIn content creator specializing in carousel posts.';
    
    if (industry) {
      systemMessage += ` You create content for the ${industry} industry.`;
    }
    
    if (audience) {
      systemMessage += ` The target audience is ${audience}.`;
    }
    
    if (tone) {
      systemMessage += ` The tone should be ${tone}.`;
    }
    
    systemMessage += ` Create a LinkedIn carousel with ${slideCount} slides on the topic provided. 
    Format your response as follows:
    
    [SLIDE 1: Title]
    Content for slide 1
    
    [SLIDE 2: Point 1]
    Content for slide 2
    
    Continue this format for all slides. The first slide should be an engaging title/intro slide, 
    and the last slide should include a call to action and your conclusion.
    
    Each slide should be concise (30-50 words) and impactful.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: topic }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = completion.choices[0].message.content;
    
    // Parse the slides - looking for [SLIDE X: Title] pattern
    const slideRegex = /\[SLIDE\s+(\d+):?\s+([^\]]+)\]([\s\S]*?)(?=\[SLIDE\s+\d+|$)/gi;
    const slides = [];
    let match;
    
    while ((match = slideRegex.exec(content)) !== null) {
      slides.push({
        number: match[1],
        title: match[2].trim(),
        content: match[3].trim()
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        slides,
        rawContent: content
      }
    });
  } catch (error) {
    console.error('Carousel generation error:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate carousel');
  }
});

module.exports = {
  generateLinkedInContent,
  generateImage,
  uploadImage,
  generateCarousel,
}; 