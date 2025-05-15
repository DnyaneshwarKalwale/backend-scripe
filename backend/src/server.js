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
const { initScheduler } = require('./services/schedulerService');
const OpenAI = require('openai');
const fs = require('fs');
const cronRoutes = require('./routes/cronRoutes');
const CarouselContent = require('./models/carouselContentModel');
const cloudinary = require('cloudinary').v2;
const userLimitRoutes = require('./routes/userLimitRoutes');

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
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://brandout.vercel.app',
  'https://ea50-43-224-158-115.ngrok-free.app',
  'https://18cd-43-224-158-115.ngrok-free.app',
  'https://deluxe-cassata-51d628.netlify.app'
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
app.use('/api/fonts', fontRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/user-limits', userLimitRoutes);
// Admin routes
app.use('/api/admin', require('./routes/adminRoutes'));

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
    
    // Command for yt-dlp to extract subtitles
    // We try auto-generated first, then manual if available
    const command = `yt-dlp --write-auto-sub --sub-lang en --skip-download --write-subs --sub-format json3 "${videoUrl}"`;
    
    // Add a separate command to fetch video metadata including duration
    const metadataCommand = `yt-dlp -J "${videoUrl}"`;
    
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