const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const { getTranslation } = require('../utils/translations');
const Tweet = require('../models/tweetModel');
const { TwitterApi } = require('twitter-api-v2');

// Twitter API v2 base URL
const TWITTER_API_BASE_URL = 'https://api.twitter.com/2';

// Configuration for the Twitter API
const RAPID_API_KEY = process.env.RAPID_API_KEY || '1c0f30351amsh154d75323888fa1p1cf4bcjsn6c692ac3286e';
const RAPID_API_HOST = 'twitter154.p.rapidapi.com';

// User configurable options
const TwitterConfig = {
  fetchLimit: 50, // Default number of tweets to fetch initially
  maxTweets: 200, // Maximum number of tweets to fetch in total
  threadsToProcess: 10, // Number of threads to process for replies
  maxContinuations: 3, // Maximum number of continuation fetches
  replyMaxPages: 4, // Maximum number of pages when fetching replies
  retryDelay: 3000, // Delay between retries in ms
};

// Cache for API responses
const API_CACHE = {
  tweetDetails: new Map(),
  userTweets: new Map(),
  failedRequests: new Map()
};

// Rate limiting
const MIN_API_CALL_INTERVAL = 2000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 3000;
const FAILED_REQUEST_EXPIRY = 10 * 60 * 1000;

let lastApiCallTime = 0;
const requestQueue = [];
let isProcessingQueue = false;

// Helper functions
const rateLimit = async () => {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  
  if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_API_CALL_INTERVAL - timeSinceLastCall));
  }
  lastApiCallTime = Date.now();
};

const processQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      try {
        await request();
        await rateLimit();
      } catch (error) {
        console.error('Error processing queued request:', error);
      }
    }
  }
  isProcessingQueue = false;
};

const queueRequest = (request) => {
  return new Promise((resolve, reject) => {
    const wrappedRequest = async () => {
      try {
        const result = await request();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    requestQueue.push(wrappedRequest);
    processQueue();
  });
};

const hasRecentlyFailed = (url) => {
  const failedRequest = API_CACHE.failedRequests.get(url);
  if (!failedRequest) return false;
  
  const now = Date.now();
  if (now - failedRequest.timestamp > FAILED_REQUEST_EXPIRY) {
    API_CACHE.failedRequests.delete(url);
    return false;
  }
  
  if (failedRequest.retryAfter && now > failedRequest.retryAfter) {
    API_CACHE.failedRequests.delete(url);
    return false;
  }
  
  return true;
};

const recordFailedRequest = (url, errorCode, retryAfter) => {
  API_CACHE.failedRequests.set(url, {
    timestamp: Date.now(),
    errorCode,
    retryAfter: retryAfter ? Date.now() + retryAfter : undefined
  });
  
  // Clean up old failed requests
  for (const [key, value] of API_CACHE.failedRequests.entries()) {
    if (Date.now() - value.timestamp > FAILED_REQUEST_EXPIRY) {
      API_CACHE.failedRequests.delete(key);
    }
  }
};

// API request function with retry logic
const makeApiRequest = async (url, retryCount = 0) => {
  if (hasRecentlyFailed(url)) {
    throw new Error(`Skipping recently failed request to: ${url}`);
  }
  
  const executeRequest = async () => {
    await rateLimit();
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'x-rapidapi-key': RAPID_API_KEY,
          'x-rapidapi-host': RAPID_API_HOST,
        },
        timeout: 120000 // Increased to 2 minutes
      };
      
      axios.get(url, options)
        .then(response => {
          resolve(response.data);
        })
        .catch(error => {
          if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(2, retryCount);
            console.warn(`Rate limited (429). Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            
            setTimeout(() => {
              makeApiRequest(url, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, delay);
          } else {
            if (error.response?.status === 429) {
              recordFailedRequest(url, error.response.status, 60000);
            } else {
              recordFailedRequest(url, error.response?.status || 500);
            }
            reject(error);
          }
        });
    });
  };
  
  return retryCount > 0 ? executeRequest() : queueRequest(executeRequest);
};

// Improved thread detection
const detectTruncatedText = (text) => {
  if (!text || text.trim().length === 0) return false;
  
  // Obvious truncation indicators
  if (text.endsWith('…') || text.endsWith('...')) return true;
  if (text.includes('… https://') || text.includes('... https://')) return true;
  
  // Check for abrupt endings
  const lastWords = text.trim().split(/\s+/).slice(-2);
  const commonTruncationEnders = ['the', 'a', 'an', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'like', 'of', 'all'];
  if (lastWords.length > 0 && commonTruncationEnders.includes(lastWords[lastWords.length - 1].toLowerCase())) {
    return true;
  }
  
  // Check for non-Latin scripts
  const hasNonLatinScript = /[\u0900-\u097F\u0600-\u06FF\u0590-\u05FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/.test(text);
  const thresholdLength = hasNonLatinScript ? 180 : 240;
  
  if (text.length >= thresholdLength && !/[.!?"]$/.test(text.trim())) {
      return true;
  }
  
  return false;
};

// Enhanced tweet processing
const processTweet = (tweet) => {
    const textContent = tweet.extended_text || tweet.extended_tweet?.full_text || tweet.full_text || tweet.text || '';
    const isLikelyTruncated = detectTruncatedText(textContent);
    
    // Handle retweets and quoted tweets
    let finalText = textContent;
    let isRetweet = false;
    let retweetedTweet = null;
    let quotedTweet = null;
    
    // Check if this is a retweet
    if (tweet.retweeted_tweet || finalText.startsWith('RT @')) {
        isRetweet = true;
        retweetedTweet = tweet.retweeted_tweet ? processTweet(tweet.retweeted_tweet) : null;
        // For retweets, preserve the original RT format but also include the retweeted content
        if (retweetedTweet) {
            finalText = `RT @${retweetedTweet.author.username}: ${retweetedTweet.full_text || retweetedTweet.text}`;
        }
    }
    
    // Check if this is a quoted tweet
    if (tweet.quoted_tweet) {
        quotedTweet = processTweet(tweet.quoted_tweet);
        // For quoted tweets, preserve the original text and add the quoted content
        finalText = `${finalText}\n\nQuoted: @${quotedTweet.author.username}: ${quotedTweet.full_text || quotedTweet.text}`;
    }
    
    // Get media URLs efficiently - include media from retweets and quotes
    const mediaUrls = [
        ...(tweet.media_urls || []),
        ...(tweet.extended_entities?.media?.map((m) => m.media_url_https || m.video_info?.variants?.[0]?.url) || []),
        ...(tweet.entities?.media?.map((m) => m.media_url_https || m.video_info?.variants?.[0]?.url) || []),
        // Include media from retweeted/quoted tweets
        ...(retweetedTweet?.media?.map(m => m.url) || []),
        ...(quotedTweet?.media?.map(m => m.url) || [])
    ].filter(Boolean);
    
    // Process media items at once
    const processedMedia = mediaUrls.map((url, i) => ({
        media_key: `media-${tweet.tweet_id}-${i}`,
        type: url.includes('.mp4') || url.includes('/video/') ? 'video' : 
              url.includes('.gif') ? 'animated_gif' : 'photo',
        url: url,
        preview_image_url: tweet.extended_entities?.media?.[0]?.media_url_https || url,
    }));

    // Improved text cleaning - preserve important URLs
    let cleanedText = finalText;
    
    // Extract all URLs first to preserve important ones
    const urlRegex = /https?:\/\/[^\s]+/g;
    const allUrls = cleanedText.match(urlRegex) || [];
    const importantUrls = allUrls.filter(url => {
        // Keep non-t.co URLs (these are actual content URLs)
        if (!url.includes('t.co/')) return true;
        // Keep short t.co URLs that might be important
        if (url.length < 25) return true;
        return false;
    });
    
    // Only remove trailing t.co URLs that are likely tracking/preview URLs
    // Keep all other URLs intact
    cleanedText = cleanedText.replace(/\s*https:\/\/t\.co\/\w{10,}\s*$/g, '');
    
    // If we removed a URL but have important URLs, make sure at least one important URL is preserved
    if (importantUrls.length > 0 && !cleanedText.includes('http')) {
        cleanedText += `\n${importantUrls[0]}`;
    }
    
    // Clean up excessive whitespace and ellipsis only if no important URLs are nearby
    if (!importantUrls.some(url => cleanedText.includes(url))) {
        cleanedText = cleanedText.replace(/(\s*[…\.]{3,})$/g, '');
    }
    
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();
    
    // Better thread and conversation detection
    const conversation_id = tweet.conversation_id || tweet.in_reply_to_status_id || tweet.tweet_id;
    const thread_id = tweet.thread_id || conversation_id;
    const in_reply_to_tweet_id = tweet.in_reply_to_tweet_id || tweet.in_reply_to_status_id;
    
    // Handle self-thread detection
    const isSelfThread = tweet.in_reply_to_user_id && 
                       tweet.user?.user_id && 
                       tweet.in_reply_to_user_id === tweet.user.user_id;
    
    // Only log important conversation information
    if (in_reply_to_tweet_id && (conversation_id !== tweet.tweet_id) && isSelfThread) {
        console.log(`Tweet ${tweet.tweet_id} is part of self-thread with conversation ID ${conversation_id}`);
    }
      
    return {
        id: tweet.tweet_id,
        text: tweet.text || '',
        full_text: cleanedText,
        created_at: tweet.creation_date,
        author: {
            id: tweet.user?.user_id,
            name: tweet.user?.name,
            username: tweet.user?.username,
            profile_image_url: tweet.user?.profile_pic_url
        },
        public_metrics: {
            reply_count: tweet.reply_count || 0,
            retweet_count: tweet.retweet_count || 0,
            like_count: tweet.favorite_count || 0,
            quote_count: tweet.quote_count || 0
        },
        media: processedMedia,
        conversation_id,
        in_reply_to_user_id: tweet.in_reply_to_user_id,
        in_reply_to_tweet_id,
        is_long: textContent.length > 280 || isLikelyTruncated,
        thread_id,
        is_self_thread: isSelfThread,
        is_retweet: isRetweet,
        retweeted_tweet: retweetedTweet,
        quoted_tweet: quotedTweet,
        urls: importantUrls, // Include extracted URLs for reference
    };
};

// Fetch all replies for a tweet to build complete threads
const fetchAllReplies = async (tweetId, username) => {
  const allReplies = [];
  let continuationToken = null;
  let attempts = 0;
  const REPLY_MAX_ATTEMPTS = 3;
  const REPLY_MAX_PAGES = TwitterConfig.replyMaxPages;
  const uniqueReplyIds = new Set();
  let pageCount = 0;
  
  console.log(`Starting to fetch replies for tweet ${tweetId} by user ${username}`);

  do {
    try {
      if (pageCount >= REPLY_MAX_PAGES) {
        console.log(`Reached maximum page limit (${REPLY_MAX_PAGES}) for tweet ${tweetId}, stopping`);
        break;
      }

      const url = continuationToken 
        ? `https://twitter154.p.rapidapi.com/tweet/replies/continuation?tweet_id=${tweetId}&continuation_token=${encodeURIComponent(continuationToken)}`
        : `https://twitter154.p.rapidapi.com/tweet/replies?tweet_id=${tweetId}`;

      console.log(`Fetching replies for tweet ${tweetId}, page ${pageCount + 1}`);
      const response = await makeApiRequest(url);
      
      if (response?.replies?.length) {
        const filteredReplies = response.replies
          .map(processTweet)
          .filter((t) => {
            const isAuthor = t.author.username.toLowerCase() === username.toLowerCase();
            if (!isAuthor) return false;
            
            if (uniqueReplyIds.has(t.id)) return false;
            
            const tweetText = t.full_text || t.text || '';
            if (tweetText.match(/^@[a-zA-Z0-9_]+/) && !tweetText.startsWith(`@${username}`)) {
              console.log(`Skipping reply ${t.id} because it mentions another user: "${tweetText.substring(0, 30)}..."`);
              return false;
            }
            
            uniqueReplyIds.add(t.id);
            return true;
          });
        
        if (filteredReplies.length > 0) {
          allReplies.push(...filteredReplies);
          console.log(`Found ${filteredReplies.length} new replies for tweet ${tweetId} (page ${pageCount + 1})`);
          
          if (response?.continuation_token) {
            continuationToken = response.continuation_token;
          }
        } else {
          console.log(`No new author replies found on page ${pageCount + 1} for tweet ${tweetId}`);
          
          if (response.replies.length >= 10 && response?.continuation_token) {
            continuationToken = response.continuation_token;
          } else {
            continuationToken = null;
          }
        }
      } else {
        console.log(`No replies found for tweet ${tweetId} (page ${pageCount + 1})`);
        continuationToken = null;
      }

      pageCount++;
      attempts = 0;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
      console.error(`Error fetching replies for tweet ${tweetId} (attempt ${attempts+1}):`, error);
      attempts++;
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (attempts >= REPLY_MAX_ATTEMPTS) {
        console.log(`Reached maximum attempts (${REPLY_MAX_ATTEMPTS}) for tweets ${tweetId}, moving on`);
        break;
      }
    }
  } while (continuationToken && attempts < REPLY_MAX_ATTEMPTS && pageCount < REPLY_MAX_PAGES);

  if (allReplies.length > 1) {
    allReplies.sort((a, b) => {
      try {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } catch (err) {
        return Number(BigInt(a.id) - BigInt(b.id));
      }
    });
    
    allReplies.forEach((tweet, index) => {
      tweet.thread_position = index;
      tweet.thread_index = index;
    });
  }

  console.log(`Total replies fetched for tweet ${tweetId}: ${allReplies.length} across ${pageCount} pages`);
  return allReplies;
};

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
 * Enhanced user tweets fetching with complete threads
 * @route GET /api/twitter/user/:username
 * @access Private  
 */
const getUserTweets = asyncHandler(async (req, res) => {
  try {
    const { username } = req.params;
    const { initialFetch = 50, maxTweets = 200 } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required' 
      });
    }

    console.log(`Fetching ${initialFetch} tweets for user ${username}`);
    
    // Check cache first
    const cacheKey = username.toLowerCase();
    if (API_CACHE.userTweets.has(cacheKey)) {
      console.log(`Using cached tweets for user ${username}`);
      const cachedTweets = API_CACHE.userTweets.get(cacheKey);
      return res.status(200).json({
        success: true,
        count: cachedTweets.length,
        data: cachedTweets
      });
    }

    // Set response timeout to 4 minutes
    req.setTimeout(360000);
    res.setTimeout(360000);
    
    // Keep connection alive during long processing
    const keepAlive = setInterval(() => {
      if (!res.headersSent) {
        res.write(' '); // Send whitespace to keep connection alive
      }
    }, 30000);

    // Get user ID first
    const userData = await makeApiRequest(`https://twitter154.p.rapidapi.com/user/details?username=${username}`);
    const userId = userData.user_id;
    if (!userId) {
      return res.status(404).json({ 
        success: false, 
        message: `Could not find user ID for @${username}` 
      });
    }

    // Initial fetch
    const initialData = await makeApiRequest(`https://twitter154.p.rapidapi.com/user/tweets?username=${username}&limit=${initialFetch}&user_id=${userId}&include_replies=false&include_pinned=false&includeFulltext=true`);
    
    // Process and filter tweets by author
    let allTweets = (initialData.results || [])
      .map(processTweet)
      .filter(tweet => {
        const isAuthor = tweet.author.username.toLowerCase() === username.toLowerCase();
        if (!isAuthor) return false;
        
        const tweetText = tweet.full_text || tweet.text || '';
        if (tweetText.match(/^@[a-zA-Z0-9_]+/) && !tweetText.startsWith(`@${username}`)) {
          console.log(`Skipping tweet ${tweet.id} because it mentions another user: "${tweetText.substring(0, 30)}..."`);
          return false;
        }
        
        return true;
      });

    console.log(`Found ${allTweets.length} tweets in initial fetch for ${username}`);

    const uniqueTweetIds = new Set();
    allTweets.forEach(tweet => uniqueTweetIds.add(tweet.id));

    // Process threads with highest reply counts first
    const threadsToProcess = [...allTweets]
      .filter(tweet => tweet.public_metrics.reply_count && tweet.public_metrics.reply_count > 0) 
      .sort((a, b) => (b.public_metrics.reply_count || 0) - (a.public_metrics.reply_count || 0))
      .slice(0, TwitterConfig.threadsToProcess);

    console.log(`Selected ${threadsToProcess.length} threads to fetch replies for`);
    
    // Process threads first to build complete conversations
    for (const tweet of threadsToProcess) {
      try {
        console.log(`Fetching replies for tweet ${tweet.id} (has ${tweet.public_metrics.reply_count} replies)`);
        const replies = await fetchAllReplies(tweet.id, username);
        
        const newReplies = replies.filter(reply => {
          if (uniqueTweetIds.has(reply.id)) return false;
          uniqueTweetIds.add(reply.id);
          return true;
        });
        
        if (newReplies.length > 0) {
          console.log(`Added ${newReplies.length} new replies for tweet ${tweet.id}`);
          allTweets.push(...newReplies);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fetching replies for tweet ${tweet.id}:`, error);
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }

    console.log(`After fetching replies, total tweet count: ${allTweets.length}`);

    // Continue fetching more tweets using continuation token if needed
    let continuationToken = initialData.continuation_token;
    let continuationCount = 0;
    
    while (continuationToken && allTweets.length < maxTweets && continuationCount < TwitterConfig.maxContinuations) {
      try {
        console.log(`Fetching continuation ${continuationCount + 1} for ${username}`);
        const continuationData = await makeApiRequest(`https://twitter154.p.rapidapi.com/user/tweets/continuation?username=${username}&continuation_token=${continuationToken}&user_id=${userId}`);
        
        const additionalTweets = (continuationData.results || [])
          .map(processTweet)
          .filter(tweet => {
            const isAuthor = tweet.author.username.toLowerCase() === username.toLowerCase();
            const isUnique = !uniqueTweetIds.has(tweet.id);
            
            if (!isAuthor || !isUnique) return false;
            
            const tweetText = tweet.full_text || tweet.text || '';
            if (tweetText.match(/^@[a-zA-Z0-9_]+/) && !tweetText.startsWith(`@${username}`)) {
              console.log(`Skipping tweet ${tweet.id} because it mentions another user: "${tweetText.substring(0, 30)}..."`);
              return false;
            }
            
            uniqueTweetIds.add(tweet.id);
            return true;
          });
        
        console.log(`Found ${additionalTweets.length} new tweets in continuation ${continuationCount + 1}`);
        
        if (additionalTweets.length > 0) {
          allTweets.push(...additionalTweets);
        }
        
        continuationToken = continuationData.continuation_token;
        continuationCount++;
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Error fetching continuation ${continuationCount + 1}:`, error);
        break;
      }
    }

    console.log(`Fetched ${allTweets.length} total tweets (${uniqueTweetIds.size} unique)`);
    
    // Clear keep-alive interval
    clearInterval(keepAlive);
    
    // Cache and return results
    API_CACHE.userTweets.set(cacheKey, allTweets);
    
    // Save tweets for authenticated users
    if (req.user) {
      try {
        console.log(`Saving ${allTweets.length} tweets for authenticated user ${req.user._id} (Twitter: ${username})`);
        
        // Delete existing tweets for this user
        await Tweet.deleteMany({ 
          userId: req.user._id, 
          'author.username': { $regex: new RegExp(`^${username}$`, 'i') }
        });
        
        // Save new tweets
        const tweetsToSave = allTweets.map(tweet => ({
          ...tweet,
          userId: req.user._id,
          createdAt: new Date()
        }));
        
        await Tweet.insertMany(tweetsToSave);
      } catch (saveError) {
        console.error('Error saving tweets:', saveError);
        // Don't fail the request if saving fails
      }
    }
    
    res.status(200).json({
      success: true,
      count: allTweets.length,
      data: allTweets
    });
  } catch (error) {
    console.error('Error fetching tweets:', error);
    
    // Clear keep-alive interval on error
    if (typeof keepAlive !== 'undefined') {
      clearInterval(keepAlive);
    }
    
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

    // Get authenticated user ID
    const authenticatedUserId = req.user?.id || req.user?._id?.toString();
    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to save tweets'
      });
    }

    // Log the incoming request
    console.log(`Saving ${tweets.length} tweets for authenticated user ${authenticatedUserId} (Twitter: ${username || 'anonymous'})`);

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
          tweet.thread_id = threadId;
          
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
      // Check if tweet already exists for this authenticated user
      const existingTweet = await Tweet.findOne({ 
        id: tweet.id,
        user: authenticatedUserId 
      });
      
      // Handle duplicate tweets based on options
      if (existingTweet) {
        if (skipDuplicates) {
          // Skip this tweet if it's a duplicate for this user
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
            { id: tweet.id, user: authenticatedUserId },
            updateFields,
            { new: true }
          );
          savedTweets.push(updatedTweet);
          continue;
        }
        // If not preserving or skipping, we'll overwrite below
      }
      
      // Ensure the tweet has proper user association and current timestamp
      const tweetToSave = {
        ...tweet,
        savedBy: saveUsername,        // Keep for backwards compatibility
        user: authenticatedUserId,    // Primary user association
        savedAt: new Date()
      };
      
      const savedTweet = await Tweet.findOneAndUpdate(
        { id: tweet.id, user: authenticatedUserId },
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

// Get all saved tweets for the authenticated user
const getSavedTweets = async (req, res) => {
  try {
    // Get authenticated user ID
    const authenticatedUserId = req.user?.id || req.user?._id?.toString();
    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view saved tweets'
      });
    }
    
    const tweets = await Tweet.find({ user: authenticatedUserId }).sort({ savedAt: -1 });
    
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
    
    // Get authenticated user ID
    const authenticatedUserId = req.user?.id || req.user?._id?.toString();
    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to delete tweets'
      });
    }
    
    // Delete only tweets saved by this authenticated user
    const tweet = await Tweet.findOneAndDelete({ 
      id,
      user: authenticatedUserId
    });
    
    if (!tweet) {
      console.log(`Tweet ${id} not found for user ${authenticatedUserId}`);
      
      return res.status(404).json({
        success: false,
        message: `Tweet with ID ${id} not found or not owned by current user`
      });
    }
    
    res.status(200).json({
      success: true,
      data: tweet,
      message: 'Tweet deleted successfully'
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

const getTweets = asyncHandler(async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'Twitter username or profile URL is required' 
      });
    }

    // Process the username/URL to get the correct username
    let twitterUsername = username;
    
    // If it's a URL, extract the username
    if (twitterUsername.includes('twitter.com/') || twitterUsername.includes('x.com/')) {
      twitterUsername = twitterUsername.split('/').pop();
    }
    
    // Remove @ symbol if present
    twitterUsername = twitterUsername.replace('@', '');
    
    // Remove any trailing slashes
    twitterUsername = twitterUsername.replace(/\/$/, '');
    
    console.log(`Fetching tweets for Twitter user: ${twitterUsername}`);

    // Initialize the Twitter API client
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    // Get user details
    const user = await client.v2.userByUsername(twitterUsername, {
      'user.fields': ['profile_image_url', 'description', 'public_metrics']
    });

    if (!user.data) {
      return res.status(404).json({
        success: false,
        error: 'Twitter user not found'
      });
    }

    // Get user's tweets
    const tweets = await client.v2.userTimeline(user.data.id, {
      max_results: 30,
      'tweet.fields': ['created_at', 'public_metrics', 'entities', 'attachments'],
      'media.fields': ['url', 'preview_image_url', 'type'],
      expansions: ['attachments.media_keys']
    });

    // Process tweets
    const processedTweets = tweets.data.data.map(tweet => {
      // ... existing tweet processing code ...
    });

    res.status(200).json({
      success: true,
      profileData: {
        name: user.data.name,
        username: user.data.username,
        description: user.data.description,
        profileImageUrl: user.data.profile_image_url,
        metrics: user.data.public_metrics
      },
      posts: processedTweets,
      totalPosts: processedTweets.length,
      message: processedTweets.length > 0 ? 
        `Found ${processedTweets.length} recent tweets` : 
        'No tweets found for this user.'
    });
  } catch (error) {
    console.error('Error fetching tweets:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch tweets',
      message: error.message
    });
  }
});

module.exports = {
  getTwitterProfile,
  getUserTweets,
  getTwitterAnalytics,
  saveTweets,
  getSavedTweets,
  getSavedTweetsByUser,
  getSavedUsers,
  deleteTweet,
  deleteTweetsByUser,
  getTweets
}; 