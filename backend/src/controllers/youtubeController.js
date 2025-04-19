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
    if (channelName.includes('youtube.com/')) {
      // Extract handle from URL
      const parts = channelName.split('/');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('@')) {
          channelHandle = parts[i];
          break;
        }
      }
    }
    
    if (!channelHandle.startsWith('@') && !channelName.includes('youtube.com/')) {
      channelHandle = '@' + channelHandle;
    }

    // First fetch the channel page to get channel ID
    try {
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
        return res.status(404).json({ 
          success: false, 
          message: 'Channel not found or could not extract channel ID' 
        });
      }
      
      const channelId = channelIdMatch[1];
      
      // Now fetch videos using RSS feed (no API key needed)
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const rssResponse = await axios.get(rssUrl);
      
      // Parse the XML
      const parser = new xml2js.Parser({ explicitArray: false });
      const feed = await new Promise((resolve, reject) => {
        parser.parseString(rssResponse.data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      if (!feed || !feed.feed || !feed.feed.entry) {
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
        if (entry['media:group'] && entry['media:group']['media:community'] && 
            entry['media:group']['media:community']['media:statistics'] && 
            entry['media:group']['media:community']['media:statistics'].$) {
          viewCount = parseInt(entry['media:group']['media:community']['media:statistics'].$.views, 10) || 0;
        }
        
        return {
          id: videoId,
          title: entry.title,
          thumbnail: thumbnailUrl,
          url: `https://youtube.com/watch?v=${videoId}`,
          duration: "N/A", // Duration not available from RSS feed
          view_count: viewCount,
          upload_date: entry.published
        };
      });
      
      return res.status(200).json({
        success: true,
        data: videos
      });
    } catch (fetchError) {
      console.error('Error fetching channel data:', fetchError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch channel data',
        error: fetchError.message
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