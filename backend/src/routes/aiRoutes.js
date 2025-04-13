const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { OpenAI } = require('openai');

// Example AI responses for fallback
const exampleResponses = {
  short: {
    content: "Our recent study of 500 marketing professionals revealed that companies using AI-assisted content generation saw a 37% increase in engagement and a 22% reduction in content production time. The key is finding the right balance between AI efficiency and human creativity. Are you leveraging AI in your content strategy yet?",
    suggestedHashtags: ["AIContentCreation", "MarketingStrategy", "ContentEfficiency", "LinkedInTips"]
  },
  long: {
    content: "In today's digital landscape, content creation has become a cornerstone of successful marketing strategies. However, many businesses struggle with consistency and quality.\n\nOur recent study of 500 marketing professionals revealed some fascinating insights:\n\n- Companies using AI-assisted content generation saw a 37% increase in engagement\n- Content production time was reduced by 22% on average\n- Teams reported higher satisfaction with their output quality\n\nThe key findings suggest that human-AI collaboration produces the best results, with AI handling research and initial drafts while humans refine messaging and add authentic perspectives. This approach not only improves efficiency but also enhances content relevance across different platforms.\n\nWe discovered that the most successful companies aren't simply replacing human writers with AI, but instead creating workflows where each contributes their strengths.\n\nHave you experimented with AI in your content creation process? I'd love to hear about your experience in the comments below.",
    suggestedHashtags: ["AIContentCreation", "MarketingInsights", "ContentStrategy", "DigitalMarketing", "AICollaboration"]
  },
  listicle: {
    content: "5 Ways AI Is Transforming Content Creation According to Our New Research\n\n1️⃣ Higher Engagement: Companies using AI-assisted content saw a 37% increase in audience engagement metrics\n\n2️⃣ Time Efficiency: Content production time reduced by 22% when using collaborative AI tools\n\n3️⃣ Consistency Improvement: AI helps maintain brand voice across multiple channels and content types\n\n4️⃣ Research Enhancement: AI can analyze trends and competitor content to identify optimal topics\n\n5️⃣ Personalization at Scale: AI enables creating tailored content variations for different audience segments\n\nThe key isn't replacing human creativity, but enhancing it through strategic AI collaboration. Which of these benefits would most impact your content strategy?",
    suggestedHashtags: ["AIContent", "ContentMarketing", "MarketingTips", "LinkedInStrategy", "DigitalTransformation"]
  },
  hook: {
    content: "Our recent study of 500 marketing professionals revealed a surprising insight about AI-assisted content creation that could transform your engagement metrics...",
    suggestedHashtags: ["ContentMarketing", "AIInsights"]
  }
};

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
    
    // For now, just return example responses directly
    // This ensures the API works while you troubleshoot OpenAI integration
    console.log('Using example response for format:', format);
    
    // Return example content
    return res.status(200).json({
      success: true,
      data: exampleResponses[format] || exampleResponses.short,
      usingFallback: true
    });
    
  } catch (error) {
    console.error('Error in content generation route:', error);
    // Even if there's an error, try to return example content
    try {
      const format = req.body?.format || 'short';
      return res.status(200).json({
        success: true,
        data: exampleResponses[format] || exampleResponses.short,
        error: error.toString(),
        usingFallback: true
      });
    } catch (fallbackError) {
      // If even the fallback fails, return an error response
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to generate content',
        error: error.toString()
      });
    }
  }
});

/**
 * @route   GET /api/ai/test
 * @desc    Test OpenAI connectivity
 * @access  Private
 */
router.get('/test', protect, async (req, res) => {
  try {
    // Try to initialize OpenAI specifically for this test
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    console.log('Testing OpenAI connectivity with API key length:', 
      process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 'Not set');
    
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
