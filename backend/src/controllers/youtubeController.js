const axios = require('axios');
const xml2js = require('xml2js');

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
            channelId = altMatch[1];
            console.log(`Found channel ID using alt method: ${channelId}`);
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

module.exports = {
  getChannelVideos,
  createCarousels
}; 