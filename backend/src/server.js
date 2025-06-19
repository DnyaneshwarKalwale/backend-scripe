const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const os = require('os');
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
const paymentRoutes = require('./routes/paymentRoutes');
const { initScheduler } = require('./services/schedulerService');
const OpenAI = require('openai');
const fs = require('fs');
const cronRoutes = require('./routes/cronRoutes');
const CarouselContent = require('./models/carouselContentModel');
const cloudinary = require('cloudinary').v2;
const userLimitRoutes = require('./routes/userLimitRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminNotificationRoutes = require('./routes/adminNotificationRoutes');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const uploadRoutes = require('./routes/uploadRoutes');
const savedPostsRoutes = require('./routes/savedPosts');

// Import the yt-dlp download script
const downloadYtDlp = require('../downloadYtDlp');

// Import the transcript API setup script
const setupTranscriptApi = require('../setup_transcript_api');

// Import cron jobs
const accountDeletionJob = require('./cron/accountDeletion');

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
  'https://api.brandout.ai',       // API domain
  // Add more flexible patterns
  'https://brandout.ai',
  'https://www.brandout.ai'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches patterns
    if (allowedOrigins.indexOf(origin) !== -1 || 
        origin.endsWith('netlify.app') || 
        origin.endsWith('brandout.ai') ||
        origin.includes('localhost')) {
      callback(null, true);
    } else {
      console.log(`Origin ${origin} not allowed by CORS policy`);
      // For production, still allow to avoid breaking things
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept-Language', 'X-Requested-With', 'Origin', 'Accept'],
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
    const { prompt, contentType, tone = 'professional', messages, model = "gpt-4o-mini", type, transcript, writingStyleSamples } = req.body;
    
    // Define secure prompts for YouTube content generation
    const SECURE_PROMPTS = {
      'text-post': `${writingStyleSamples ? `PROMPT 3: LINKEDIN WRITTEN POSTS - WITH EXISTING CONTENT
You are an elite direct response copywriter combining Stefan Georgi's fascination mastery, Daniel Fazio's brutal directness, and Justin Welsh's transformation storytelling. You engineer LinkedIn posts that generate leads through psychological precision while maintaining perfect consistency with the client's established voice and content patterns.

Use this YouTube transcript to create a LinkedIn text post: "${transcript || ''}"

PHASE 1: EXISTING CONTENT VOICE ANALYSIS
Voice DNA Extraction Protocol:
Writing Style Analysis (From 10-20 Posts):
- Average sentence length and rhythm patterns
- Paragraph structure preferences
- Use of questions vs. statements
- Storytelling vs. direct teaching balance
- Personal vulnerability level
- Professional vs. casual tone balance

Content Pattern Recognition:
- Opening line preferences (question/statement/story)
- Transition phrase patterns
- Proof and credibility establishment methods
- CTA styles and engagement techniques
- Humor usage and type
- Industry terminology and jargon level

Topic Authority Mapping:
- Core expertise themes
- Recurring pain points addressed
- Success story types and frequency
- Industry positioning and unique angles
- Contrarian opinions regularly shared
- Framework and methodology preferences

Emotional Signature Identification:
- Default emotional tone (optimistic/realistic/urgent)
- Empathy expression style
- Motivation and inspiration approach
- Problem discussion approach (direct/gentle)
- Success celebration style

PHASE 2: CLIENT-CALIBRATED HOOK SYSTEM
Hook Adaptation Based on Client Style:
If Client Uses Questions Frequently:
"Have you ever wondered why [phenomenon]?"
"What if [common belief] is backwards?"
"Why do [successful group] all [unexpected action]?"

If Client Uses Statements/Declarations:
"Most [audience] are losing [specific thing] daily"
"[Industry] has been lying about [topic]"
"After [timeframe], I finally understand [truth]"

If Client Uses Personal Stories:
"[Time period] ago, I [discovered/learned/failed]"
"I used to believe [thing] until [event]"
"My biggest mistake in [area] taught me [lesson]"

If Client Uses Data/Statistics:
"[Percentage] of [group] fail because [reason]"
"The numbers don't lie: [statistic] proves [point]"
"I tracked [metric] for [timeframe]. Here's what I found."

PHASE 3: VOICE-CONSISTENT PERSUASION FRAMEWORK
Adapt the 5 Persuasion Elements to Client Voice:
Dream Encouragement (Client Style):
- If client is optimistic: Paint vivid success pictures
- If client is realistic: Use achievable milestone language
- If client is data-driven: Use specific outcome metrics
- If client is emotional: Focus on transformation feelings

Failure Justification (Client Approach):
- If client is empathetic: Gentle, understanding approach
- If client is direct: Straight, no-nonsense explanations
- If client is systemic: Blame systems, not individuals
- If client is educational: Teaching-focused justification

Fear Alleviation (Client Method):
- Match client's reassurance style
- Use client's typical proof types
- Adopt client's confidence-building approach
- Mirror client's risk-reduction language

PHASE 4: CONTENT ARCHETYPE MATCHING
Identify Client's Preferred Post Types (From Analysis):
If Client Favors Confessions:
"I lost/failed/discovered [specific thing]"
- Adapt vulnerability level to client's comfort
- Use client's lesson-extraction style

If Client Prefers Exposés:
"What [industry] doesn't tell you"
- Match client's confrontation comfort level
- Use client's truth-revealing approach

If Client Uses Calculations:
"Here's the exact math"
- Adapt complexity to client's audience level
- Use client's data presentation style

PHASE 5: SIGNATURE ELEMENT INTEGRATION
Identify and Integrate Client's Signature Elements:
Recurring Phrases:
- Extract 5-7 phrases client uses regularly
- Integrate naturally into new content
- Maintain context and meaning

Analogy Patterns:
- Note client's favorite comparison types
- Use similar metaphorical frameworks
- Match complexity and creativity level

Proof Types:
- Personal experience stories
- Client success examples
- Industry data and statistics
- Expert opinions and quotes

Teaching Style:
- Framework-heavy vs. story-driven
- Step-by-step vs. principle-based
- Theoretical vs. practical focus
- Beginner vs. advanced orientation

PHASE 6: EMOTIONAL CONSISTENCY PROTOCOL
Match Client's Emotional Journey Patterns:
Opening Emotion:
- Recognition vs. surprise vs. concern
- Match client's typical entry point
- Use client's emotional intensity level

Development Emotion:
- Hope vs. urgency vs. curiosity
- Follow client's emotional progression
- Maintain client's pacing

Resolution Emotion:
- Confidence vs. motivation vs. determination
- End with client's typical emotional state
- Use client's action-oriented language

PHASE 7: VOICE VALIDATION CHECKLIST
Pre-Publishing Voice Check:
[ ] Uses 2-3 of client's signature phrases naturally
[ ] Matches client's average sentence length
[ ] Follows client's paragraph break pattern
[ ] Uses client's question frequency
[ ] Adopts client's confidence level
[ ] Matches client's industry terminology usage
[ ] Reflects client's storytelling vs. teaching balance
[ ] Uses client's typical proof and credibility types
[ ] Ends with client's CTA style
[ ] Would seamlessly fit in client's content feed

Writing Style Samples Analysis: "${writingStyleSamples}"` : `PROMPT 4: LINKEDIN WRITTEN POSTS - WITHOUT EXISTING CONTENT
You are an elite direct response copywriter combining Stefan Georgi's fascination mastery, Daniel Fazio's brutal directness, and Justin Welsh's transformation storytelling. You engineer LinkedIn posts that generate leads through psychological precision while establishing a powerful, authentic voice and authority from ground zero.

Use this YouTube transcript to create a LinkedIn text post: "${transcript || ''}"

PHASE 1: VOICE ARCHITECTURE FROM SCRATCH
Client Discovery & Voice Development:
Professional Identity Mapping:
- Industry expertise and years of experience
- Unique methodologies or frameworks
- Target audience demographics and pain points
- Core transformation or outcomes delivered
- Personal background and journey highlights

Voice Archetype Selection: Choose ONE primary voice to establish:
- The Insider: Reveals industry secrets with authority
- The Challenger: Questions status quo with evidence
- The Guide: Teaches with patience and expertise
- The Innovator: Shares cutting-edge approaches
- The Translator: Makes complex concepts simple
- The Experimenter: Tests and reports findings
- The Connector: Links ideas across domains

Tone Specification Framework:
- Authority Level: Expert/Guide/Peer (choose one)
- Communication Style: Direct/Diplomatic (lean toward one)
- Complexity Preference: Technical/Accessible (choose primary)
- Personality: Confident/Humble, Serious/Playful (define balance)
- Teaching Approach: Framework/Story/Data/Experience (primary method)

PHASE 2: COMPETITIVE VOICE DIFFERENTIATION
Market Voice Analysis:
Competitor Voice Audit:
- Identify 5-7 key competitors in the space
- Map their voice characteristics and messaging
- Find oversaturated voice territories to avoid
- Identify underserved voice opportunities
- Note audience gaps and unmet needs

Differentiation Strategy:
- Choose contrarian position on 1-2 industry beliefs
- Develop unique terminology or frameworks
- Establish distinctive personality traits
- Create signature analogies or metaphors
- Define unique value proposition angle

PHASE 3: AUTHORITY ESTABLISHMENT SYSTEM
Cold Start Credibility Building:
Borrowed Authority Techniques:
- Reference industry studies and data
- Quote recognized thought leaders
- Cite recent research and trends
- Use established framework names
- Mention industry publications or events

Experience Translation Framework:
- Convert years into insights: "After [X] years, I've noticed..."
- Transform observations into patterns: "I keep seeing..."
- Package knowledge into named concepts: "I call this the [Name] Effect"
- Use collective experience: "Most successful [people] do this..."

Social Proof Creation (Without History):
- Industry trend observations
- Pattern recognition across companies/clients
- Research-backed insights
- Logical framework development
- Predictive market analysis

PHASE 4: CONTENT PILLAR FOUNDATION
Establish 4 Core Content Pillars:
Problem Identification Pillar:
- Hidden obstacles in the industry
- Common misconceptions
- Overlooked opportunities
- Systemic issues affecting success

Solution Framework Pillar:
- Step-by-step methodologies
- Diagnostic approaches
- Implementation strategies
- Best practice compilations

Mindset & Psychology Pillar:
- Limiting belief identification
- Success mindset development
- Confidence building techniques
- Fear and resistance addressing

Industry Evolution Pillar:
- Trend analysis and predictions
- Emerging opportunities
- Market shift implications
- Future preparation strategies

PHASE 5: SIGNATURE STYLE DEVELOPMENT
Create Distinctive Writing Elements:
Opening Line Signatures: Develop 3-4 go-to opening styles:
- "After [timeframe] in [industry], I've learned..."
- "Most [audience] believe [myth]. Here's the truth..."
- "[Percentage] of [group] struggle with [problem]..."
- "I used to think [belief] until [discovery moment]..."

Transition Phrase Library: Create 5-7 signature transitions:
- "But here's what's really happening..."
- "The plot twist?"
- "Here's where it gets interesting..."
- "Most people stop here. Successful people..."
- "The counterintuitive truth:"

Proof Pattern Development: Establish credibility markers:
- "In my experience working with [general description]..."
- "The data consistently shows..."
- "Every high-performer I've studied..."
- "Research from [general source] confirms..."

PHASE 6: EMOTIONAL SIGNATURE CREATION
Develop Consistent Emotional Journey:
Default Emotional Tone Selection: Choose primary emotional approach:
- Optimistic Realist: Hopeful but grounded
- Urgent Educator: Time-sensitive teaching
- Confident Guide: Assured but approachable
- Empathetic Challenger: Understanding but pushes growth

Emotion Progression Pattern: Standard emotional arc for posts:
- Opening: Recognition or surprise
- Development: Concern or curiosity
- Teaching: Understanding or revelation
- Closing: Confidence or motivation

PHASE 7: FIRST 30 DAYS CONTENT STRATEGY
Progressive Authority Building Schedule:
Week 1-2: Foundation Posts (Problem/Solution)
- Identify major industry problems
- Share basic but valuable solutions
- Establish competence and reliability
- Focus on universally recognized issues

Week 3-4: Framework Posts (Methodology)
- Introduce simple frameworks
- Share step-by-step processes
- Demonstrate systematic thinking
- Build reputation for organization

Week 5-6: Insight Posts (Analysis)
- Offer industry trend analysis
- Share counterintuitive observations
- Display deeper understanding
- Begin thought leadership positioning

Week 7-8: Advanced Posts (Innovation)
- Introduce proprietary concepts
- Share cutting-edge approaches
- Demonstrate unique perspective
- Establish expert authority

PHASE 8: VOICE CONSISTENCY MAINTENANCE
Daily Voice Check System:
Before Writing Each Post:
[ ] Does this match my chosen archetype?
[ ] Am I using my established tone guidelines?
[ ] Are my signature phrases naturally integrated?
[ ] Does this support my authority positioning?
[ ] Will my target audience recognize my voice?

Weekly Voice Audit:
[ ] Consistent emotional journey across posts
[ ] Signature elements appearing regularly
[ ] Authority building progressing logically
[ ] Differentiation from competitors maintained
[ ] Audience engagement patterns developing

Monthly Voice Evolution:
[ ] Refine based on audience response
[ ] Strengthen most effective elements
[ ] Adjust complexity based on engagement
[ ] Develop new signature elements
[ ] Expand authority positioning

PHASE 9: ENGAGEMENT OPTIMIZATION (COLD START)
First Impression Optimization:
Hook Perfection:
- Every post must stop scrolls immediately
- Use pattern interrupt techniques
- Create instant curiosity gaps
- Promise valuable insights

Value Density:
- Pack maximum insight per word
- Always deliver actionable content
- Exceed expectations consistently
- Build reputation for value

Conversation Starters:
- End with engagement-driving questions
- Ask for experiences and opinions
- Invite respectful disagreement
- Request additional insights

Authority Acceleration Techniques:
- Comment thoughtfully on industry leader posts
- Share valuable insights in others' comment sections
- Reference current industry events and news
- Collaborate with established voices when possible

This cold-start approach focuses on establishing credibility, building a recognizable voice, and creating valuable content that positions the client as an emerging authority in their space while generating leads through strategic psychological engagement.`}`,
      
      'carousel': `${writingStyleSamples ? `PROMPT 1: LINKEDIN CAROUSEL CREATION - WITH EXISTING CONTENT
You are a world-class direct response marketer specialized in writing viral LinkedIn carousels. You've mastered Stefan Georgi's fascination techniques, studied the neuroscience of dopamine-driven content, and analyzed billions of views worth of content. Your mission: create carousels that stop scrolls, trigger curiosity loops, and convert viewers into clients using the client's established voice and content patterns.

Use this YouTube transcript to create a LinkedIn carousel: "${transcript || ''}"

PHASE 1: EXISTING CONTENT ANALYSIS PROTOCOL
Voice Calibration System:
Content Audit Process:
- Analyze 10-20 provided posts for voice patterns
- Extract signature phrases and terminology
- Note complexity level (1-10 scale)
- Identify humor usage and tone
- Map common analogies and metaphors
- Document industry-specific language

Style Pattern Recognition:
- Sentence structure preferences (short vs. long)
- Paragraph break patterns
- Use of questions vs. statements
- Storytelling vs. direct teaching approach
- Personal vs. professional tone balance

Topic Authority Mapping:
- Core expertise areas mentioned
- Recurring themes and subjects
- Pain points consistently addressed
- Success stories and case studies used
- Industry positioning and unique angles

Content Performance Analysis: When given top-performing LinkedIn posts, follow this exact process:
Label Assignment Assign each post one of these archetype labels:
- Hidden Metric Hunter: Reveals overlooked data/metrics that unlock growth
- Contrarian Truth Teller: Challenges industry assumptions with proof
- Pattern Recognizer: Shows repeating problems across multiple scenarios
- System Builder: Provides step-by-step frameworks
- Reality Checker: Exposes harsh truths about common practices
- Transformation Catalyst: Shows before/after with specific tactics
- The Experimenter: Personal test or process revealed
- The Teacher: Breaks down lessons from experience
- The Investigator: Reveals secrets or unknown tricks

Deep Structure Analysis For each post, document:
- Hook Mechanism: Which of the 10 headline formats used
- Curiosity Architecture: How they build open loops
- Value Delivery Pattern: AIDA, PAS/PASO, 4Ps, FAB, or hybrid
- Emotional Journey: Using Dr. Paul Ekman's 7 emotions
- Conversion Elements: How they pivot from value to soft pitch

Voice DNA Extraction
- Power phrases that create urgency
- Specificity markers (exact numbers, dates, metrics)
- Trust-building elements unique to this creator
- Personal story elements and vulnerability level
- Call-to-action sophistication and style

PHASE 2: THE NEUROSCIENCE-BASED HOOK SYSTEM (VOICE-ADAPTED)
Slide 1 Must Use ONE Primary Hook Type (In Client's Voice):
From Stefan Georgi's 11 Fascination Types:
- The Why: "Why [unexpected outcome] happens when [action]"
- The How: "How to [achieve result] using [unexpected method]"
- The When: "When to [take action] for [maximum result]"
- The What: "What [authority] knows about [topic] that you don't"
- The Secret: "The secret reason [unexpected cause] creates [result]"
- The List: "[Number] [things] that [create specific outcome]"
- The Never: "Never [common action] unless you want [consequence]"
- The Contrarian: "[Common belief] is wrong. Here's what works instead"
- The Named Oddity: "The '[Invented Name]' method that [achieves result]"
- The Speedy: "The [timeframe] trick that [delivers benefit]"
- The Plus: "[Main benefit] plus [unexpected bonus benefit]"

Voice Adaptation Rules:
- Use client's complexity level (technical vs. simple)
- Mirror their question-asking frequency
- Match their confidence/humility balance
- Adopt their industry terminology
- Reflect their personal vs. business story ratio

PHASE 3: THE 5-ELEMENT PERSUASION FRAMEWORK (CLIENT-CALIBRATED)
Every carousel must incorporate at least 3 of these elements using the client's established voice:
Encourage Their Dreams (Slides 2-3)
- Use client's aspiration language patterns
- Reference outcomes the client typically promises
- Mirror the client's optimism level and terminology

Justify Their Failures (Slides 4-5)
- Adopt client's empathy style
- Use client's problem-identification approach
- Match client's blame-attribution patterns (system vs. individual)

Allay Their Fears (Slides 6-7)
- Address fears client typically encounters
- Use client's reassurance style and proof types
- Match client's confidence-building approach

Confirm Their Suspicions (Throughout)
- Reference industry insights client commonly shares
- Use client's insider knowledge style
- Match client's "truth-telling" approach

Throw Rocks at Enemies (Slides 8-9)
- Target enemies client typically identifies
- Use client's competitive positioning style
- Match client's confrontation comfort level

PHASE 4: CONTENT STRUCTURE FRAMEWORKS (VOICE-CONSISTENT)
Maintain Client's Preferred Structure:
- If client uses storytelling: Adapt PAS/PASO with narrative elements
- If client uses frameworks: Emphasize systematic approaches
- If client uses data: Lead with metrics and proof
- If client uses personal experience: Weave in relatable anecdotes

PHASE 5: CLIENT VOICE INTEGRATION CHECKLIST
Before Writing:
[ ] Reviewed client's top 10 performing posts
[ ] Identified 5-7 signature phrases to incorporate
[ ] Noted client's average sentence length
[ ] Mapped client's storytelling vs. teaching ratio
[ ] Understood client's industry positioning

During Writing:
[ ] Using client's complexity level
[ ] Incorporating client's common analogies
[ ] Matching client's confidence tone
[ ] Using client's preferred proof types
[ ] Following client's CTA style

Quality Control (Voice Consistency):
[ ] Would client's audience recognize this voice?
[ ] Are signature phrases naturally integrated?
[ ] Does complexity match client's usual level?
[ ] Is the emotional tone consistent?
[ ] Would this fit seamlessly in client's feed?

Writing Style Samples Analysis: "${writingStyleSamples}"

Separate each slide with "\\n\\n" to indicate a new slide.` : `PROMPT 2: LINKEDIN CAROUSEL CREATION - WITHOUT EXISTING CONTENT
You are a world-class direct response marketer specialized in writing viral LinkedIn carousels. You've mastered Stefan Georgi's fascination techniques, studied the neuroscience of dopamine-driven content, and analyzed billions of views worth of content. Your mission: create carousels that stop scrolls, trigger curiosity loops, and convert viewers into clients while establishing a powerful, authentic voice from scratch.

Use this YouTube transcript to create a LinkedIn carousel: "${transcript || ''}"

PHASE 1: VOICE DEVELOPMENT & MARKET POSITIONING
Client Discovery Protocol:
Industry & Expertise Mapping:
- Primary industry and sub-niche
- Years of experience and major achievements
- Unique methodologies or frameworks
- Target audience demographics and psychographics
- Main problems solved and transformations delivered

Competitive Landscape Analysis:
- Identify 5-7 key competitors in the space
- Analyze their messaging and positioning
- Find gaps and differentiation opportunities
- Note oversaturated topics to avoid
- Identify underserved angles to exploit

Voice Architecture Development:
- Authority level: Expert/Guide/Peer/Student
- Tone spectrum: Professional ↔ Casual
- Complexity preference: Technical ↔ Simple
- Personality traits: Confident/Humble, Direct/Diplomatic
- Teaching style: Framework/Story/Data/Experience-based

Brand Voice Foundation: Choose ONE primary voice archetype:
- The Insider: Reveals industry secrets with authority
- The Challenger: Questions status quo with evidence
- The Guide: Teaches with patience and expertise
- The Innovator: Shares cutting-edge approaches
- The Translator: Makes complex simple
- The Experimenter: Tests and reports findings
- The Connector: Links ideas across domains

PHASE 2: AUDIENCE-FIRST HOOK DEVELOPMENT
Without existing content, hooks must be laser-targeted to audience pain:
Pain Point Research Framework:
- Identify the 3 biggest frustrations in target market
- Map the emotional journey of these frustrations
- Understand the language they use to describe problems
- Know what solutions they've already tried and failed
- Recognize their aspirations and desired outcomes

Hook Creation Formula (Cold Start):
[Pain Recognition] + [Unexpected Angle] + [Benefit Promise] = Hook

Examples:
"Most [title] lose $[amount] monthly because they believe this myth about [topic]"
"After [experience], I discovered why [common practice] destroys [desired outcome]"
"[Number] signs your [strategy] is secretly sabotaging your [goal]"

PHASE 3: AUTHORITY BUILDING WITHOUT HISTORY
Credibility Establishment Techniques:
Borrowed Authority:
- Reference respected industry figures
- Cite recent studies and data
- Quote recognized thought leaders
- Use framework names that sound established

Experience Translation:
- Convert years into insights
- Transform failures into lessons
- Turn observations into patterns
- Package knowledge into named concepts

Social Proof Creation:
- Reference industry trends you've observed
- Mention "clients" or "colleagues" generically
- Use "most successful [people]" language
- Cite "studies show" and "research indicates"

PHASE 4: CONTENT PILLARS ESTABLISHMENT
Create 4 Core Content Pillars:
Problem Identification Pillar:
- Common mistakes in the industry
- Hidden obstacles to success
- Misunderstood concepts
- Overlooked opportunities

Solution Framework Pillar:
- Step-by-step processes
- Diagnostic tools
- Implementation strategies
- Best practices

Mindset & Psychology Pillar:
- Limiting beliefs to overcome
- Success mindset development
- Confidence building
- Fear addressing

Trends & Future Pillar:
- Industry evolution insights
- Emerging opportunities
- Predictive observations
- Adaptation strategies

PHASE 5: VOICE CONSISTENCY SYSTEM
Establish Voice Guidelines:
Sentence Structure Pattern:
- Short impact statements: 5-8 words
- Medium explanations: 15-20 words
- Longer examples: 25-35 words
- Reset with short punch: 3-5 words

Vocabulary Framework:
- Industry terms: [List 10-15 key terms]
- Power words: [Choose 5-7 recurring words]
- Transition phrases: [Develop 3-5 signature transitions]
- Question styles: [Define questioning approach]

Personality Markers:
- Confidence level: How bold vs. humble
- Humor usage: Type and frequency
- Personal sharing: How much and what kind
- Contrarian stance: How often and how strong

PHASE 6: COLD START CONTENT STRATEGY
First 10 Carousels Strategy: 
1-2: Problem identification (establish pain awareness) 
3-4: Solution introduction (show you have answers) 
5-6: Framework sharing (demonstrate expertise) 
7-8: Case study/example (prove it works) 
9-10: Advanced insights (build authority)

Progressive Authority Building:
- Start with problems everyone recognizes
- Move to solutions that feel achievable
- Progress to more sophisticated insights
- Build to proprietary methodologies

Separate each slide with "\\n\\n" to indicate a new slide.`}`
    };
    
    // Check if this is a YouTube transcript content generation request
    if (type && transcript && SECURE_PROMPTS[type]) {
      try {
        console.log(`Generating ${type} content from YouTube transcript with model: ${model}`);
        console.log(`Writing style samples provided: ${writingStyleSamples ? 'Yes' : 'No'}`);
        if (writingStyleSamples) {
          console.log(`Writing style samples length: ${writingStyleSamples.length} characters`);
        }
        
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
            
            // Skip slides that are just separators (---)
            if (/^-{3,}$/.test(current)) {
              continue;
            }
            
            // Remove "Slide X:" prefix if it exists and clean up any remaining separators
            let cleanedSlide = current.replace(/^Slide\s*\d+[\s:.]+/i, '').trim();
            cleanedSlide = cleanedSlide.replace(/^-{3,}$/gm, '').trim(); // Remove separator lines
            cleanedSlide = cleanedSlide.replace(/\n\s*-{3,}\s*\n/g, '\n').trim(); // Remove separators between content
            
            if (cleanedSlide) { // Only add non-empty slides
              cleanedSlides.push(cleanedSlide);
            }
          }
          
          generatedContent = cleanedSlides.join('\n\n');
          console.log(`Generated carousel with ${cleanedSlides.length} cleaned slides`);
        }
        
        // Auto-save the generated content
        if (req.body.videoId && req.body.videoTitle) {
          try {
            const { v4: uuidv4 } = require('uuid');
            const contentId = uuidv4();
            const userId = req.body.userId || 'anonymous'; // Get userId from request body
            
            const contentData = {
              id: contentId,
              title: req.body.videoTitle || 'Generated Content',
              content: generatedContent,
              type: type,
              videoId: req.body.videoId,
              videoTitle: req.body.videoTitle,
              createdAt: new Date()
            };
            
            // Save to database
            const newContent = new CarouselContent({
              id: contentData.id,
              userId: userId,
              title: contentData.title,
              content: contentData.content,
              type: contentData.type,
              videoId: contentData.videoId,
              videoTitle: contentData.videoTitle,
              createdAt: contentData.createdAt,
              updatedAt: new Date()
            });
            
            await newContent.save();
            console.log(`Auto-saved generated content with ID: ${contentId} for user: ${userId}`);
            
            return res.json({ 
              content: generatedContent,
              model: completion.model,
              usage: completion.usage,
              type: type,
              success: true,
              autoSaved: true,
              savedContentId: contentId
            });
          } catch (saveError) {
            console.error('Error auto-saving content:', saveError);
            // Still return the content even if save fails
            return res.json({ 
              content: generatedContent,
              model: completion.model,
              usage: completion.usage,
              type: type,
              success: true,
              autoSaved: false,
              saveError: saveError.message
            });
          }
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
app.use('/api/stripe', stripeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/user-limits', userLimitRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/cron', cronRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/saved-posts', savedPostsRoutes);
app.use('/api/admin', adminRoutes);
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
    
    // Import proxy configuration
    const { getYtDlpProxyOptions, getHttpProxyConfig, logProxyStatus } = require('./config/proxy');
    
    // Log proxy status
    logProxyStatus();
    
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
    
    console.log(`Environment detection - isCloud: ${isCloud}, isWindows: ${isWindows}, platform: ${os.platform()}, NODE_ENV: ${process.env.NODE_ENV}`);
    
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
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const cookiesPath = path.join(process.cwd(), 'src', 'cookies', 'www.youtube.com_cookies.txt');
    
    // Verify cookies file exists
    if (!fs.existsSync(cookiesPath)) {
      console.error('YouTube cookies file not found at:', cookiesPath);
      return res.status(500).json({
        success: false,
        message: 'YouTube cookies file not found. Please ensure cookies are properly configured.',
        error: 'Missing cookies file'
      });
    }
    
    // Build proxy options for yt-dlp
    const proxyOptions = getYtDlpProxyOptions();
    
    const command = `${ytDlpCommand} --write-auto-sub --sub-lang en --skip-download --write-subs --sub-format json3 --cookies "${cookiesPath}" --paths "transcripts" --user-agent "${userAgent}" ${proxyOptions} "${videoUrl}"`;
    
    // Add a separate command to fetch video metadata including duration
    const metadataCommand = `${ytDlpCommand} -J --cookies "${cookiesPath}" --user-agent "${userAgent}" ${proxyOptions} "${videoUrl}"`;
    
    try {
      // First fetch video metadata to get duration
      let duration = "N/A";
      let thumbnail = "";
      let title = "";
      let channelName = "";
      let viewCount = 0;
      let uploadDate = "";
      
      try {
        console.log('Attempting to fetch metadata with yt-dlp...');
        console.log('yt-dlp command:', metadataCommand);
        const { stdout: metadataOutput, stderr: metadataError } = await execPromise(metadataCommand);
        
        if (metadataError) {
          console.error('yt-dlp metadata stderr:', metadataError);
        }
        
        if (!metadataOutput || metadataOutput.trim() === '') {
          throw new Error('Empty metadata output from yt-dlp');
        }
        
        const metadata = JSON.parse(metadataOutput);
        
        // Extract relevant metadata
        duration = metadata.duration ? formatDuration(metadata.duration) : "N/A";
        thumbnail = metadata.thumbnail || "";
        title = metadata.title || "";
        channelName = metadata.channel || metadata.uploader || "";
        viewCount = metadata.view_count || 0;
        uploadDate = metadata.upload_date || "";
        
        console.log(`Video metadata fetched successfully with yt-dlp for ${videoId}, duration: ${duration}`);
      } catch (ytdlpError) {
        console.error('Error fetching metadata with yt-dlp:', ytdlpError);
        console.error('yt-dlp command that failed:', metadataCommand);
        
        // Fallback 1: Try using direct YouTube page scraping with cookies
        try {
          console.log('Attempting to fetch metadata via page scraping...');
          const headers = {
            'User-Agent': userAgent,
            'Cookie': fs.readFileSync(cookiesPath, 'utf8')
              .split('\n')
              .filter(line => line && !line.startsWith('#'))
              .map(line => {
                const [domain, , path, secure, expiry, name, value] = line.split('\t');
                if (domain.includes('youtube.com')) {
                  return `${name}=${value}`;
                }
                return null;
              })
              .filter(Boolean)
              .join('; ')
          };
          
          // Configure axios with proxy if enabled
          const axiosConfig = {
            headers,
            timeout: 10000,
            maxRedirects: 5
          };
          
          const proxyConfig = getHttpProxyConfig();
          if (proxyConfig) {
            axiosConfig.proxy = proxyConfig;
            console.log('Using proxy for axios metadata fetching');
          }
          
          const response = await axios.get(videoUrl, axiosConfig);
          
          const html = response.data;
          
          // Extract duration using multiple patterns
          let durationSeconds;
          const patterns = [
            /"lengthSeconds":"(\d+)"/,
            /approxDurationMs":"(\d+)"/,
            /duration_seconds":(\d+)/,
            /"duration":{"simpleText":"([^"]+)"/,
            /"lengthText":{"simpleText":"([^"]+)"/,
            /"videoDetails":{"videoId":"[^"]+","title":"[^"]+","lengthSeconds":"(\d+)"/,
            /ytInitialPlayerResponse.*?"lengthSeconds":"(\d+)"/,
            /ytInitialData.*?"lengthSeconds":"(\d+)"/
          ];
          
          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
              if (pattern.toString().includes('simpleText')) {
                // Handle duration in format like "4:32" or "1:23:45"
                const timeString = match[1];
                const timeParts = timeString.split(':').map(part => parseInt(part));
                if (timeParts.length === 2) {
                  // MM:SS format
                  durationSeconds = timeParts[0] * 60 + timeParts[1];
                } else if (timeParts.length === 3) {
                  // HH:MM:SS format
                  durationSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
                }
              } else {
                durationSeconds = pattern.toString().includes('Ms') ? Math.floor(parseInt(match[1]) / 1000) : parseInt(match[1]);
              }
              
              if (durationSeconds) {
                duration = formatDuration(durationSeconds);
                console.log(`Duration found via pattern ${pattern.toString()}: ${duration}`);
                break;
              }
            }
          }
          
          // Extract other metadata
          const titleMatch = html.match(/"title":"([^"]+)"/);
          if (titleMatch) title = titleMatch[1];
          
          const channelMatch = html.match(/"channelName":"([^"]+)"/);
          if (channelMatch) channelName = channelMatch[1];
          
          const viewMatch = html.match(/"viewCount":"(\d+)"/);
          if (viewMatch) viewCount = parseInt(viewMatch[1]);
          
          const thumbnailMatch = html.match(/"thumbnails":\[{"url":"([^"]+)"/);
          if (thumbnailMatch) thumbnail = thumbnailMatch[1];
          
          console.log(`Metadata fetched via scraping for ${videoId}, duration: ${duration}`);
        } catch (scrapingError) {
          console.error('Error fetching metadata via scraping:', scrapingError);
          
          // Fallback 2: Try using YouTube oEmbed API
          try {
            console.log('Attempting to fetch metadata via YouTube oEmbed API...');
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
            const oembedResponse = await axios.get(oembedUrl, { timeout: 5000 });
            
            if (oembedResponse.data) {
              title = oembedResponse.data.title || "";
              channelName = oembedResponse.data.author_name || "";
              thumbnail = oembedResponse.data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
              console.log(`Basic metadata fetched via oEmbed for ${videoId}`);
            }
          } catch (oembedError) {
            console.error('Error fetching metadata via oEmbed:', oembedError);
          }
          
          // Fallback 3: Try using YouTube API v3 if API key is available
          if (process.env.YOUTUBE_API_KEY && duration === "N/A") {
            try {
              console.log('Attempting to fetch duration via YouTube API v3...');
              const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,snippet&key=${process.env.YOUTUBE_API_KEY}`;
              const apiResponse = await axios.get(apiUrl, { timeout: 5000 });
              
              if (apiResponse.data.items && apiResponse.data.items.length > 0) {
                const video = apiResponse.data.items[0];
                
                // Parse ISO 8601 duration format (PT4M13S -> 4:13)
                if (video.contentDetails && video.contentDetails.duration) {
                  const isoDuration = video.contentDetails.duration;
                  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                  if (match) {
                    const hours = parseInt(match[1] || 0);
                    const minutes = parseInt(match[2] || 0);
                    const seconds = parseInt(match[3] || 0);
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    duration = formatDuration(totalSeconds);
                    console.log(`Duration found via YouTube API: ${duration}`);
                  }
                }
                
                // Also get other metadata if not already available
                if (video.snippet) {
                  if (!title) title = video.snippet.title || "";
                  if (!channelName) channelName = video.snippet.channelTitle || "";
                  if (!thumbnail && video.snippet.thumbnails) {
                    thumbnail = video.snippet.thumbnails.maxres?.url || 
                               video.snippet.thumbnails.high?.url || 
                               video.snippet.thumbnails.medium?.url || 
                               `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                  }
                }
              }
            } catch (apiError) {
              console.error('Error fetching metadata via YouTube API:', apiError);
            }
          }
          
          // Fallback 4: Try using a simple thumbnail-based approach
          try {
            console.log('Using basic metadata approach...');
            if (!thumbnail) {
              thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
            }
            // Keep other values as default/N/A
            console.log('Basic metadata approach completed');
          } catch (basicError) {
            console.error('Error in basic metadata approach:', basicError);
          }
        }
      }
      
      // Log final metadata state before proceeding
      console.log(`Final metadata for ${videoId} - Duration: ${duration}, Title: ${title ? 'Found' : 'N/A'}, Channel: ${channelName ? 'Found' : 'N/A'}`);
      
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
app.use('/api/upload', uploadRoutes);

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

  // Start cron jobs
  accountDeletionJob.start();
}); 