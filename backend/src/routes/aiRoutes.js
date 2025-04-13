const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { OpenAI } = require('openai');

// Load OpenAI API key from environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Check if API key is available
if (!OPENAI_API_KEY) {
  console.error('WARNING: OpenAI API key is not set in environment variables!');
}

// Initialize OpenAI with the API key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

console.log('OpenAI client initialized with API key length:', OPENAI_API_KEY ? OPENAI_API_KEY.length : 'Not set');

/**
 * @route   POST /api/ai/generate
 * @desc    Generate content with OpenAI
 * @access  Private
 */
router.post('/generate', protect, async (req, res) => {
  try {
    const { prompt, format = 'short', tone = 'professional' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }
    
    console.log('OpenAI API Key length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 'Not set');
    console.log('Using OpenAI for content generation with format:', format);
    
    let systemMessage = `You are a LinkedIn content expert. Create a ${tone} ${format} post based on the prompt.`;
    
    // Customize system message based on format
    if (format === 'listicle') {
      systemMessage += ' Format the content as a numbered list with emojis.';
    } else if (format === 'long') {
      systemMessage += ' Create a comprehensive post with 3-5 paragraphs and bullet points.';
    } else if (format === 'hook') {
      systemMessage += ' Create only an attention-grabbing opening sentence to hook readers.';
    }
    
    // Generate content with GPT-4
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Falling back to GPT-3.5 as it's more widely available
        messages: [
          { 
            role: "system", 
            content: systemMessage
          },
          { 
            role: "user", 
            content: prompt
          }
        ],
        max_tokens: 1200,
      });
      console.log('Content generation successful');
    } catch (openaiError) {
      console.error('OpenAI content generation error:', openaiError);
      throw new Error(`OpenAI content generation failed: ${openaiError.message}`);
    }
    
    // Generate hashtags in a separate request
    let hashtagCompletion;
    let suggestedHashtags = [];
    
    try {
      hashtagCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Falling back to GPT-3.5 as it's more widely available
        messages: [
          { 
            role: "system", 
            content: "Generate 5 relevant LinkedIn hashtags (without the # symbol) based on the content. Format your response as a comma-separated list."
          },
          { 
            role: "user", 
            content: completion.choices[0].message.content
          }
        ],
        max_tokens: 100
      });
      console.log('Hashtag generation successful');
      
      // Extract hashtags from text response
      const hashtagText = hashtagCompletion.choices[0].message.content;
      suggestedHashtags = hashtagText
        .split(',')
        .map(tag => tag.trim().replace(/^#/, '')) // Remove # if present
        .filter(tag => tag.length > 0);
    } catch (hashtagError) {
      console.error('OpenAI hashtag generation error:', hashtagError);
      // Don't fail the whole request if hashtag generation fails
      suggestedHashtags = ['ContentCreation', 'ProfessionalDevelopment', 'LinkedIn'];
    }

    return res.status(200).json({
      success: true,
      data: {
        content: completion.choices[0].message.content,
        suggestedHashtags: suggestedHashtags,
        model: completion.model,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens
      }
    });
  } catch (error) {
    console.error('Error generating content with OpenAI:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate content',
      error: error.toString(),
      stack: error.stack
    });
  }
});

/**
 * @route   GET /api/ai/test
 * @desc    Test OpenAI connectivity
 * @access  Private
 */
router.get('/test', protect, async (req, res) => {
  try {
    console.log('Testing OpenAI connectivity...');
    
    // Simple test with a minimal prompt
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant." 
        },
        { 
          role: "user", 
          content: "Say hello world" 
        }
      ],
      max_tokens: 50,
    });
    
    return res.status(200).json({
      success: true,
      message: 'OpenAI connectivity successful',
      response: completion.choices[0].message.content,
      model: completion.model
    });
  } catch (error) {
    console.error('OpenAI test failed:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'OpenAI connectivity test failed',
      error: error.toString(),
      stack: error.stack
    });
  }
});

module.exports = router;
