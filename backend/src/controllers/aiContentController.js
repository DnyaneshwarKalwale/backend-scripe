const { OpenAI } = require('openai');
const asyncHandler = require('express-async-handler');

// Initialize OpenAI with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate LinkedIn content based on user prompts and preferences
 * @route POST /api/ai/generate-content
 * @access Private
 */
exports.generateLinkedInContent = asyncHandler(async (req, res) => {
  const { prompt, format, tone, industry } = req.body;

  if (!prompt) {
    res.status(400);
    throw new Error('Prompt is required');
  }

  try {
    // Construct the system message based on user preferences
    let systemMessage = 'You are a professional LinkedIn content creator. ';
    
    if (industry) {
      systemMessage += `Specialize in creating content for the ${industry} industry. `;
    }
    
    systemMessage += 'Your task is to create engaging, professional content for LinkedIn that is original and provides value to readers.';

    // Construct the user message with formatting instructions
    let userMessage = `Create a LinkedIn post based on this prompt: "${prompt}". `;
    
    if (format) {
      if (format === 'short') {
        userMessage += 'Make it concise (1-2 paragraphs, 150-300 characters). ';
      } else if (format === 'long') {
        userMessage += 'Make it a detailed post (3-5 paragraphs, 500-1500 characters). ';
      } else if (format === 'listicle') {
        userMessage += 'Format it as a numbered list with 3-7 points. ';
      } else if (format === 'carousel') {
        userMessage += 'Create content for a 5-slide LinkedIn carousel. Format each slide with a clear header and brief content. ';
      } else if (format === 'article') {
        userMessage += 'Create an outline for a LinkedIn article with headers and brief descriptions of each section. ';
      } else if (format === 'hook') {
        userMessage += 'Create only an attention-grabbing hook (50-100 characters) to start a LinkedIn post. ';
      }
    }
    
    if (tone) {
      userMessage += `Use a ${tone} tone. `;
    }
    
    userMessage += 'Include 3-5 relevant hashtags at the end.';

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    // Parse out the hashtags
    const content = completion.choices[0].message.content;
    const hashtags = [];
    
    // Extract hashtags
    const hashtagPattern = /#[\w\d]+/g;
    const hashtagMatches = content.match(hashtagPattern);
    
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        hashtags.push(tag.replace('#', ''));
      });
    }

    // Return generated content
    res.status(200).json({
      success: true,
      data: {
        content,
        hashtags,
        model: completion.model,
        usage: completion.usage
      }
    });
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate content. Please try again.'
    });
  }
});

/**
 * Generate image for LinkedIn posts
 * @route POST /api/ai/generate-image
 * @access Private
 */
exports.generateImage = asyncHandler(async (req, res) => {
  const { prompt, size = '1024x1024', style = 'vivid' } = req.body;

  if (!prompt) {
    res.status(400);
    throw new Error('Prompt is required');
  }

  try {
    // Enhance the prompt for professional LinkedIn-appropriate images
    const enhancedPrompt = `Create a professional, high-quality image for a LinkedIn post about: ${prompt}. The image should be suitable for a business context and have a professional appearance.`;

    // Call OpenAI image generation API
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: size,
      style: style,
    });

    res.status(200).json({
      success: true,
      data: {
        url: response.data[0].url,
        revised_prompt: response.data[0].revised_prompt,
        model: "dall-e-3"
      }
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate image. Please try again.'
    });
  }
});

/**
 * Process YouTube transcript to create LinkedIn content
 * @route POST /api/ai/process-transcript
 * @access Private
 */
exports.processYouTubeTranscript = asyncHandler(async (req, res) => {
  const { transcript, format = 'post', tone = 'professional' } = req.body;

  if (!transcript) {
    res.status(400);
    throw new Error('Transcript is required');
  }

  try {
    // Construct system message for processing transcripts
    const systemMessage = 'You are an expert at converting YouTube video transcripts into engaging LinkedIn content. Extract the key points and insights from the transcript and create professional content suitable for LinkedIn.';

    // Construct user message with formatting instructions
    let userMessage = `Convert this YouTube transcript into LinkedIn content. Format: ${format}. Tone: ${tone}.\n\nTranscript:\n${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    // Return processed content
    res.status(200).json({
      success: true,
      data: {
        content: completion.choices[0].message.content,
        model: completion.model,
        usage: completion.usage
      }
    });
  } catch (error) {
    console.error('Error processing transcript:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process transcript. Please try again.'
    });
  }
}); 