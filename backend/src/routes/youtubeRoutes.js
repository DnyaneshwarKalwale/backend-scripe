const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const axios = require('axios');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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',
});

// ✅ Set path to yt-dlp.exe correctly
const ytDlpPath = path.join(process.cwd(), "bin", "yt-dlp.exe");

/**
 * @route   POST /api/youtube/channel
 * @desc    Fetch videos from a YouTube channel
 * @access  Private
 */
router.post('/channel', protect, async (req, res) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Channel name is required' 
      });
    }

    // 🛠 Support both full links and @handle formats
    const channelUrl = channelName.startsWith("http")
      ? channelName
      : `https://www.youtube.com/@${channelName}/videos`;

    const command = `"${ytDlpPath}" --dump-json --flat-playlist "${channelUrl}" --playlist-items 1-30`;

    console.log("Running yt-dlp command:", command);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch channel info',
          error: error.message
        });
      }

      try {
        if (!stdout || stdout.trim() === '') {
          console.log('Empty response from yt-dlp, might be no videos or channel not found');
          return res.status(404).json({
            success: false,
            message: 'No videos found or channel does not exist',
          });
        }
        
        // Split by lines and filter out empty lines
        const lines = stdout.trim().split("\n").filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'No videos found in channel',
          });
        }
        
        // Try to parse each line as JSON
        const videos = [];
        for (const line of lines) {
          try {
            const video = JSON.parse(line);
            videos.push(video);
          } catch (lineParseError) {
            console.warn(`Could not parse line as JSON: ${line.substring(0, 50)}...`);
            // Continue with other lines
          }
        }
        
        if (videos.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Could not parse any videos from channel',
          });
        }
        
        res.status(200).json({ 
          success: true, 
          data: videos 
        });
      } catch (parseError) {
        console.error("Error parsing yt-dlp output:", parseError);
        console.error("stdout sample:", stdout ? stdout.substring(0, 200) : 'Empty output');
        res.status(500).json({
          success: false,
          message: 'Error parsing channel data',
          error: parseError.message,
          rawOutput: stdout ? stdout.substring(0, 1000) : 'Empty output'
        });
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: err.message 
    });
  }
});

/**
 * @route   GET /api/youtube/transcript?url=:youtubeUrl
 * @desc    Fetch YouTube transcript using yt-dlp
 * @access  Private
 */
router.get('/transcript', protect, async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        message: 'YouTube URL is required' 
      });
    }
    
    console.log(`Fetching transcript for URL: ${url}`);
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid YouTube URL' 
      });
    }
    
    console.log(`Extracted video ID: ${videoId}`);
    
    // Create a safe filename for temporary files
    const tempFileBase = path.join(process.cwd(), `temp_${videoId.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    // First try using yt-dlp to get subtitles in English if available
    const subtitlesCommand = `"${ytDlpPath}" --write-sub --sub-lang en --skip-download -o "${tempFileBase}" "${url}"`;
    
    console.log(`Running subtitles command: ${subtitlesCommand}`);
    
    exec(subtitlesCommand, async (error, stdout, stderr) => {
      try {
        if (stderr) {
          console.log('yt-dlp stderr:', stderr);
        }
        
        if (stdout) {
          console.log('yt-dlp stdout:', stdout);
        }
        
        // Check all possible subtitle file extensions
        const possibleExtensions = ['.en.vtt', '.en.srt', '.vtt', '.srt'];
        let subtitleFile = null;
        
        for (const ext of possibleExtensions) {
          const filePath = `${tempFileBase}${ext}`;
          console.log(`Checking for subtitle file: ${filePath}`);
          if (fs.existsSync(filePath)) {
            subtitleFile = filePath;
            break;
          }
        }
        
        if (subtitleFile) {
          console.log(`Found subtitle file: ${subtitleFile}`);
          
          try {
            // Read the subtitle file
            const subtitleData = fs.readFileSync(subtitleFile, 'utf8');
            
            // Process the VTT file to extract the transcript
            const transcript = processVttToText(subtitleData);
            
            // Delete the temp file
            try {
              fs.unlinkSync(subtitleFile);
              console.log(`Deleted subtitle file: ${subtitleFile}`);
            } catch (unlinkError) {
              console.error(`Error deleting subtitle file: ${unlinkError.message}`);
              // Continue even if file deletion fails
            }
            
            if (transcript && transcript.trim().length > 0) {
              console.log(`Successfully extracted transcript, length: ${transcript.length}`);
              
              // Return the transcript
              return res.status(200).json({
                success: true,
                data: {
                  videoId,
                  transcript,
                  language: 'en',
                  isAutoGenerated: true // Assume auto-generated
                }
              });
            } else {
              console.log('Extracted transcript was empty, trying fallback methods');
            }
          } catch (fileReadError) {
            console.error(`Error reading subtitle file: ${fileReadError.message}`);
            // Continue to fallback methods
          }
        } else {
          console.log('No subtitle file found, trying fallback methods');
        }
        
        // If yt-dlp method fails, fall back to the alternative method
        try {
          console.log('Trying to fetch transcript using YouTube page method');
          const transcriptData = await fetchYouTubeTranscript(videoId);
          
          if (transcriptData && transcriptData.transcript && transcriptData.transcript.trim().length > 0) {
            console.log('Successfully fetched transcript using YouTube page method');
            
            return res.status(200).json({
              success: true,
              data: {
                videoId,
                transcript: transcriptData.transcript,
                language: transcriptData.language,
                isAutoGenerated: transcriptData.isAutoGenerated
              }
            });
          } else {
            console.log('Transcript from YouTube page was empty, trying Google timedtext API');
            throw new Error('Empty transcript from YouTube page method');
          }
        } catch (transcriptError) {
          console.error(`Error using YouTube page method: ${transcriptError.message}`);
          
          // If both methods fail, try the Google timedtext API
          try {
            console.log('Trying Google timedtext API');
            const timedTextUrl = `https://video.google.com/timedtext?lang=en&v=${videoId}`;
            const response = await axios.get(timedTextUrl);
            
            if (!response.data || response.data.trim() === "") {
              console.log('No data from timedtext API');
              throw new Error('No transcript available from timedtext API');
            }
            
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await new Promise((resolve, reject) => {
              parser.parseString(response.data, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
            
            let transcript = "";
            
            if (result && result.transcript && result.transcript.text) {
              const entries = result.transcript.text;
              
              if (Array.isArray(entries)) {
                transcript = entries.map((entry) => entry._ || "").join(" ");
              } else {
                transcript = entries._ || "";
              }
            }
            
            if (!transcript || transcript.trim().length === 0) {
              console.log('Transcript from timedtext API was empty');
              throw new Error('Transcript data is empty');
            }
            
            transcript = decodeHtmlEntities(transcript);
            console.log('Successfully fetched transcript using timedtext API');
            
            return res.status(200).json({
              success: true,
              data: {
                videoId,
                transcript,
                language: 'en',
                isAutoGenerated: true
              }
            });
          } catch (timedTextError) {
            console.error(`Error using timedtext API: ${timedTextError.message}`);
            throw new Error('Failed to fetch transcript: ' + timedTextError.message);
          }
        }
      } catch (finalError) {
        console.error('Error fetching YouTube transcript:', finalError);
        return res.status(500).json({ 
          success: false, 
          message: finalError.message || 'Failed to fetch transcript' 
        });
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch transcript',
      error: error.response?.data || error.toString()
    });
  }
});

/**
 * @route   POST /api/youtube/analyze
 * @desc    Analyze transcript for LinkedIn content
 * @access  Private
 */
router.post('/analyze', protect, async (req, res) => {
  try {
    const { transcript, preferences } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }
    
    // Use OpenAI to analyze the transcript and generate LinkedIn content
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { 
          role: "system", 
          content: "You are a LinkedIn content expert. Your task is to analyze a YouTube transcript and create professional LinkedIn content according to user preferences." 
        },
        { 
          role: "user", 
          content: `Generate LinkedIn content from this transcript. Format: ${preferences?.format || 'post'}. Tone: ${preferences?.tone || 'professional'}. 
          Include hashtags. Keep it focused on professional insights from the transcript.
          
          Transcript:
          ${transcript}`
        }
      ],
      max_tokens: 1000,
    });
    
    return res.status(200).json({
      success: true,
      data: {
        content: completion.choices[0].message.content,
        model: completion.model,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens
      }
    });
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to analyze transcript',
      error: error.response?.data || error.toString()
    });
  }
});

// Helper function to extract YouTube video ID from URL
function extractVideoId(url) {
  try {
    let videoId = null;
    
    // Handle different URL formats
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
    } else if (url.includes('youtube.com/embed/')) {
      const urlParts = url.split('/');
      videoId = urlParts[urlParts.length - 1].split('?')[0];
    }
    
    return videoId;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

// Function to fetch YouTube transcript without API key
async function fetchYouTubeTranscript(videoId) {
  try {
    // Fetch the video page to get timedtext URL
    const videoPageResponse = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
    const videoPageHtml = videoPageResponse.data;
    
    // Extract captions data
    const captionsRegex = /"captionTracks":\s*(\[.*?\])/;
    const captionsMatch = videoPageHtml.match(captionsRegex);
    
    if (!captionsMatch || !captionsMatch[1]) {
      throw new Error('Could not find captions data');
    }
    
    const captionsData = JSON.parse(captionsMatch[1].replace(/\\"/g, '"'));
    
    if (!captionsData || captionsData.length === 0) {
      throw new Error('No captions available for this video');
    }
    
    // Get the first available caption track (usually English)
    const captionTrack = captionsData[0];
    
    // Fetch the actual transcript data
    const transcriptResponse = await axios.get(captionTrack.baseUrl);
    const transcriptXml = transcriptResponse.data;
    
    // Parse XML to extract text
    const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"(?:\s+[^>]*)?>([^<]+)<\/text>/g;
    let match;
    let transcriptText = '';
    
    while ((match = textRegex.exec(transcriptXml)) !== null) {
      const text = match[3].replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/&quot;/g, '"')
                         .replace(/&#39;/g, "'");
      transcriptText += text + ' ';
    }
    
    return {
      transcript: transcriptText.trim(),
      language: captionTrack.languageCode,
      isAutoGenerated: captionTrack.kind === 'asr'
    };
  } catch (error) {
    console.error('Error in fetchYouTubeTranscript:', error);
    throw error;
  }
}

// Function to process VTT file to plain text
function processVttToText(vttContent) {
  console.log('Processing subtitle file, length:', vttContent.length);
  
  // Check if it's VTT or SRT format
  const isVtt = vttContent.includes('WEBVTT');
  
  // For VTT format, skip the header
  // For SRT, start from beginning
  const lines = isVtt 
    ? vttContent.split('\n').slice(3) 
    : vttContent.split('\n');
  
  let transcript = '';
  let currentText = '';
  const timeRegex = /\d+:\d+:\d+/; // Pattern to match timestamps
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip timestamp lines, empty lines, and numeric indices (for SRT)
    if (timeRegex.test(trimmedLine) || 
        trimmedLine === '' || 
        trimmedLine.includes('-->') || 
        /^\d+$/.test(trimmedLine)) {
      continue;
    }
    
    // Add non-empty, non-timestamp lines to the transcript
    if (trimmedLine) {
      // Remove HTML-like tags that might be in the subtitles
      currentText = trimmedLine.replace(/<[^>]*>/g, '');
      transcript += currentText + ' ';
    }
  }
  
  const result = transcript.trim();
  console.log('Processed transcript length:', result.length);
  return result;
}

// Helper to clean up HTML entities
function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

module.exports = router; 