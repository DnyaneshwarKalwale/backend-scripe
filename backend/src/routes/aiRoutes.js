const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Set correctly' : 'Not set');
    console.log('Using OpenAI for content generation');
    
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
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
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
    
    // Generate hashtags in a separate request
    const hashtagCompletion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { 
          role: "system", 
          content: "You generate relevant LinkedIn hashtags based on content. Provide only a JSON array of 4-5 hashtag words/phrases WITHOUT the # symbol."
        },
        { 
          role: "user", 
          content: completion.choices[0].message.content
        }
      ],
      max_tokens: 100,
      response_format: { type: "json_object" }
    });
    
    // Extract hashtags from JSON response
    let suggestedHashtags = [];
    try {
      const hashtagsJson = JSON.parse(hashtagCompletion.choices[0].message.content);
      suggestedHashtags = hashtagsJson.hashtags || [];
    } catch (error) {
      console.error('Error parsing hashtags JSON:', error);
      // Fallback to simple extraction if JSON parsing fails
      const hashtagText = hashtagCompletion.choices[0].message.content;
      suggestedHashtags = hashtagText
        .replace(/["\[\]{}]/g, '')
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
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
      error: error.response?.data || error.toString()
    });
  }
});

module.exports = router;
