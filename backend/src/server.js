const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
const session = require('express-session');
const { errorHandler } = require('./middleware/errorMiddleware');
const { checkMongoConnection } = require('./utils/dbCheck');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const teamRoutes = require('./routes/teamRoutes');
const linkedinRoutes = require('./routes/linkedinRoutes');
const twitterRoutes = require('./routes/twitterRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const postRoutes = require('./routes/postRoutes');
const carouselRoutes = require('./routes/carouselRoutes');
const fontRoutes = require('./routes/fontRoutes');
const { initScheduler } = require('./services/schedulerService');
const OpenAI = require('openai');
const fs = require('fs');
const cronRoutes = require('./routes/cronRoutes');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Initialize OpenAI with fallback for API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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',
});

// Initialize express app
const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Configure CORS with more options
app.use(cors({
  origin: [
    'http://localhost:8080', 
    'https://brandout.vercel.app', 
    'https://ea50-43-224-158-115.ngrok-free.app',
    'https://18cd-43-224-158-115.ngrok-free.app',
    'https://deluxe-cassata-51d628.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept-Language'],
  exposedHeaders: ['Set-Cookie']
}));

// Configure session middleware (required for Twitter OAuth)
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to false for both HTTP and HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Passport session setup
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const User = require('./models/userModel');
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

require('./config/passport')(passport);

// OpenAI content generation routes
app.post('/api/generate-content', async (req, res) => {
  try {
    // Accept either direct prompt or messages array
    const { prompt, contentType, tone = 'professional', messages, model = "gpt-4o-mini", type, transcript } = req.body;
    
    // Define secure prompts for YouTube content generation
    const SECURE_PROMPTS = {
      'post-short': `Use this YouTube transcript to write a LinkedIn short-form written post: "${transcript || ''}"

Apply the following rules **strictly**:

1. **Completely rephrase** everything — including headings, examples, analogies, and figures.
2. **Do not use this symbol: "-"**
3. **Change every number, example, and order of pointers** to ensure it's 100 percent untraceable.
4. **Create a fresh, original headline** that is attention-grabbing and not similar to the video title.
5. **Restructure the flow** — don't just summarize sequentially. Rearrange points for originality.
6. Use **short paragraphs** and leave **one line of space between each point**.
7. Keep the entire post **under 1000 characters**.
8. **Remove all bold text**, emojis, links, names, tool references, or brand mentions.
9. Use a **casual, founder-style tone** that feels like expert advice being shared.
10. Avoid storytelling. Focus on **insights, learnings, and takeaways**.
11. **No hashtags**, no promotional CTAs. Just a clean, high-value post.
12. Make sure the Hook/introduction line is not completely out of place, it should be an opener to the whole content to follow.`,

      'post-long': `Use this YouTube transcript to write a LinkedIn long-form written post: "${transcript || ''}"

Apply the following rules **strictly**:

1. **Completely rephrase** everything — including headings, examples, analogies, and figures.
2. **Do not use this symbol: "-"**
3. **Change every number, example, and order of pointers** to ensure it's 100 percent untraceable.
4. **Create a fresh, original headline** that is attention-grabbing and not similar to the video title.
5. **Restructure the flow** — don't just summarize sequentially. Rearrange points for originality.
6. Use **short paragraphs** and leave **one line of space between each point**.
7. Keep the entire post **under 2000 characters**.
8. **Remove all bold text**, emojis, links, names, tool references, or brand mentions.
9. Use a **casual, founder-style tone** that feels like expert advice being shared.
10. Avoid storytelling. Focus on **insights, learnings, and takeaways**.
11. **No hashtags**, no promotional CTAs. Just a clean, high-value post.
12. Make sure the Hook/introduction line is not completely out of place, it should be an opener to the whole content to follow.`,

      'carousel': `Use this YouTube transcript to turn the content into a LinkedIn carousel post: "${transcript || ''}"

Follow all the rules below exactly:

1. Create a **new, scroll-stopping hook** for Slide 1 — do not use the YouTube title.
2. **Do not use this symbol: "-" "--**
3. Every slide should contain a **short heading integrated into the paragraph**, not on a separate line.
4. Each slide must be **fully rephrased** — change examples, numbers, order of points, and structure.
5. Use **short sentences or bullets**, with clear spacing for readability.
6. **No names, no brands, no tools**, no external mentions.
7. Remove all **bold text**, unnecessary line breaks, and symbols.
8. The tone should be **easy to understand**, like a founder breaking down a playbook.
9. Include **takeaways or a conclusion slide**, but without CTAs or promotions.
10. The flow should feel **logical and punchy**, not robotic or templated.
11. Avoid fluff. Every slide should add **clear value or insight**.
12. Separate each slide with "\n\n" to indicate a new slide.
13. Make sure the Hook/introduction line is not completely out of place, it should be an opener to the whole content to follow.
14. Make sure the carousel is not too long, it should be 8-10 slides max.`
    };
    
    // Check if this is a YouTube transcript content generation request
    if (type && transcript && SECURE_PROMPTS[type]) {
      try {
        console.log(`Generating ${type} content from YouTube transcript with model: ${model}`);
        
        // Use the secure prompts stored on the server
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { 
              role: "system", 
              content: "You are an expert content creator for LinkedIn, generating high-quality posts from YouTube transcripts." 
            },
            { 
              role: "user", 
              content: SECURE_PROMPTS[type]
            }
          ],
          max_tokens: 2000
        });
        
        // If it's a carousel, clean up slide prefixes and any standalone "Slide X" occurrences
        let generatedContent = completion.choices[0].message.content;
        if (type === 'carousel') {
          // Split by double newlines to get individual slides
          const carouselSlides = generatedContent.split('\n\n').filter(s => s.trim());
          
          // Process slides to remove "Slide X" prefix slides and clean remaining slide content
          const cleanedSlides = [];
          for (let i = 0; i < carouselSlides.length; i++) {
            const current = carouselSlides[i].trim();
            
            // Skip slides that only contain "Slide X" and nothing else
            if (/^Slide\s*\d+\s*$/.test(current)) {
              continue;
            }
            
            // Remove "Slide X:" prefix if it exists
            cleanedSlides.push(current.replace(/^Slide\s*\d+[\s:.]+/i, '').trim());
          }
          
          generatedContent = cleanedSlides.join('\n\n');
          console.log(`Generated carousel with ${cleanedSlides.length} cleaned slides`);
        }
        
        return res.json({ 
          content: generatedContent,
          model: completion.model,
          usage: completion.usage,
          type: type,
          success: true
        });
      } catch (openaiError) {
        console.error('Error from OpenAI API (YouTube content):', openaiError);
        handleOpenAIError(openaiError, res);
        return;
      }
    }
    
    // Check if we have direct messages to use (from frontend with OpenAI format)
    if (messages && Array.isArray(messages)) {
      try {
        console.log(`Generating content with model: ${model}, using messages array`);
        
        const completion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: 2000
        });
        
        return res.json({ 
          content: completion.choices[0].message.content,
          model: completion.model,
          usage: completion.usage,
          choices: completion.choices,
          success: true
        });
      } catch (openaiError) {
        console.error('Error from OpenAI API (messages format):', openaiError);
        handleOpenAIError(openaiError, res);
        return;
      }
    }
    
    // If no messages array, use prompt-based approach
    if (!prompt) {
      return res.status(400).json({ error: 'Either prompt, transcript, or messages array is required', success: false });
    }

    // Enhanced prompt for LinkedIn content
    const enhancedPrompt = `Create ${tone} LinkedIn content about: ${prompt}. 
      Include relevant hashtags and make it engaging for a professional audience.
      Format it as a ${contentType || 'short'} post that performs well on LinkedIn.`;
    
    try {
      const completion = await openai.chat.completions.create({
        model: model, // Use requested model or default
        messages: [
          { role: "system", content: "You are a professional LinkedIn content creator. Create engaging, professional content that would perform well on LinkedIn." },
          { role: "user", content: enhancedPrompt }
        ],
        max_tokens: 2000
      });
      
      // Extract hashtags
      const content = completion.choices[0].message.content;
      const hashtags = content.match(/#[a-zA-Z0-9]+/g) || [];
      
      res.json({ 
        content: content,
        suggestedHashtags: hashtags,
        model: completion.model,
        usage: completion.usage,
        choices: completion.choices,
        success: true
      });
    } catch (openaiError) {
      handleOpenAIError(openaiError, res);
    }
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ error: 'Failed to generate content', message: error.message, success: false });
  }
});

// Helper function to handle OpenAI errors
function handleOpenAIError(openaiError, res) {
  console.error('Error from OpenAI API:', openaiError);
  
  // Check for quota exceeded error
  if (openaiError.status === 429 || (openaiError.error && openaiError.error.type === 'insufficient_quota')) {
    return res.status(402).json({ 
      error: 'OpenAI API quota exceeded. Please check your billing details.',
      message: 'The API key has run out of credits. Please update your OpenAI API key or check your billing status.',
      success: false
    });
  }
  
  // For other OpenAI errors
  res.status(503).json({ 
    error: 'OpenAI service temporarily unavailable', 
    message: openaiError.message || 'Failed to generate content',
    success: false
  });
}

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = '1024x1024', style = 'vivid' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Enhanced prompt for LinkedIn-related images
    const enhancedPrompt = `Professional image for LinkedIn about: ${prompt}. 
      Make it visually appealing and suitable for a professional social media platform.`;
    
    try {
      const response = await openai.images.generate({
        model: "dall-e-3", // or "dall-e-2" if preferred
        prompt: enhancedPrompt,
        n: 1,
        size: size,
        style: style
      });

      res.json({ 
        url: response.data[0].url,
        secure_url: response.data[0].url,
        public_id: Date.now().toString(),
        format: 'png',
        width: parseInt(size.split('x')[0]),
        height: parseInt(size.split('x')[1]),
        original_prompt: prompt,
        revised_prompt: response.data[0].revised_prompt
      });
    } catch (openaiError) {
      console.error('Error from OpenAI API:', openaiError);
      
      // Check for quota exceeded error
      if (openaiError.status === 429 || (openaiError.error && openaiError.error.type === 'insufficient_quota')) {
        return res.status(402).json({ 
          error: 'OpenAI API quota exceeded. Please check your billing details.',
          message: 'The API key has run out of credits. Please update your OpenAI API key or check your billing status.'
        });
      }
      
      // For other OpenAI errors
      res.status(503).json({ 
        error: 'OpenAI service temporarily unavailable', 
        message: openaiError.message || 'Failed to generate image'
      });
    }
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image', message: error.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/twitter', twitterRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/carousels', carouselRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/fonts', fontRoutes);

// Add carousel route handler for YouTube videos
app.post('/api/youtube-carousels', async (req, res) => {
  try {
    const { videos, userId } = req.body;
    
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one video is required' 
      });
    }
    
    // Create simple video entries with minimal processing
    const savedVideos = videos.map(video => {
      return {
        userId: userId || 'anonymous',
        id: video.id || video.videoId,
        title: video.title || 'YouTube Video',
        source: 'youtube',
        videoId: video.id || video.videoId,
        videoUrl: video.url || video.videoUrl || `https://youtube.com/watch?v=${video.id || video.videoId}`,
        thumbnailUrl: video.thumbnail || video.thumbnailUrl,
        status: 'ready', // Mark as ready immediately - no processing needed
        requestDate: new Date(),
        deliveryDate: new Date(), // Set delivery date to now since we're not processing
        slideCount: 5, // Default number of slides
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // In a real implementation, you would save these to a MongoDB collection
    // For now, just return success with the saved videos
    return res.status(200).json({
      success: true,
      message: `Successfully saved ${savedVideos.length} videos`,
      count: savedVideos.length,
      data: savedVideos
    });
  } catch (error) {
    console.error('Error saving videos:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to save videos',
      error: error.toString()
    });
  }
});

// Health check route
app.get('/health', async (req, res) => {
  const dbConnected = await checkMongoConnection();
  
  res.status(200).json({ 
    status: 'OK', 
    message: 'Lovable API is running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Error handler middleware
app.use(errorHandler);

app._router.stack
  .filter(r => r.route)
  .forEach(r => {
    console.log('✅ Registered route:', r.route.path, Object.keys(r.route.methods));
  });


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize the scheduler service when the server starts
  try {
    initScheduler().then(() => {
      console.log('Scheduler service initialized successfully');
    }).catch(err => {
      console.error('Failed to initialize scheduler service:', err);
    });
  } catch (err) {
    console.error('Error initializing scheduler service:', err);
  }
}); 