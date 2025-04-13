const asyncHandler = require('express-async-handler');
const OpenAI = require('openai');
const { Innertube } = require('youtubei.js');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const User = require('../models/userModel');

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dexlsqpbv',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * @desc    Fetch transcript from YouTube video
 * @route   POST /api/ai/youtube-transcript
 * @access  Private
 */
const getYouTubeTranscript = asyncHandler(async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    res.status(400);
    throw new Error('Please provide a YouTube video URL');
  }

  try {
    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      res.status(400);
      throw new Error('Invalid YouTube URL');
    }

    // Initialize YouTube client
    const youtube = await Innertube.create();
    
    // Get video info
    const video = await youtube.getInfo(videoId);
    
    // Get captions
    const captions = video.captions;
    if (!captions || !captions.available) {
      res.status(404);
      throw new Error('No captions available for this video');
    }

    // Get transcript in the default language (usually English)
    const captionTracks = captions.captionTracks || [];
    if (captionTracks.length === 0) {
      res.status(404);
      throw new Error('No caption tracks available for this video');
    }

    // Prefer English, otherwise use the first available
    let captionTrack = captionTracks.find(track => track.languageCode === 'en') || captionTracks[0];
    
    // Fetch the actual transcript
    const transcriptResponse = await youtube.session.fetch(captionTrack.url);
    const transcriptData = await transcriptResponse.text();
    
    // Parse the transcript
    const parsedTranscript = parseTranscript(transcriptData);

    res.status(200).json({
      success: true,
      data: {
        title: video.title,
        transcript: parsedTranscript,
        videoId,
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    res.status(500);
    throw new Error('Error fetching transcript: ' + error.message);
  }
});

/**
 * @desc    Generate LinkedIn content based on text or transcript
 * @route   POST /api/ai/generate-linkedin-content
 * @access  Private
 */
const generateLinkedInContent = asyncHandler(async (req, res) => {
  const { 
    inputText, 
    contentType = 'post', 
    industry, 
    targetAudience, 
    contentGoal, 
    tone,
    includeHashtags = true,
    includeEmojis = true,
    maxLength
  } = req.body;

  if (!inputText) {
    res.status(400);
    throw new Error('Please provide input text or transcript');
  }

  try {
    // Create system message based on user preferences
    const systemMessage = createSystemPrompt(
      contentType, 
      industry, 
      targetAudience, 
      contentGoal, 
      tone, 
      includeHashtags, 
      includeEmojis,
      maxLength
    );

    // Generate content with OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: inputText }
      ],
      temperature: 0.7,
      max_tokens: contentType === 'article' ? 2000 : 1000,
    });

    const generatedContent = completion.choices[0].message.content.trim();

    // Save to user history
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          'aiGeneratedContent': {
            contentType,
            prompt: inputText,
            result: generatedContent,
            createdAt: new Date()
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        content: generatedContent
      }
    });
  } catch (error) {
    console.error('Error generating LinkedIn content:', error);
    res.status(500);
    throw new Error('Error generating content: ' + error.message);
  }
});

/**
 * @desc    Generate image for LinkedIn post
 * @route   POST /api/ai/generate-image
 * @access  Private
 */
const generateImage = asyncHandler(async (req, res) => {
  const { prompt, style = 'professional', size = '1024x1024' } = req.body;

  if (!prompt) {
    res.status(400);
    throw new Error('Please provide a prompt for image generation');
  }

  try {
    // Create enhanced prompt
    const enhancedPrompt = `Create a ${style} image for a LinkedIn post about: ${prompt}. The image should be professional, high-quality, and visually appealing for business professionals.`;

    // Generate image using OpenAI
    const response = await openai.images.generate({
      model: "dall-e-3", // Using the latest model since you mentioned you have GPT Plus
      prompt: enhancedPrompt,
      size: size,
      quality: "hd",
      n: 1,
    });

    const imageUrl = response.data[0].url;

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageUrl, {
      folder: 'linkedin_generated_images',
      resource_type: 'image'
    });

    // Save reference to user's history
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          'generatedImages': {
            prompt,
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            createdAt: new Date()
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id
      }
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500);
    throw new Error('Error generating image: ' + error.message);
  }
});

/**
 * @desc    Upload image to Cloudinary
 * @route   POST /api/ai/upload-image
 * @access  Private
 */
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file');
  }

  try {
    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: 'linkedin_uploaded_images',
      resource_type: 'image'
    });

    // Remove the temporary file
    fs.unlinkSync(req.file.path);

    // Save reference to user's uploads
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          'uploadedImages': {
            originalName: req.file.originalname,
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            createdAt: new Date()
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    
    // Remove the temporary file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500);
    throw new Error('Error uploading image: ' + error.message);
  }
});

// Helper functions
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

function parseTranscript(xml) {
  // Simple XML parsing for transcript data
  // This is a simplified version - you might want to use a proper XML parser
  const textSegments = [];
  const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    const startTime = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const text = match[3].replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/&quot;/g, '"')
                         .replace(/&#39;/g, "'");
    
    textSegments.push({
      start: startTime,
      duration,
      text
    });
  }
  
  return textSegments;
}

function createSystemPrompt(
  contentType, 
  industry, 
  targetAudience, 
  contentGoal, 
  tone, 
  includeHashtags, 
  includeEmojis,
  maxLength
) {
  let basePrompt = `You are a professional LinkedIn content creator specialized in creating high-quality ${contentType}s`;
  
  if (industry) {
    basePrompt += ` for the ${industry} industry`;
  }
  
  if (targetAudience) {
    basePrompt += ` targeting ${targetAudience}`;
  }
  
  basePrompt += '. ';
  
  // Add content goal if provided
  if (contentGoal) {
    basePrompt += `The content should focus on ${contentGoal}. `;
  }
  
  // Add tone instructions
  if (tone) {
    basePrompt += `Use a ${tone} tone in your writing. `;
  }
  
  // Content type specific instructions
  switch (contentType) {
    case 'post':
      basePrompt += `Create a compelling LinkedIn post that is concise, engaging, and professional. ${maxLength ? `Keep it under ${maxLength} characters. ` : ''}`;
      break;
    case 'article':
      basePrompt += 'Create a well-structured LinkedIn article with a clear introduction, body, and conclusion. Include subheadings to break up the content. ';
      break;
    case 'carousel':
      basePrompt += 'Create content for a LinkedIn carousel post. Format as a series of 5-10 slides, with each slide separated by [SLIDE X]. Each slide should be concise and impactful. Include a title slide and a call-to-action on the final slide. ';
      break;
    case 'poll':
      basePrompt += 'Create an engaging LinkedIn poll with a thought-provoking question and 2-4 response options. Include a brief introduction explaining the poll\'s purpose. Format as [QUESTION] followed by [OPTION 1], [OPTION 2], etc. ';
      break;
    case 'comment':
      basePrompt += 'Create a thoughtful comment that adds value to the conversation, demonstrates expertise, and encourages further engagement. Keep it concise but insightful. ';
      break;
    default:
      basePrompt += 'Create engaging and professional content that resonates with LinkedIn users. ';
  }
  
  // Hashtag and emoji instructions
  if (includeHashtags) {
    basePrompt += 'Include 3-5 relevant hashtags strategically placed in the content. ';
  } else {
    basePrompt += 'Do not include any hashtags. ';
  }
  
  if (includeEmojis) {
    basePrompt += 'Use appropriate emojis sparingly to enhance engagement, but maintain professionalism. ';
  } else {
    basePrompt += 'Do not include any emojis. ';
  }
  
  // Final instructions
  basePrompt += 'Based on the input provided, create original, engaging content that will drive engagement on LinkedIn and position the author as a thought leader. The content should be authentic, value-adding, and aligned with LinkedIn best practices.';
  
  return basePrompt;
}

module.exports = {
  getYouTubeTranscript,
  generateLinkedInContent,
  generateImage,
  uploadImage
}; 