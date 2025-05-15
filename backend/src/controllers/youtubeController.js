const axios = require('axios');
const xml2js = require('xml2js');
const User = require('../models/userModel');
const SavedVideo = require('../models/savedVideo');

/**
 * Helper function to validate YouTube channel IDs
 * Most YouTube channel IDs start with UC and are 24 characters long
 */
const isValidYoutubeChannelId = (id) => {
  if (!id || typeof id !== 'string') return false;
  // Most channel IDs start with UC and are 24 characters long
  if (id.startsWith('UC') && id.length === 24) return true;
  // Some other valid channels might not follow this pattern exactly, but should:
  // 1. Be at least 12 characters long
  // 2. Not be a common word like 'client', 'channel', 'videos', etc.
  // 3. Contain both letters and numbers
  const commonInvalidIds = ['client', 'channel', 'videos', 'user', 'watch', 'feed'];
  return id.length >= 12 && 
         !commonInvalidIds.includes(id.toLowerCase()) &&
         /[a-zA-Z]/.test(id) && 
         /[0-9]/.test(id);
};

/**
 * @desc    Fetch YouTube channel information and videos
 * @route   POST /api/youtube/channel
 * @access  Public
 */
const getChannelVideos = async (req, res) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({ success: false, message: 'Channel name or URL is required' });
    }

    // Extract channel handle/name from input
    let channelHandle = channelName;
    let channelId = null;
    
    // Check if input is already a channel ID
    if (channelName.startsWith('UC') && channelName.length === 24) {
      channelId = channelName;
      console.log(`Using provided channel ID: ${channelId}`);
    } else {
      // Handle different URL formats
      if (channelName.includes('youtube.com/')) {
        // Extract handle or channel ID from URL
        if (channelName.includes('/channel/')) {
          // Direct channel ID URL
          const parts = channelName.split('/channel/');
          channelId = parts[1]?.split('/')[0] || null;
          console.log(`Extracted channel ID from URL: ${channelId}`);
        } else if (channelName.includes('/c/') || channelName.includes('/user/')) {
          // Custom URL format
          const parts = channelName.split(/\/c\/|\/user\//);
          channelHandle = parts[1]?.split('/')[0] || channelName;
          console.log(`Extracted custom URL: ${channelHandle}`);
        } else {
          // Handle format
          const parts = channelName.split('/');
          for (let i = 0; i < parts.length; i++) {
            if (parts[i].startsWith('@')) {
              channelHandle = parts[i];
              break;
            }
          }
        }
      }
      
      // Add @ prefix if it's a handle and doesn't have it
      if (!channelHandle.startsWith('@') && !channelName.includes('youtube.com/') &&
          !channelName.includes('/c/') && !channelName.includes('/user/')) {
        channelHandle = '@' + channelHandle;
      }
    }

    // Only try to fetch the channel page if we don't already have a channel ID
    if (!channelId) {
      try {
        console.log(`Attempting to fetch channel info for: ${channelHandle}`);
        const channelUrl = `https://www.youtube.com/${channelHandle}`;
        
        // Set headers to mimic a browser request
        const response = await axios.get(channelUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml'
          },
          timeout: 10000
        });
        
        // Extract channel ID
        const channelIdMatch = response.data.match(/"channelId":"([^"]+)"/);
        if (!channelIdMatch || !channelIdMatch[1]) {
          // Alternative method - try a different regex pattern
          const altMatch = response.data.match(/channel\/([^"]+)"/);
          if (altMatch && altMatch[1]) {
            // Verify the extracted ID is not 'client' and has a proper channel ID format
            const extractedId = altMatch[1];
            if (extractedId !== 'client' && extractedId.length > 10) {
              channelId = extractedId;
              console.log(`Found channel ID using alt method: ${channelId}`);
            } else {
              console.log(`Invalid channel ID found: ${extractedId}, trying other methods`);
              // Try third alternative - look for externalId
              const externalIdMatch = response.data.match(/"externalId":"([^"]+)"/);
              if (externalIdMatch && externalIdMatch[1]) {
                channelId = externalIdMatch[1];
                console.log(`Found channel ID using externalId: ${channelId}`);
              } else {
                // Meta tag method as final fallback
                const metaMatch = response.data.match(/<meta\s+itemprop="channelId"\s+content="([^"]+)">/);
                if (metaMatch && metaMatch[1]) {
                  channelId = metaMatch[1];
                  console.log(`Found channel ID using meta tag: ${channelId}`);
                } else {
                  console.error('Could not extract valid channel ID from page');
                  return res.status(404).json({ 
                    success: false, 
                    message: 'Channel not found or could not extract valid channel ID' 
                  });
                }
              }
            }
          } else {
            // Second alternative - meta tags
            const metaMatch = response.data.match(/<meta\s+itemprop="channelId"\s+content="([^"]+)">/);
            if (metaMatch && metaMatch[1]) {
              channelId = metaMatch[1];
              console.log(`Found channel ID using meta tag: ${channelId}`);
            } else {
              console.error('Could not extract channel ID from page');
              return res.status(404).json({ 
                success: false, 
                message: 'Channel not found or could not extract channel ID' 
              });
            }
          }
        } else {
          channelId = channelIdMatch[1];
          console.log(`Found channel ID: ${channelId}`);
        }
      } catch (fetchError) {
        console.error('Error fetching channel data:', fetchError);
        
        // Special case for popular channels often targeted
        if (channelHandle === '@mortal' || channelHandle === 'mortal') {
          // Hardcoded channelId for Mortal as a fallback
          channelId = 'UCGzQZ_CQgPASpz4Vs5SG33g';
          console.log(`Using hardcoded channel ID for ${channelHandle}: ${channelId}`);
        } else {
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch channel data',
            error: fetchError.message
          });
        }
      }
    }
      
    // Now fetch videos using RSS feed (no API key needed)
    try {
      // Validate the channel ID before proceeding
      if (!isValidYoutubeChannelId(channelId)) {
        console.error(`Invalid channel ID: ${channelId}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid YouTube channel ID',
          error: `The detected channel ID (${channelId}) appears to be invalid`
        });
      }
      
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      console.log(`Fetching RSS feed from: ${rssUrl}`);
      
      const rssResponse = await axios.get(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 15000
      });
      
      // Parse the XML
      const parser = new xml2js.Parser({ explicitArray: false });
      const feed = await new Promise((resolve, reject) => {
        parser.parseString(rssResponse.data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      if (!feed || !feed.feed || !feed.feed.entry) {
        console.log('No videos found in feed');
        return res.status(200).json({
          success: true,
          data: []
        });
      }
      
      // Ensure entries is an array even if there's only one video
      const entries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
      
      // Extract video information
      const videos = entries.map(entry => {
        // Extract video ID from the yt:videoId field
        const videoId = entry['yt:videoId'];
        
        // Extract thumbnail URL
        const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // Extract view count if available
        let viewCount = 0;
        try {
          if (entry['media:group'] && entry['media:group']['media:community'] && 
              entry['media:group']['media:community']['media:statistics'] && 
              entry['media:group']['media:community']['media:statistics'].$) {
            viewCount = parseInt(entry['media:group']['media:community']['media:statistics'].$.views, 10) || 0;
          }
        } catch (e) {
          console.log(`Could not extract view count for video ${videoId}`);
        }
        
        return {
          id: videoId,
          title: entry.title || 'Untitled Video',
          thumbnail: thumbnailUrl,
          url: `https://youtube.com/watch?v=${videoId}`,
          duration: "N/A", // Duration not available from RSS feed
          view_count: viewCount,
          upload_date: entry.published || new Date().toISOString()
        };
      });
      
      return res.status(200).json({
        success: true,
        data: videos
      });
    } catch (rssError) {
      console.error('Error fetching RSS feed:', rssError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch channel videos from RSS feed',
        error: rssError.message
      });
    }
  } catch (error) {
    console.error('Error in YouTube channel controller:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error processing YouTube channel request',
      error: error.toString()
    });
  }
};

/**
 * @desc    Save YouTube videos as carousel requests
 * @route   POST /api/youtube/carousels
 * @access  Public
 */
const createCarousels = async (req, res) => {
  try {
    const { videos, userId } = req.body;
    
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one video is required' 
      });
    }
    
    // Create carousel requests from videos
    const carouselRequests = videos.map(video => {
      return {
        userId: userId || 'anonymous',
        title: video.title || 'YouTube Carousel',
        source: 'youtube',
        videoId: video.id,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnail,
        status: 'pending',
        requestDate: new Date(),
        slideCount: 5, // Default number of slides
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // In a real implementation, you would save these to a MongoDB collection
    // For now, just return success with the count
    return res.status(200).json({
      success: true,
      message: `Successfully created ${carouselRequests.length} carousel requests`,
      count: carouselRequests.length,
      data: carouselRequests
    });
  } catch (error) {
    console.error('Error creating carousel requests:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create carousel requests',
      error: error.toString()
    });
  }
};

/**
 * @desc    Save a YouTube video for a user
 * @route   POST /api/youtube/save
 * @access  Public
 */
const saveYoutubeVideo = async (req, res) => {
  try {
    const { videoId, title, thumbnailUrl, channelTitle, publishedAt, userId } = req.body;

    if (!videoId || !title || !thumbnailUrl) {
      return res.status(400).json({
        success: false,
        message: 'Video ID, title, and thumbnail URL are required'
      });
    }

    // Check if the user exists if userId is provided
    if (userId && userId !== 'anonymous') {
      try {
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`User ${userId} not found, but continuing with save operation`);
        }
      } catch (userErr) {
        console.warn(`Error checking user ${userId}, but continuing:`, userErr.message);
      }
    }

    // Create or update saved video
    const savedVideo = await SavedVideo.findOneAndUpdate(
      { userId: userId || 'anonymous', videoId },
      {
        userId: userId || 'anonymous',
        videoId,
        title,
        thumbnailUrl,
        channelTitle: channelTitle || 'Unknown Channel',
        publishedAt: publishedAt || new Date(),
        savedAt: new Date()
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Video saved successfully',
      savedVideo
    });
  } catch (error) {
    console.error('Error saving YouTube video:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save video',
      error: error.toString()
    });
  }
};

/**
 * @desc    Save multiple YouTube videos for a user
 * @route   POST /api/youtube/save-videos
 * @access  Public
 */
const saveMultipleVideos = async (req, res) => {
  try {
    const { videos, userId } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one video is required'
      });
    }

    // Check if the user exists if userId is provided and not anonymous
    if (userId && userId !== 'anonymous') {
      try {
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`User ${userId} not found, but continuing with save operation`);
        }
      } catch (userErr) {
        console.warn(`Error checking user ${userId}, but continuing:`, userErr.message);
      }
    }

    const savedVideos = [];
    const errors = [];

    // Process each video in the array
    for (const video of videos) {
      const { id, videoId, title, thumbnail, thumbnailUrl, transcript, formattedTranscript, language, is_generated } = video;
      
      const actualVideoId = videoId || id;
      
      if (!actualVideoId || !title) {
        errors.push(`Video ID and title required for video: ${JSON.stringify(video)}`);
        continue;
      }

      try {
        // Create the video object with available data
        const videoData = {
          userId: userId || 'anonymous',
          videoId: actualVideoId,
          title,
          thumbnailUrl: thumbnailUrl || thumbnail || `https://img.youtube.com/vi/${actualVideoId}/mqdefault.jpg`,
          channelTitle: video.channelName || video.channelTitle || 'Unknown Channel',
          publishedAt: video.publishedAt || video.upload_date || new Date(),
          savedAt: video.savedAt || new Date(),
          // Include transcript data if available
          ...(transcript && { transcript }),
          ...(formattedTranscript && { formattedTranscript }),
          ...(language && { language }),
          ...(typeof is_generated !== 'undefined' && { is_generated })
        };

        // Create or update the video in the database
        const savedVideo = await SavedVideo.findOneAndUpdate(
          { userId: userId || 'anonymous', videoId: actualVideoId },
          videoData,
          { new: true, upsert: true }
        );

        savedVideos.push(savedVideo);
      } catch (videoError) {
        console.error(`Error saving video ${actualVideoId}:`, videoError);
        errors.push(`Failed to save video ${actualVideoId}: ${videoError.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Saved ${savedVideos.length} video(s) successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}`,
      count: savedVideos.length,
      savedVideos,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error saving multiple YouTube videos:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save videos',
      error: error.toString()
    });
  }
};

// Get saved YouTube videos for a user
const getUserSavedVideos = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Skip user check for anonymous users
    if (userId !== 'anonymous') {
      try {
        // Check if the user exists
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`User ${userId} not found in database, but will continue searching for videos`);
        }
      } catch (userError) {
        console.warn(`Error finding user ${userId}, but will continue searching for videos:`, userError.message);
      }
    }

    // Get all saved videos for the user, sorted by savedAt in descending order
    const savedVideos = await SavedVideo.find({ userId })
      .sort({ savedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: savedVideos.length,
      savedVideos
    });
  } catch (error) {
    console.error('Error retrieving saved YouTube videos:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve saved videos',
      error: error.toString()
    });
  }
};

// Delete a saved YouTube video
const deleteSavedVideo = async (req, res) => {
  try {
    const { userId, videoId } = req.params;

    if (!userId || !videoId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Video ID are required'
      });
    }

    // Check if the saved video exists
    const savedVideo = await SavedVideo.findOne({ userId, videoId });
    if (!savedVideo) {
      return res.status(404).json({
        success: false,
        message: 'Saved video not found'
      });
    }

    // Delete the saved video
    await SavedVideo.findOneAndDelete({ userId, videoId });

    return res.status(200).json({
      success: true,
      message: 'Saved video deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting saved YouTube video:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete saved video',
      error: error.toString()
    });
  }
};

/**
 * @desc    Save transcript for a YouTube video
 * @route   POST /api/youtube/save-video-transcript
 * @access  Public
 */
const saveVideoTranscript = async (req, res) => {
  try {
    const { video, videoId, transcript, formattedTranscript, language, is_generated, userId } = req.body;
    
    // Handle both direct parameters and nested video object
    const actualVideoId = video?.id || video?.videoId || videoId;
    const actualTranscript = video?.transcript || transcript;
    const actualFormattedTranscript = video?.formattedTranscript || formattedTranscript;
    const actualLanguage = video?.language || language || 'Unknown';
    const actualIsGenerated = typeof (video?.is_generated) !== 'undefined' ? video.is_generated : (typeof is_generated !== 'undefined' ? is_generated : false);
    
    if (!actualVideoId || (!actualTranscript && !actualFormattedTranscript)) {
      return res.status(400).json({
        success: false,
        message: 'Video ID and at least one transcript format are required'
      });
    }
    
    // Limit transcript size if it's too large
    const MAX_TRANSCRIPT_LENGTH = 200000; // ~200KB limit for database storage
    let safeTranscript = actualTranscript || '';
    let safeFormattedTranscript = actualFormattedTranscript || [];
    
    if (safeTranscript && safeTranscript.length > MAX_TRANSCRIPT_LENGTH) {
      console.log(`Transcript for video ${actualVideoId} exceeds size limit (${safeTranscript.length} chars). Trimming to ${MAX_TRANSCRIPT_LENGTH}`);
      safeTranscript = safeTranscript.substring(0, MAX_TRANSCRIPT_LENGTH) + 
        `... [Trimmed from ${safeTranscript.length} chars due to size limits]`;
    }
    
    // Also limit size of formatted transcript entries
    if (Array.isArray(safeFormattedTranscript)) {
      safeFormattedTranscript = safeFormattedTranscript.map(item => {
        if (typeof item === 'string' && item.length > MAX_TRANSCRIPT_LENGTH / 10) {
          return item.substring(0, MAX_TRANSCRIPT_LENGTH / 10) + "...";
        }
        return item;
      }).filter(Boolean);
    }
    
    // Find the existing saved video
    let savedVideo;
    
    try {
      savedVideo = await SavedVideo.findOne({ videoId: actualVideoId, userId: userId || 'anonymous' });
    } catch (dbError) {
      console.error('Database error when finding video:', dbError);
      // If there's an error with the database, we'll still allow saving to a new document
    }
    
    const transcriptData = {
      transcript: safeTranscript,
      formattedTranscript: safeFormattedTranscript,
      language: actualLanguage,
      is_generated: actualIsGenerated,
      updatedAt: new Date()
    };
    
    let result;
    
    if (savedVideo) {
      // Update existing video with transcript
      result = await SavedVideo.findOneAndUpdate(
        { videoId: actualVideoId, userId: userId || 'anonymous' },
        { $set: transcriptData },
        { new: true }
      );
      
      console.log(`Updated existing video (${actualVideoId}) with transcript`);
    } else {
      // No existing video found, create a minimal entry with just the transcript
      // Use video data if provided
      const videoData = video ? {
        userId: userId || 'anonymous',
        videoId: actualVideoId,
        title: video.title || 'Untitled Video',
        thumbnailUrl: video.thumbnailUrl || video.thumbnail || `https://img.youtube.com/vi/${actualVideoId}/mqdefault.jpg`,
        channelTitle: video.channelName || video.channelTitle || 'Unknown Channel',
        publishedAt: video.publishedAt || video.upload_date || new Date(),
        savedAt: video.savedAt || new Date(),
        ...transcriptData
      } : {
        userId: userId || 'anonymous',
        videoId: actualVideoId,
        title: 'Untitled Video',
        thumbnailUrl: `https://img.youtube.com/vi/${actualVideoId}/mqdefault.jpg`,
        ...transcriptData
      };
      
      result = await SavedVideo.create(videoData);
      
      console.log(`Created new video entry (${actualVideoId}) with transcript`);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Transcript saved successfully',
      data: result
    });
  } catch (error) {
    console.error('Error saving transcript:', error);
    // Ensure CORS headers are set even on error
    res.header('Access-Control-Allow-Origin', '*');
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save transcript',
      error: error.toString()
    });
  }
};

module.exports = {
  isValidYoutubeChannelId,
  getChannelVideos,
  createCarousels,
  saveYoutubeVideo,
  saveMultipleVideos,
  getUserSavedVideos,
  deleteSavedVideo,
  saveVideoTranscript
}; 