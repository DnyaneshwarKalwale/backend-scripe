const asyncHandler = require('express-async-handler');
const axios = require('axios');
const OpenAI = require('openai');
const xml2js = require('xml2js');

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract YouTube video ID from URL
 * @param {string} url YouTube video URL
 * @returns {string|null} Video ID or null if not found
 */
const extractVideoId = (url) => {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
};

/**
 * @desc    Fetch transcript from YouTube video using public caption URL
 * @route   POST /api/youtube/transcript
 * @access  Private
 */
const getTranscript = asyncHandler(async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    res.status(400);
    throw new Error('Please provide a YouTube video URL');
  }

  try {
    const videoId = extractVideoId(videoUrl);
    
    if (!videoId) {
      res.status(400);
      throw new Error('Invalid YouTube URL');
    }

    // First, try to get the video information to extract title
    const videoInfoResponse = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
    const html = videoInfoResponse.data;
    
    let title = 'YouTube Video';
    let channelTitle = 'YouTube Channel';
    
    // Extract title from HTML
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' - YouTube', '');
    }

    // Use the public caption URL to get the transcript
    // First, check if captions are available in English
    const captionUrl = `http://video.google.com/timedtext?lang=en&v=${videoId}`;
    const captionResponse = await axios.get(captionUrl, {
      validateStatus: (status) => status === 200 || status === 404
    });
    
    // If no captions found (empty response), try without language specification
    if (captionResponse.status === 404 || captionResponse.data === '') {
      // Try to get available languages
      const langListUrl = `http://video.google.com/timedtext?type=list&v=${videoId}`;
      const langListResponse = await axios.get(langListUrl);
      
      if (langListResponse.data === '') {
        return res.status(404).json({
          success: false,
          error: 'No captions available for this video',
          message: 'This video does not have any captions or subtitles available.'
        });
      }
      
      // Parse XML to find available languages
      const parser = new xml2js.Parser({ explicitArray: false });
      let availableLangs;
      
      try {
        const result = await parser.parseStringPromise(langListResponse.data);
        availableLangs = result.transcript_list.track;
      } catch (parseError) {
        console.error('Error parsing language list XML:', parseError);
        availableLangs = [];
      }
      
      // If there are available languages, use the first one
      if (Array.isArray(availableLangs) && availableLangs.length > 0) {
        const firstLang = availableLangs[0];
        const altCaptionUrl = `http://video.google.com/timedtext?lang=${firstLang.$.lang_code}&v=${videoId}`;
        const altCaptionResponse = await axios.get(altCaptionUrl);
        
        if (altCaptionResponse.data) {
          // Parse the XML to extract text
          const textSegments = await parseTranscriptXml(altCaptionResponse.data);
          const transcript = textSegments.join(' ');
          
          return res.status(200).json({
            success: true,
            data: {
              videoId,
              title,
              channelTitle,
              transcript,
              source: 'youtube_captions',
              language: firstLang.$.lang_name || firstLang.$.lang_code
            }
          });
        }
      }
      
      // If we still couldn't get captions, return an error
      return res.status(404).json({
        success: false,
        error: 'No captions available for this video',
        message: 'This video does not have any captions or subtitles available.'
      });
    }
    
    // Parse the XML to extract text
    const textSegments = await parseTranscriptXml(captionResponse.data);
    const transcript = textSegments.join(' ');
    
    res.status(200).json({
      success: true,
      data: {
        videoId,
        title,
        channelTitle,
        transcript,
        source: 'youtube_captions',
        language: 'English'
      }
    });
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to fetch YouTube transcript');
  }
});

/**
 * Helper function to parse transcript XML
 * @param {string} xml The XML string to parse
 * @returns {Promise<string[]>} Array of text segments
 */
const parseTranscriptXml = async (xml) => {
  const textSegments = [];
  
  try {
    // Use xml2js to parse the XML
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    
    // Extract the text elements
    if (result && result.transcript && result.transcript.text) {
      const textElements = Array.isArray(result.transcript.text) 
        ? result.transcript.text 
        : [result.transcript.text];
      
      textElements.forEach(element => {
        // The text content might be directly in the element or in the _ property
        let text = typeof element === 'string' ? element : (element._ || '');
        
        // Convert HTML entities back to characters
        text = text.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&#39;/g, "'")
                   .replace(/&quot;/g, '"');
        
        textSegments.push(text);
      });
    }
  } catch (error) {
    console.error('Error parsing XML:', error);
    // Try fallback to regex approach if XML parsing fails
    const textMatches = xml.matchAll(/<text[^>]*>(.*?)<\/text>/g);
    
    for (const match of textMatches) {
      let text = match[1];
      // Convert HTML entities back to characters
      text = text.replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&#39;/g, "'")
                 .replace(/&quot;/g, '"');
      
      textSegments.push(text);
    }
  }
  
  return textSegments;
};

/**
 * @desc    Convert YouTube transcript to LinkedIn content
 * @route   POST /api/youtube/to-linkedin
 * @access  Private
 */
const convertToLinkedIn = asyncHandler(async (req, res) => {
  const { transcript, title, format = 'post', tone = 'professional' } = req.body;

  if (!transcript) {
    res.status(400);
    throw new Error('Please provide a transcript');
  }

  try {
    // Truncate long transcripts to fit within OpenAI's token limits
    const truncatedTranscript = transcript.length > 10000 
      ? transcript.substring(0, 10000) + '...' 
      : transcript;
    
    // Construct system message based on format and tone
    let systemMessage = 'You are an expert at repurposing YouTube content for LinkedIn.';
    
    if (format === 'post') {
      systemMessage += ' Create a LinkedIn post (max 1500 characters) based on the YouTube transcript.';
    } else if (format === 'carousel') {
      systemMessage += ' Create content for a LinkedIn carousel with 5 slides based on the YouTube transcript. Each slide should be separated by [SLIDE X] where X is the slide number.';
    } else if (format === 'article') {
      systemMessage += ' Create a LinkedIn article outline with introduction, key points, and conclusion based on the YouTube transcript.';
    }
    
    systemMessage += ` The tone should be ${tone}. Include 3-5 relevant hashtags at the end. Focus only on the most valuable insights from the transcript.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: `Title: ${title || 'YouTube Video'}\n\nTranscript: ${truncatedTranscript}` }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = completion.choices[0].message.content;
    
    // Extract hashtags
    const hashtagRegex = /#[\w\d]+/g;
    const hashtags = content.match(hashtagRegex) || [];
    
    // Parse slides if it's carousel format
    let slides = [];
    if (format === 'carousel') {
      const slideRegex = /\[SLIDE\s+(\d+):?\s+([^\]]+)\]([\s\S]*?)(?=\[SLIDE\s+\d+|$)/gi;
      let match;
      
      while ((match = slideRegex.exec(content)) !== null) {
        slides.push({
          number: match[1],
          title: match[2].trim(),
          content: match[3].trim()
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        content,
        hashtags: hashtags.map(tag => tag.substring(1)), // Remove the # symbol
        slides: format === 'carousel' ? slides : undefined,
        sourceType: 'youtube'
      }
    });
  } catch (error) {
    console.error('Error converting to LinkedIn:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to convert to LinkedIn content');
  }
});

module.exports = {
  getTranscript,
  convertToLinkedIn
}; 