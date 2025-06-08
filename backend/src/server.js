const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
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
const stripeRoutes = require('./routes/stripeRoutes');
const { initScheduler } = require('./services/schedulerService');
const OpenAI = require('openai');
const fs = require('fs');
const cronRoutes = require('./routes/cronRoutes');
const CarouselContent = require('./models/carouselContentModel');
const cloudinary = require('cloudinary').v2;
const userLimitRoutes = require('./routes/userLimitRoutes');
const adminNotificationRoutes = require('./routes/adminNotificationRoutes');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Import the yt-dlp download script
const downloadYtDlp = require('../downloadYtDlp');

// Import the transcript API setup script
const setupTranscriptApi = require('../setup_transcript_api');

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dexlsqpbv',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
  secure: true
});

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

// *** CORS CONFIGURATION - MUST BE BEFORE OTHER MIDDLEWARE ***
const allowedOrigins = [
    'https://app.brandout.ai', 
  'http://localhost:3000',
  'http://localhost:5173',
    'https://brandout.vercel.app',
    'https://ea50-43-224-158-115.ngrok-free.app',
    'https://18cd-43-224-158-115.ngrok-free.app',
    'https://deluxe-cassata-51d628.netlify.app',
    'https://app.brandout.ai',      // New production domain
    'https://api.brandout.ai'       // New API domain
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('netlify.app')) {
      callback(null, true);
    } else {
      console.log(`Origin ${origin} not allowed by CORS policy`);
      // Still allow the request to continue, just log it as potentially unauthorized
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept-Language'],
  exposedHeaders: ['Set-Cookie']
}));

// Ensure OPTIONS requests are handled properly
app.options('*', cors());

// Add robust CORS error handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight 
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Regular middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Special handling for Stripe webhooks - needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

// Create a middleware to make raw body available for webhook verification
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook' && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    next();
  } else {
    next();
  }
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
      'text-post': `ULTIMATE MASTER PROMPT FOR LINKEDIN WRITTEN POSTS - DIRECT RESPONSE EDITION
You are an elite direct response copywriter combining Stefan Georgi's fascination mastery, Daniel Fazio's brutal directness, and Justin Welsh's transformation storytelling. You engineer LinkedIn posts that generate leads through psychological precision.

Use this YouTube transcript to create a LinkedIn text post: "${transcript || ''}"

PHASE 1: POST ANALYSIS FRAMEWORK
Primary Content Archetypes:
The Confession: "I lost/failed/discovered [specific thing]"
The Exposé: "What [industry] doesn't tell you"
The Calculator: "Here's the exact math"
The Prophet: "This change is coming"
The Simplifier: "Complex thing made simple"
The Challenger: "Everything about [topic] is wrong"
The Case Study: "[Specific] client went from X to Y"
The Breakdown: "How [successful entity] actually works"

PHASE 2: THE 10 HEADLINE FORMATS
Rotate between these proven formats:
The Secret of [blank]: Hidden knowledge reveal
Here Is a Method That Is Helping [blank] to [blank]: Social proof
Get Rid of [problem] Once and For All: Permanent solution
Are You [blank]?: Challenge/qualify reader
Have/Build a [blank] You Can Be Proud Of: Aspiration
What Everybody Ought to Know About [blank]: FOMO/curiosity
The Lazy [blank's] Way to [blank]: Easy solution
See How Easily You Can [result]: Simplicity
You Don't Have to Be [something hard] to [result]: Accessibility
Warning: [blank]: Urgency/concern

PHASE 3: FASCINATION INTEGRATION
Opening Line Fascinations:
Must use one of Stefan Georgi's 11 types:
Why: "Why [unexpected outcome] from [common action]"
How: "How I [specific achievement] in [timeframe]"
When: "When to [action] for [maximum impact]"
What: "What [group] knows that you don't"
Secret: "The secret reason [cause] creates [effect]"
List: "[Number] ways [audience] are [losing/gaining]"
Never: "Never [action] if you want [outcome]"
Contrarian: "[Belief] is backwards. Here's proof."
Named Oddity: "The '[Created Name]' principle changed everything"
Speedy: "[Timeframe] to [dramatic result]"
Plus: "[Benefit] + [unexpected bonus]"

PHASE 4: THE HOOK WRITING SYSTEM
Layer 1 - Pattern Interrupt (First line):
Use one of these 5 techniques:
Direct Address: "You're losing [specific amount] daily"
Shocking Stat: "[Percentage] of [group] fail because..."
Provocative Question: "Why do [successful group] all [action]?"
Mini Story: "[Time] ago, I [discovered/learned/realized]"
Metaphor: "[Common thing] is like [unexpected comparison]"

PHASE 5: PERSUASION ELEMENT WEAVING
Strategic Placement Guide:
Dream Encouragement: "Imagine [specific desirable state]"
Failure Justification: "If you're struggling with [problem], it's not your fault"
Fear Alleviation: "Even if you [limitation]..."
Suspicion Confirmation: "You've probably suspected [truth]"
Enemy Identification: "The old way of [practice]"

PHASE 6: CONTENT FRAMEWORKS
PAS/PASO Structure:
Problem: [Specific pain point] is costing you [consequence] (2-3 lines)
Agitate: Every day you wait, [worsening situation] (3-4 lines)
Solve: Here's what actually works: [3-5 specific points] (5-7 lines)
Outcome: After implementing this, you'll [transformation] (2-3 lines)

PHASE 7: EMOTIONAL ENGINEERING
The Dopamine Sequence:
Recognition (Lines 1-2): Mirror current state
Agitation (Lines 3-5): Amplify the pain
Hope (Lines 6-8): Introduce possibility
Teaching (Middle): Deliver the insight
Confidence (End): Make action feel easy

PHASE 8: WRITING TECHNIQUES
Sentence Rhythm Formula:
Short punch. (5-7 words)
Medium explanation that adds context. (15-20 words)
Short emphasis.
Longer sentence with specific example or data that proves your point. (20-30 words)
Reset punch.

PHASE 9: FORMATTING RULES
NO: Bold, italics, em dashes, fancy formatting
YES: Short paragraphs with line breaks
YES: Clean, readable layout
Keep: Under 1300 characters for optimal LinkedIn performance
Visual Formatting:
Line break after 2-3 lines max
Single line for each major point
Double break between major sections

PHASE 10: QUALITY CONTROL SCORECARD
Hook Effectiveness: Stops scroll instantly, creates curiosity gap
Value Delivery: Actionable insight, specific examples, clear teaching
Persuasion: Natural integration of persuasion elements
Writing Quality: Rhythm variety, clean formatting, consistent voice
Engagement: Comment trigger, shareable value, compelling CTA

REMEMBER: Create content that feels like discovering a secret hiding in plain sight. Make your reader feel brilliant for "getting it" while guiding them toward value and insight.`,
      
      'post-short': `Use this YouTube transcript to write a LinkedIn short-form written post: "${transcript || ''}"

Apply the following rules **strictly**:

1. **Completely rephrase** everything — including headings, examples, analogies, and figures.
2. **Do not use this symbol: "-"**
3. **Change every number, example, and order of pointers** to ensure it's 100 percent untraceable.
4. **Create a fresh, original headline** that is attention-grabbing and not similar to the video title.
5. **Restructure the flow** — don't just summarize sequentially. Rearrange points for originality.
6. Use **short paragraphs** and leave **one line of space between each point**.
7. Keep the entire post **under 500 words**.
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

      'carousel': `ULTIMATE MASTER PROMPT FOR LINKEDIN CAROUSEL CREATION - DIRECT RESPONSE EDITION
You are a world-class direct response marketer specialized in writing viral LinkedIn carousels. You've mastered Stefan Georgi's fascination techniques, studied the neuroscience of dopamine-driven content, and analyzed billions of views worth of content. Your mission: create carousels that stop scrolls, trigger curiosity loops, and convert viewers into clients.

Use this YouTube transcript to create a LinkedIn carousel: "${transcript || ''}"

PHASE 1: ANALYSIS PROTOCOL
When given the transcript, follow this exact process:
1. Label Assignment
Assign the content one of these archetype labels:
Hidden Metric Hunter: Reveals overlooked data/metrics that unlock growth
Contrarian Truth Teller: Challenges industry assumptions with proof
Pattern Recognizer: Shows repeating problems across multiple scenarios
System Builder: Provides step-by-step frameworks
Reality Checker: Exposes harsh truths about common practices
Transformation Catalyst: Shows before/after with specific tactics
The Experimenter: Personal test or process revealed
The Teacher: Breaks down lessons from experience
The Investigator: Reveals secrets or unknown tricks

PHASE 2: THE NEUROSCIENCE-BASED HOOK SYSTEM
Slide 1 Must Use ONE Primary Hook Type:
From Stefan Georgi's 11 Fascination Types:
The Why: "Why [unexpected outcome] happens when [action]"
The How: "How to [achieve result] using [unexpected method]"
The When: "When to [take action] for [maximum result]"
The What: "What [authority] knows about [topic] that you don't"
The Secret: "The secret reason [unexpected cause] creates [result]"
The List: "[Number] [things] that [create specific outcome]"
The Never: "Never [common action] unless you want [consequence]"
The Contrarian: "[Common belief] is wrong. Here's what works instead"
The Named Oddity: "The '[Invented Name]' method that [achieves result]"
The Speedy: "The [timeframe] trick that [delivers benefit]"
The Plus: "[Main benefit] plus [unexpected bonus benefit]"

Combined with Viral Hook Archetypes:
Fortune Teller: Predicts future changes
Paradoxical Question: Why [expected] causes [opposite]
Hidden Death Clock: [Number] signs your [aspect] is dying

The Three-Step Hook Formula (Context → Interrupt → Snapback):
Start with familiar context
Use "but/however/yet" for scroll-stop interjection
Deliver contrarian snapback that demands resolution

PHASE 3: THE 5-ELEMENT PERSUASION FRAMEWORK
Every carousel must incorporate at least 3 of these elements:
1. Encourage Their Dreams (Slides 2-3)
"Imagine [specific outcome] without [current pain]"
"What if every $1 spent returned $[specific number]?"
"Your [business] deserves [specific transformation]"

2. Justify Their Failures (Slides 4-5)
"It's not your [skill] that's lacking—it's [system/strategy]"
"You didn't fail—you were using [outdated method]"
"The reason you're stuck isn't [obvious reason]—it's [hidden cause]"

3. Allay Their Fears (Slides 6-7)
"Worried about [specific fear]? [Percentage]% see results in [timeframe]"
"Even if you [limitation], this works because [reason]"
"Think [solution] is too [adjective]? Here's why it's actually [opposite]"

4. Confirm Their Suspicions (Throughout)
"You've probably noticed [industry problem]"
"Yes, [common belief] is actually [hurting/helping] you"
"Most [professionals] won't admit this, but [truth]"

5. Throw Rocks at Enemies (Slides 8-9)
"[Traditional method] wastes [specific resource]"
"[Competitors] still use [outdated approach] from [year]"
"Big [industry] wants you to believe [myth] because [reason]"

PHASE 4: CONTENT STRUCTURE FRAMEWORKS
Use PAS/PASO Framework Flow:
Problem (Slides 2-3): Agitate pain vividly
Agitate (Slides 4-5): Make it urgent with consequences
Solution (Slides 6-8): Progressive revelation
Outcome (Slides 9-10): Paint transformation picture

PHASE 5: STEFAN GEORGI'S CURIOSITY TECHNIQUES
Opening Curiosity Bullets:
Use incomplete stories: Start narrative, delay conclusion
Ask questions without immediate answers
Promise revelations "later" or "in a moment"
Create "itch" they must scratch by continuing

Middle Slide Curiosity Builders:
Bass Fishing Method: Multiple small hooks throughout
Cocaine Effect: Build anticipation for payoff
Open Loop Stacking: Never fully close loops until end
Riddle Engineering: Present puzzles that demand solving

Named Oddity Creation:
Take ordinary concept → Give it intriguing name
Example: "Weeping Willow Syndrome" for hormone deficiency
Example: "Peking Duck Grip" for technique
Example: "Black Chalk Equation" for prediction method

PHASE 6: HOOK ENHANCEMENT TECHNIQUES
From Ultimate Viral Hooks Guide:
Use numbers: Eye-catching and quantify ease
Be specific: "83,756" beats "about 80k"
Keep short: 1-2 lines maximum
Add ease indicators: "simple," "fast," "easy"
Clarity over cleverness: Don't make them think
Visual alignment: Match text with imagery
Staccato rhythm: Short, punchy sentences

The 5 Hook Techniques to Rotate:
Speak Directly: "You" language, personalized
Shocking Statistic: "80% of marketers believe..."
Relevant Question: Target audience pain directly
Personal Story: Brief, relatable anecdote
Analogy/Metaphor: Complex idea made simple

PHASE 7: THE DOPAMINE DELIVERY SYSTEM
Based on Neuroscience of Curiosity:
Create Discomfort (Slide 1): Knowledge gap activation
Promise Resolution (Slide 2): Tease the payoff
Build Rapport (Slides 3-4): "I've been there too"
Progressive Teaching (Slides 5-8): Resolve curiosity gradually
Reward + New Loop (Slides 9-10): Satisfy then re-engage

Emotional Conversion Sequence:
Start with recognition ("That's me!")
Move to concern ("This is serious")
Build to hope ("There's a way")
End with confidence ("I can do this")

PHASE 8: TACTICAL FORMATTING RULES
From LinkedIn Rulebook:
NO: Bold, italics, em dashes, fancy formatting
YES: Hyphens for points (not bullets or dots)
YES: One-line gaps between points
YES: Clean, readable layout
Keep: Under 2000 characters total
Format: 10 slides optimal (6 minimum, 11 maximum)

Slide-by-Slide Structure:
Slide 1: Hook + one-line subheading
Slides 2-3: Problem/pain amplification
Slides 4-6: Solution building
Slides 7-8: Proof/credibility
Slide 9: Soft mention of help
Slide 10: Recap + conversation starter

PHASE 9: CLIENT ADAPTATION PROTOCOL
The 4-Layer Transformation:
Surface: Change ALL names, numbers, companies
Context: Shift industry while keeping problem type
Details: Create new examples proving same points
Voice: Match client's sophistication and terminology

PHASE 10: QUALITY ASSURANCE CHECKLIST
Hook Power (Slide 1):
[ ] Uses one of 11 fascination types
[ ] Creates immediate curiosity gap
[ ] Includes specific number/timeframe
[ ] Speaks to exact audience pain
[ ] Would stop YOUR scroll

Persuasion Integration:
[ ] 3+ persuasion elements woven naturally
[ ] Dreams feel achievable
[ ] Failures justified without condescension
[ ] Fears addressed with proof
[ ] Enemies are systems, not people

Curiosity Management:
[ ] Each slide creates hunger for next
[ ] Open loops maintained throughout
[ ] Payoff worth the buildup
[ ] New curiosity opened at end

Value Delivery:
[ ] Actionable insight provided
[ ] Examples memorable and specific
[ ] Complex ideas simplified
[ ] Reader feels smarter

Technical Compliance:
[ ] No bold/italics/em dashes
[ ] Hyphenated points only
[ ] Under 2000 characters
[ ] Mobile-optimized spacing
[ ] 10 slides (±1)

REMEMBER: Great copy feels like discovering a secret that was hiding in plain sight. Make your reader feel brilliant for "getting it" while you guide them invisibly toward the solution. Each slide must build curiosity, deliver value, and advance the psychological sale through fascination, emotion, and strategic persuasion.

Separate each slide with "\n\n" to indicate a new slide.`
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

// Root route handler
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Brandout API Server is running successfully!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      onboarding: '/api/onboarding',
      teams: '/api/teams',
      linkedin: '/api/linkedin',
      twitter: '/api/twitter',
      youtube: '/api/youtube',
      posts: '/api/posts',
      carousels: '/api/carousels',
      fonts: '/api/fonts',
      cron: '/api/cron',
      userLimits: '/api/user-limits',
      stripe: '/api/stripe',
      notifications: '/api/notifications',
      admin: '/api/admin'
    }
  });
});

// API health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
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
app.use('/api/fonts', fontRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/user-limits', userLimitRoutes);
app.use('/api/stripe', stripeRoutes);
// Add notification routes
app.use('/api/notifications', require('./routes/notificationRoutes'));
// Admin routes
app.use('/api/admin', require('./routes/adminRoutes'));
// Admin notification routes
app.use('/api/admin/notifications', require('./routes/adminNotificationRoutes'));

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
    
    // Create video entries with transcript validation
    const savedVideos = videos.map(video => {
      // Check if the video has a valid transcript
      const hasTranscript = (
        (video.transcript && typeof video.transcript === 'string' && video.transcript.trim().length > 10) ||
        (video.formattedTranscript && Array.isArray(video.formattedTranscript) && 
          video.formattedTranscript.length > 0 && 
          video.formattedTranscript.some(point => point && point.trim().length > 10))
      );
      
      return {
        userId: userId || 'anonymous',
        id: video.id || video.videoId,
        title: video.title || 'YouTube Video',
        source: 'youtube',
        videoId: video.id || video.videoId,
        videoUrl: video.url || video.videoUrl || `https://youtube.com/watch?v=${video.id || video.videoId}`,
        thumbnailUrl: video.thumbnail || video.thumbnailUrl,
        // Only mark as ready if there's a valid transcript
        status: hasTranscript ? 'ready' : 'needs_transcript',
        transcript: video.transcript || null,
        formattedTranscript: video.formattedTranscript || null,
        hasTranscript: hasTranscript,
        requestDate: new Date(),
        deliveryDate: hasTranscript ? new Date() : null, // Only set delivery date if transcript exists
        slideCount: hasTranscript ? 5 : 0, // Default number of slides if transcript exists
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // Filter videos that have transcripts for carousel creation
    const readyVideos = savedVideos.filter(video => video.hasTranscript);
    
    // In a real implementation, you would save these to a MongoDB collection
    // For now, just return success with the saved videos
    return res.status(200).json({
      success: true,
      message: `Successfully saved ${savedVideos.length} videos (${readyVideos.length} ready for carousel creation)`,
      count: savedVideos.length,
      readyCount: readyVideos.length,
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

// Add a new endpoint for yt-dlp transcript extraction
app.post('/api/youtube/transcript-yt-dlp', async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video ID is required' 
      });
    }
    
    const fs = require('fs');
    const { exec } = require('child_process');
    const path = require('path');
    const util = require('util');
    const execPromise = util.promisify(exec);
    const os = require('os');
    
    // Create directory for transcripts if it doesn't exist
    const transcriptsDir = path.join(process.cwd(), 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const outputFileName = path.join(transcriptsDir, `${videoId}.json`);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`Extracting transcript for video ${videoId} using yt-dlp`);
    
    // First check if we already have this transcript saved
    if (fs.existsSync(outputFileName)) {
      try {
        const savedTranscript = JSON.parse(fs.readFileSync(outputFileName, 'utf8'));
        if (savedTranscript && savedTranscript.transcript) {
          console.log(`Found existing transcript for ${videoId}`);
          return res.json({
            success: true,
            message: 'Transcript loaded from cache',
            transcript: savedTranscript.transcript,
            language: savedTranscript.language || 'en',
            is_generated: savedTranscript.is_generated || false,
            // Include metadata if available in the saved file
            duration: savedTranscript.duration || 'N/A',
            thumbnail: savedTranscript.thumbnail || '',
            title: savedTranscript.title || '',
            channelName: savedTranscript.channelName || '',
            viewCount: savedTranscript.viewCount || 0,
            uploadDate: savedTranscript.uploadDate || '',
            formattedTranscript: savedTranscript.formattedTranscript || 
              formatTranscriptToBulletPoints(savedTranscript.transcript)
          });
        }
      } catch (readError) {
        console.error('Error reading existing transcript:', readError);
      }
    }
    
    // Determine the correct yt-dlp binary based on platform
    let ytDlpCommand;
    
    // Check if running on render.com or similar cloud platform (Linux)
    const isCloud = process.env.RENDER || process.env.NODE_ENV === 'production';
    const isWindows = os.platform() === 'win32';
    
    // Try first with local binary, then fallback to global command
    if (isWindows) {
      // Windows setup with .exe
      const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp.exe');
      ytDlpCommand = fs.existsSync(ytDlpPath) ? `"${ytDlpPath}"` : 'yt-dlp';
    } else {
      // Linux/Unix setup
      const ytDlpPath = path.join(process.cwd(), 'src', 'yt-dlp');
      if (fs.existsSync(ytDlpPath)) {
        // Make sure the binary is executable
        try {
          await execPromise(`chmod +x "${ytDlpPath}"`);
          ytDlpCommand = `"${ytDlpPath}"`;
        } catch (chmodError) {
          console.error('Error making yt-dlp executable:', chmodError);
          ytDlpCommand = 'yt-dlp'; // Fallback to global command
        }
      } else if (isCloud) {
        // On cloud, try installing yt-dlp on demand if not available
        try {
          console.log('Attempting to install yt-dlp on cloud platform...');
          await execPromise('pip install yt-dlp');
          ytDlpCommand = 'yt-dlp';
        } catch (installError) {
          console.error('Error installing yt-dlp:', installError);
          // Fallback to manual transcript approach
          return res.status(500).json({
            success: false,
            message: 'yt-dlp not available on server. Please try the alternative transcript method.',
            error: 'yt-dlp not installed'
          });
        }
      } else {
        ytDlpCommand = 'yt-dlp'; // Try global command
      }
    }
    
    // Command for yt-dlp to extract subtitles
    const command = `${ytDlpCommand} --write-auto-sub --sub-lang en --skip-download --write-subs --sub-format json3 --cookies "${path.join(process.cwd(), 'src', 'cookies', 'www.youtube.com_cookies.txt')}" --paths "transcripts" "${videoUrl}"`;
    
    // Add a separate command to fetch video metadata including duration
    const metadataCommand = `${ytDlpCommand} -J "${videoUrl}"`;
    
    try {
      // First fetch video metadata to get duration
      let duration = "N/A";
      let thumbnail = "";
      let title = "";
      let channelName = "";
      let viewCount = 0;
      let uploadDate = "";
      
      try {
        const { stdout: metadataOutput } = await execPromise(metadataCommand);
        const metadata = JSON.parse(metadataOutput);
        
        // Extract relevant metadata
        duration = metadata.duration ? formatDuration(metadata.duration) : "N/A";
        thumbnail = metadata.thumbnail || "";
        title = metadata.title || "";
        channelName = metadata.channel || metadata.uploader || "";
        viewCount = metadata.view_count || 0;
        uploadDate = metadata.upload_date || "";
        
        console.log(`Video metadata fetched successfully for ${videoId}, duration: ${duration}`);
      } catch (metadataError) {
        console.error('Error fetching video metadata:', metadataError);
        // Continue with transcript extraction even if metadata fails
      }
      
      // Then proceed with transcript extraction
      const { stdout, stderr } = await execPromise(command);
      console.log('yt-dlp output:', stdout);
      
      if (stderr) {
        console.error('yt-dlp stderr:', stderr);
      }
      
      // Look for the generated subtitle file
      const files = fs.readdirSync(process.cwd());
      const subtitleFile = files.find(file => file.includes(videoId) && (file.endsWith('.en.vtt') || file.endsWith('.en.json3')));
      
      if (!subtitleFile) {
        throw new Error('No subtitle file generated');
      }
      
      // Read and parse the subtitle content
      const subtitleContent = fs.readFileSync(subtitleFile, 'utf8');
      let transcriptText = '';
      let is_generated = false;
      
      if (subtitleFile.endsWith('.json3')) {
        // Parse JSON format
        const subtitleJson = JSON.parse(subtitleContent);
        transcriptText = subtitleJson.events
          .filter(event => event.segs && event.segs.length > 0)
          .map(event => event.segs.map(seg => seg.utf8).join(' '))
          .join(' ');
        is_generated = subtitleFile.includes('auto');
      } else if (subtitleFile.endsWith('.vtt')) {
        // Parse VTT format - simple approach
        transcriptText = subtitleContent
          .split('\n')
          .filter(line => !line.includes('-->') && !line.match(/^\d+$/) && !line.match(/^\s*$/))
          .join(' ')
          .replace(/<[^>]*>/g, ''); // Remove HTML tags
        is_generated = subtitleFile.includes('auto');
      }
      
      // Clean up the extracted files
      fs.unlinkSync(subtitleFile);
      
      // Save the transcript to our JSON file for future use
      const transcriptData = {
        transcript: transcriptText,
        language: 'en',
        is_generated: is_generated,
        extractedAt: new Date().toISOString(),
        duration: duration,
        thumbnail: thumbnail,
        title: title,
        channelName: channelName,
        viewCount: viewCount,
        uploadDate: uploadDate
      };
      
      fs.writeFileSync(outputFileName, JSON.stringify(transcriptData, null, 2));
      
      // Format the transcript into bullet points for carousel use
      const formattedTranscript = formatTranscriptToBulletPoints(transcriptText);
      
      return res.json({
        success: true,
        message: 'Transcript extracted successfully',
        transcript: transcriptText,
        formattedTranscript: formattedTranscript,
        language: 'en',
        is_generated: is_generated,
        // Include video metadata in the response
        duration: duration,
        thumbnail: thumbnail,
        title: title,
        channelName: channelName,
        viewCount: viewCount,
        uploadDate: uploadDate
      });
    } catch (error) {
      console.error('Error extracting transcript with yt-dlp:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to extract transcript with yt-dlp',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Error in transcript-yt-dlp endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing transcript request',
      error: error.message
    });
  }
});

// Helper function to format transcript into bullet points
function formatTranscriptToBulletPoints(text) {
  if (!text || text.length < 10) return [];
  
  // Split by sentences and create meaningful bullet points
  const sentences = text.replace(/([.?!])\s+/g, "$1|").split("|");
  const bulletPoints = [];
  
  // Process sentences to create meaningful bullet points
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    
    // Only include meaningful sentences with proper length
    if (sentence.length > 15 && sentence.length < 200) {
      // Filter out timestamps, speaker identification, and other non-content
      if (!sentence.match(/^\d+:\d+/) && !sentence.match(/^speaker\s\d+:/i)) {
        bulletPoints.push(sentence);
        
        // Limit to 8 bullet points for carousel use
        if (bulletPoints.length >= 8) break;
      }
    }
  }
  
  // If we couldn't extract meaningful bullets, create some based on the text length
  if (bulletPoints.length === 0) {
    const words = text.split(' ');
    const chunkSize = Math.floor(words.length / 8);
    
    for (let i = 0; i < 8; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, words.length);
      const chunk = words.slice(start, end).join(' ');
      
      if (chunk.length > 10) {
        bulletPoints.push(chunk);
      }
    }
  }
  
  return bulletPoints.length > 0 ? bulletPoints : ["No meaningful transcript content available"];
}

// Helper function to format seconds into a human-readable duration (MM:SS)
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "N/A";
  
  // Convert to integer
  const totalSeconds = Math.floor(seconds);
  
  // Calculate hours, minutes, seconds
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  
  // Format as HH:MM:SS or MM:SS
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

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

// Add detailed error logging middleware with CORS headers
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  
  // Set CORS headers even in error responses
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Send error response
  res.status(500).json({
    success: false,
    message: 'Server error',
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

app._router.stack
  .filter(r => r.route)
  .forEach(r => {
    console.log('✅ Registered route:', r.route.path, Object.keys(r.route.methods));
  });

// Add a delete video endpoint
app.post('/api/youtube/delete-video', async (req, res) => {
  try {
    const { videoId, userId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video ID is required' 
      });
    }
    
    // In a real application, you would delete from your database
    // For example: await Video.findOneAndDelete({ videoId, userId });
    console.log(`Deleting video ${videoId} for user ${userId || 'anonymous'}`);
    
    // For our simple implementation, we'll just return success
    // since the actual deletion happens on the client side in localStorage
    return res.status(200).json({
      success: true,
      message: 'Video deleted successfully',
      videoId: videoId
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete video',
      error: error.toString()
    });
  }
});

// Add carousel contents endpoints
// In-memory storage for carousel content (replace with database in production)
let carouselContents = [];

// POST endpoint to save carousel content
app.post('/api/carousel-contents', async (req, res) => {
  try {
    const { content, userId } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content object is required' 
      });
    }
    
    console.log(`Saving carousel content for user ${userId || 'anonymous'}:`, content.id);
    
    // Check if this content already exists (using the ID)
    const existingContent = await CarouselContent.findOne({ id: content.id });
    
    if (existingContent) {
      // Update the existing content
      existingContent.title = content.title;
      existingContent.content = content.content;
      existingContent.type = content.type;
      existingContent.videoId = content.videoId || null;
      existingContent.videoTitle = content.videoTitle || null;
      existingContent.updatedAt = new Date();
      
      await existingContent.save();
      
      return res.status(200).json({
        success: true,
        message: 'Content updated successfully',
        data: existingContent
      });
    }
    
    // Create a new content document
    const newContent = new CarouselContent({
      id: content.id,
      userId: userId || 'anonymous',
      title: content.title,
      content: content.content,
      type: content.type,
      videoId: content.videoId || null,
      videoTitle: content.videoTitle || null,
      createdAt: content.createdAt || new Date(),
      updatedAt: new Date()
    });
    
    // Save to MongoDB
    await newContent.save();
    
    return res.status(201).json({
      success: true,
      message: 'Content saved successfully',
      data: newContent
    });
  } catch (error) {
    console.error('Error saving carousel content:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to save content',
      error: error.toString()
    });
  }
});

// GET endpoint to retrieve carousel contents for a user
app.get('/api/carousel-contents', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Find all content for this user, sorted by createdAt (newest first)
    const userContents = await CarouselContent.find({ userId })
      .sort({ createdAt: -1 });
    
    return res.status(200).json({
      success: true,
      message: `Found ${userContents.length} saved contents for user`,
      data: userContents
    });
  } catch (error) {
    console.error('Error retrieving carousel contents:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to retrieve contents',
      error: error.toString()
    });
  }
});

// DELETE endpoint to remove a carousel content
app.delete('/api/carousel-contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content ID is required' 
      });
    }
    
    // Find and delete the content
    const deletedContent = await CarouselContent.findOneAndDelete({ 
      id: id,
      userId: userId || 'anonymous'
    });
    
    if (!deletedContent) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }
    
    console.log(`Deleted carousel content ${id} for user ${userId || 'anonymous'}`);
    
    return res.status(200).json({
      success: true,
      message: 'Content deleted successfully',
      contentId: id
    });
  } catch (error) {
    console.error('Error deleting carousel content:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete content',
      error: error.toString()
    });
  }
});

// Register routes
app.use('/api/user-limits', userLimitRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Download and setup yt-dlp binary for transcript extraction
  try {
    console.log('Setting up yt-dlp binary for transcript extraction...');
    downloadYtDlp().then(() => {
      console.log('yt-dlp binary setup completed successfully');
    }).catch(err => {
      console.error('Error setting up yt-dlp binary:', err);
      console.log('Transcript extraction functionality might be limited');
    });
  } catch (error) {
    console.error('Failed to setup yt-dlp:', error);
  }
  
  // Setup youtube-transcript-api for Python extraction
  try {
    console.log('Setting up youtube-transcript-api...');
    
    // Use system Python for initial setup if virtual environment is not ready
    const isProd = process.env.NODE_ENV === 'production';
    let pythonCmd = isProd ? 'python3' : 'python';
    
    // Try to install youtube-transcript-api
    try {
      const { stdout, stderr } = await execPromise(`${pythonCmd} -m pip install youtube-transcript-api`);
      if (stderr) {
        console.error('Warning during package installation:', stderr);
      }
      console.log('youtube-transcript-api installed successfully');
    } catch (pipError) {
      console.error('Error installing package:', pipError);
    }
    
    // Now use virtual environment Python for testing
    const pythonExecutable = path.join(process.cwd(), 'venv',
      process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
    
    const scriptPath = path.join(__dirname, 'transcript_fetcher.py');
    
    // Make the script executable on Unix systems
    if (process.platform !== 'win32') {
      try {
        await execPromise(`chmod +x "${scriptPath}"`);
        console.log('Made transcript_fetcher.py executable');
      } catch (chmodError) {
        console.error('Error making script executable:', chmodError);
      }
    }
    
    // Test the script
    try {
      const { stdout, stderr } = await execPromise(`"${pythonExecutable}" "${scriptPath}" --test`);
      if (stderr) {
        console.error('Error testing youtube-transcript-api:', stderr);
      } else {
        console.log('youtube-transcript-api setup completed successfully');
      }
    } catch (testError) {
      console.error('Error testing transcript fetcher:', testError);
    }
  } catch (error) {
    console.error('Failed to setup youtube-transcript-api:', error);
  }
  
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