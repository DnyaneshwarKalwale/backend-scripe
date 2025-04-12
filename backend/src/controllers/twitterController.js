const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const { getTranslation } = require('../utils/translations');
const Tweet = require('../models/tweetModel');

// Twitter API v2 base URL
const TWITTER_API_BASE_URL = 'https://api.twitter.com/2';

// Configuration for the Twitter API
const RAPID_API_KEY = process.env.RAPID_API_KEY || '4738e035f2mshf219c943077bffap1d4150jsn085da35f2f75';
const RAPID_API_HOST = 'twitter154.p.rapidapi.com';

/**
 * Get Twitter user profile data
 * @route GET /api/twitter/profile
 * @access Private
 */
const getTwitterProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.twitterId) {
      res.status(400);
      throw new Error(getTranslation('twitterNotConnected', req.language));
    }
    
    // In a real implementation, we would use the Twitter API client
    // to fetch real user data using access tokens stored for this user
    
    // For now, generate sample data based on the user's info
    const username = user.firstName.toLowerCase() + (user.lastName ? user.lastName.toLowerCase() : '');
    
    const twitterProfile = {
      id: user.twitterId,
      username: username,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
      bio: `Twitter user connected with Dekcion. Generating amazing content with AI.`,
      location: "Global",
      url: `https://twitter.com/${username}`,
      joinedDate: "January 2022",
      following: 512,
      followers: 1024,
      verified: false
    };
    
    res.status(200).json({
      success: true,
      data: twitterProfile
    });
  } catch (error) {
    console.error('Twitter Profile Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterFetchError', req.language) || 'Error fetching Twitter profile');
  }
});

/**
 * Get user's recent tweets
 * @route GET /api/twitter/tweets
 * @access Private
 */
const getUserTweets = asyncHandler(async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required' 
      });
    }

    // First get the user ID
    const userResponse = await axios.get(`https://twitter154.p.rapidapi.com/user/details?username=${username}`, {
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': RAPID_API_HOST,
      },
    });

    const userData = userResponse.data;
    const userId = userData.user_id;

    if (!userId) {
      return res.status(404).json({ 
        success: false, 
        message: `Could not find user ID for @${username}` 
      });
    }

    // Then fetch tweets
    const response = await axios.get(`https://twitter154.p.rapidapi.com/user/tweets?username=${username}&limit=50&includeReplies=false&includeFulltext=true&includeExtendedContent=true&includeQuoted=true&include_entities=true&includeAttachments=true&sort_by=recency&include_video_info=true&includeMedia=true`, {
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': RAPID_API_HOST,
      },
    });

    const tweets = processTweets(response.data);
    
    res.status(200).json({
      success: true,
      count: tweets.length,
      data: tweets
    });
  } catch (error) {
    console.error('Error fetching tweets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tweets',
      error: error.message
    });
  }
});

/**
 * Get user's Twitter analytics
 * @route GET /api/twitter/analytics
 * @access Private
 */
const getTwitterAnalytics = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.twitterId) {
      res.status(400);
      throw new Error(getTranslation('twitterNotConnected', req.language));
    }
    
    // Generate sample analytics data
    const now = Date.now();
    const days = 7;
    const labels = [];
    const impressionsData = [];
    const engagementData = [];
    const followersData = [];
    
    // Generate data for the last 7 days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - (i * 86400000));
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      // Generate realistic-looking data with some randomness but general upward trend
      const dayOffset = days - i;
      
      // Impressions: 1000-3500 with slight upward trend
      impressionsData.push(Math.floor(1000 + (dayOffset * 300) + (Math.random() * 500)));
      
      // Engagement: 4-10% engagement rate
      engagementData.push(Number((4 + (dayOffset * 0.6) + (Math.random() * 2)).toFixed(1)));
      
      // Followers: 100-200 with growth
      followersData.push(Math.floor(100 + (dayOffset * 5) + (Math.random() * 10)));
    }
    
    const analyticsData = {
      impressions: {
        data: impressionsData,
        labels: labels,
        increase: 23,
        timeframe: "Last 7 days"
      },
      engagement: {
        data: engagementData,
        labels: labels,
        increase: 15,
        timeframe: "Last 7 days"
      },
      followers: {
        data: followersData,
        labels: labels,
        increase: 8,
        timeframe: "Last 7 days"
      },
      summary: {
        totalImpressions: impressionsData.reduce((a, b) => a + b, 0),
        averageEngagement: Number((engagementData.reduce((a, b) => a + b, 0) / days).toFixed(1)),
        followerGrowth: followersData[days - 1] - followersData[0],
        bestPerformingTweet: {
          text: "How I increased my Twitter engagement by 300% using AI content generation. A thread on my journey with @Dekcion 🧵",
          impressions: 3500,
          engagement: 9.3
        }
      }
    };
    
    res.status(200).json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('Twitter Analytics Error:', error);
    res.status(500);
    throw new Error(getTranslation('twitterFetchError', req.language) || 'Error fetching analytics');
  }
});

// Save selected tweets to the database
const saveTweets = async (req, res) => {
  try {
    const { tweets, username, options = {} } = req.body;
    
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of tweets to save'
      });
    }

    // Log the incoming request
    console.log(`Saving ${tweets.length} tweets for user ${username || 'anonymous'}`);

    const savedTweets = [];
    const skippedTweets = [];
    const saveUsername = username || 'anonymous';
    
    // Extract options with defaults
    const preserveExisting = options.preserveExisting !== false; // Default to true
    const skipDuplicates = options.skipDuplicates !== false; // Default to true
    const preserveThreadOrder = options.preserveThreadOrder !== false; // Default to true
    
    // Verify all tweets have the essential fields
    const verifiedTweets = tweets.filter(tweet => {
      const hasRequiredFields = tweet && tweet.id && (tweet.text || tweet.full_text) && tweet.created_at;
      if (!hasRequiredFields) {
        console.warn('Skipping tweet with missing required fields:', 
          tweet ? tweet.id : 'undefined tweet');
      }
      return hasRequiredFields;
    });
    
    // Group tweets by thread if preserveThreadOrder is true
    let tweetsToProcess = verifiedTweets;
    
    if (preserveThreadOrder) {
      // Organize tweets into thread groups - by thread_id or conversation_id
      const threadGroups = {};
      
      // First pass: group tweets by thread_id or conversation_id
      verifiedTweets.forEach(tweet => {
        const threadId = tweet.thread_id || tweet.conversation_id;
        if (threadId) {
          if (!threadGroups[threadId]) {
            threadGroups[threadId] = [];
          }
          threadGroups[threadId].push(tweet);
        }
      });
      
      // Second pass: sort each thread by thread_position, thread_index, or creation date
      Object.keys(threadGroups).forEach(threadId => {
        threadGroups[threadId].sort((a, b) => {
          // First by thread_position if available
          if (a.thread_position !== undefined && b.thread_position !== undefined) {
            return a.thread_position - b.thread_position;
          }
          
          // Then by thread_index if available
          if (a.thread_index !== undefined && b.thread_index !== undefined) {
            return a.thread_index - b.thread_index;
          }
          
          // Finally by creation date
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        
        // Add thread_index to each tweet for proper ordering
        threadGroups[threadId].forEach((tweet, index) => {
          tweet.thread_index = index;
          tweet.thread_id = thread_id;
          
          // Mark if this is the root tweet (first in thread)
          if (index === 0) {
            tweet.is_root_tweet = true;
          }
        });
      });
      
      // Combine all tweets in threads in proper order, followed by standalone tweets
      tweetsToProcess = [];
      
      // First add all thread tweets in proper order
      Object.values(threadGroups).forEach(threadTweets => {
        if (threadTweets.length > 0) {
          tweetsToProcess.push(...threadTweets);
        }
      });
      
      // Then add standalone tweets that don't have a thread_id or conversation_id
      verifiedTweets.forEach(tweet => {
        if (!tweet.thread_id && !tweet.conversation_id) {
          tweetsToProcess.push(tweet);
        }
      });
    }
    
    // Save each tweet
    for (const tweet of tweetsToProcess) {
      // Check if tweet already exists
      const existingTweet = await Tweet.findOne({ id: tweet.id });
      
      // Handle duplicate tweets based on options
      if (existingTweet) {
        if (skipDuplicates) {
          // Skip this tweet if it's a duplicate
          skippedTweets.push(existingTweet);
          continue;
        } else if (preserveExisting) {
          // Update only the metadata
          const updateFields = { 
            savedAt: new Date(),
            thread_id: tweet.thread_id || existingTweet.thread_id,
            thread_index: tweet.thread_index !== undefined ? tweet.thread_index : existingTweet.thread_index,
          };
          
          // Update non-thread metadata if available
          if (tweet.author) updateFields.author = tweet.author;
          if (tweet.media_urls) updateFields.media_urls = tweet.media_urls;
          if (tweet.media) updateFields.media = tweet.media;
          
          const updatedTweet = await Tweet.findOneAndUpdate(
            { id: tweet.id },
            updateFields,
            { new: true }
          );
          savedTweets.push(updatedTweet);
          continue;
        }
        // If not preserving or skipping, we'll overwrite below
      }
      
      // Ensure the tweet has a savedBy field and current timestamp
      const tweetToSave = {
        ...tweet,
        savedBy: saveUsername,
        savedAt: new Date()
      };
      
      const savedTweet = await Tweet.findOneAndUpdate(
        { id: tweet.id },
        tweetToSave,
        { new: true, upsert: true }
      );
      
      savedTweets.push(savedTweet);
    }
    
    res.status(201).json({
      success: true,
      count: savedTweets.length,
      skippedCount: skippedTweets.length,
      data: savedTweets
    });
  } catch (error) {
    console.error('Error saving tweets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save tweets',
      error: error.message
    });
  }
};

// Get all saved tweets
const getSavedTweets = async (req, res) => {
  try {
    const tweets = await Tweet.find().sort({ savedAt: -1 });
    
    res.status(200).json({
      success: true,
      count: tweets.length,
      data: tweets
    });
  } catch (error) {
    console.error('Error fetching saved tweets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved tweets',
      error: error.message
    });
  }
};

// Get saved tweets by username
const getSavedTweetsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    
    const tweets = await Tweet.find({ 
      'author.username': username 
    }).sort({ savedAt: -1 });
    
    res.status(200).json({
      success: true,
      count: tweets.length,
      data: tweets
    });
  } catch (error) {
    console.error('Error fetching saved tweets by user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved tweets by user',
      error: error.message
    });
  }
};

// Get all users who have saved tweets
const getSavedUsers = async (req, res) => {
  try {
    const users = await Tweet.aggregate([
      { $group: { _id: '$savedBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users with saved tweets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users with saved tweets',
      error: error.message
    });
  }
};

// Delete a saved tweet
const deleteTweet = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Tweet ID is required'
      });
    }
    
    const tweet = await Tweet.findOneAndDelete({ id });
    
    if (!tweet) {
      return res.status(404).json({
        success: false,
        message: `Tweet with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: tweet
    });
  } catch (error) {
    console.error('Error deleting tweet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tweet',
      error: error.message
    });
  }
};

// Delete all tweets for a specific user
const deleteTweetsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    
    const result = await Tweet.deleteMany({ 'author.username': username });
    
    res.status(200).json({
      success: true,
      count: result.deletedCount,
      message: `Deleted ${result.deletedCount} tweets for user @${username}`
    });
  } catch (error) {
    console.error('Error deleting tweets by user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tweets by user',
      error: error.message
    });
  }
};

// Helper function to process tweets from the API response
const processTweets = (response) => {
  const results = response.results || [];
  return results.map(tweet => {
    // Extract media
    const media = processMedia(tweet);
    
    // Check if this is likely a thread
    const isThread = tweet.conversation_id && tweet.conversation_id === tweet.id;
    
    // Determine if this is a "long" tweet (more than 280 characters)
    const isLong = (tweet.text && tweet.text.length > 280) || 
      (tweet.full_text && tweet.full_text.length > 280);
    
    // Organize metrics
    const public_metrics = {
      retweet_count: tweet.retweet_count || 0,
      reply_count: tweet.reply_count || 0,
      like_count: tweet.favorite_count || 0,
      quote_count: tweet.quote_count || 0
    };
    
    return {
      id: tweet.tweet_id || tweet.id,
      text: tweet.text || tweet.full_text || '',
      full_text: tweet.full_text || tweet.text || '',
      created_at: tweet.creation_date || tweet.created_at,
      public_metrics,
      author: {
        id: tweet.user?.user_id || tweet.user?.id,
        name: tweet.user?.name,
        username: tweet.user?.username,
        profile_image_url: tweet.user?.profile_pic_url
      },
      conversation_id: tweet.conversation_id,
      in_reply_to_user_id: tweet.in_reply_to_user_id,
      in_reply_to_tweet_id: tweet.in_reply_to_status_id,
      media,
      is_long: isLong,
      is_self_thread: isThread,
      category: isThread ? 'thread' : (isLong ? 'long' : 'normal')
    };
  });
};

// Helper function to process media from a tweet
const processMedia = (tweet) => {
  const media = [];
  
  // Process media from different API response formats
  if (tweet.media && Array.isArray(tweet.media)) {
    tweet.media.forEach(m => {
      media.push({
        media_key: m.media_key || m.id_str,
        type: m.type,
        url: m.media_url_https || m.media_url,
        preview_image_url: m.preview_image_url || m.media_url,
        width: m.width,
        height: m.height
      });
    });
  } else if (tweet.extended_entities && tweet.extended_entities.media) {
    tweet.extended_entities.media.forEach(m => {
      media.push({
        media_key: m.id_str,
        type: m.type,
        url: m.media_url_https || m.media_url,
        preview_image_url: m.preview_image_url || m.media_url,
        width: m.width,
        height: m.height
      });
    });
  }
  
  return media;
};

module.exports = {
  getTwitterProfile,
  getUserTweets,
  getTwitterAnalytics,
  saveTweets,
  getSavedTweets,
  getSavedTweetsByUser,
  getSavedUsers,
  deleteTweet,
  deleteTweetsByUser
}; 