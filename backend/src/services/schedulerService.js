const cron = require('node-cron');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const { linkedinController } = require('../controllers/linkedinController');
const axios = require('axios');

/**
 * Initialize the scheduler
 * This will set up a job that runs every minute to check for posts that need to be published
 */
const initScheduler = () => {
  console.log('Initializing post scheduler service...');
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledPosts();
    } catch (error) {
      console.error('Error in scheduler job:', error);
    }
  });
  
  console.log('Post scheduler initialized successfully');
};

/**
 * Process all scheduled posts that are due for publishing
 */
const processScheduledPosts = async () => {
  try {
    const now = new Date();
    
    // Find all scheduled posts with a scheduledTime in the past
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledTime: { $lte: now }
    }).populate('user', 'linkedinAccessToken linkedinId linkedinTokenExpiry');
    
    if (scheduledPosts.length === 0) {
      return;
    }
    
    console.log(`Found ${scheduledPosts.length} posts to publish`);
    
    // Process each post
    for (const post of scheduledPosts) {
      try {
        if (!post.user || !post.user.linkedinAccessToken) {
          console.error(`Cannot publish post ${post._id}: User has no LinkedIn access token`);
          post.status = 'failed';
          post.error = 'User has no LinkedIn access token';
          await post.save();
          continue;
        }
        
        if (!post.user.linkedinId) {
          console.error(`Cannot publish post ${post._id}: User has no LinkedIn ID`);
          post.status = 'failed';
          post.error = 'LinkedIn user ID not found';
          await post.save();
          continue;
        }
        
        // Check if token has expired
        if (post.user.linkedinTokenExpiry && post.user.linkedinTokenExpiry < now) {
          console.error(`LinkedIn token expired for post ${post._id}`);
          post.status = 'failed';
          post.error = 'LinkedIn access token has expired';
          await post.save();
          continue;
        }
        
        const accessToken = post.user.linkedinAccessToken;
        const userUrn = `urn:li:person:${post.user.linkedinId}`;
        
        // Prepare basic post data structure
        let linkedinPostData = {
          author: userUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: post.content
              },
              shareMediaCategory: "NONE"
            }
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": post.visibility || "PUBLIC"
          }
        };
        
        // Add hashtags to content if present
        if (post.hashtags && post.hashtags.length > 0) {
          const hashtagString = post.hashtags.map(tag => `#${tag}`).join(' ');
          linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text += 
            `\n\n${hashtagString}`;
        }
        
        // If this is a carousel post, add slide content to the text
        if (post.mediaType === 'carousel' && post.slides && post.slides.length > 0) {
          const slideContents = post.slides.map((slide, index) => 
            `Slide ${index + 1}: ${slide.content}`
          ).join('\n\n');
          
          linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text += 
            `\n\n${slideContents}`;
        }
        
        // If this is a document post, add document info to the text
        if (post.mediaType === 'document' && post.documentInfo) {
          const documentInfo = `Document: ${post.documentInfo.documentName}`;
          linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text += 
            `\n\n${documentInfo}`;
        }
        
        // Send the post request to LinkedIn
        const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/v2';
        
        const response = await axios.post(`${LINKEDIN_API_BASE_URL}/ugcPosts`, linkedinPostData, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });
        
        // Extract post ID from response headers
        const postId = response.headers['x-restli-id'];
        
        // Update post as published
        post.status = 'published';
        post.publishedTime = new Date();
        post.platformPostId = postId || null;
        post.platformResponse = {
          id: postId,
          success: true
        };
        
        await post.save();
        console.log(`Successfully published scheduled post ${post._id}`);
      } catch (error) {
        console.error(`Error publishing scheduled post ${post._id}:`, error);
        
        // Mark post as failed
        post.status = 'failed';
        post.error = error.message || 'Failed to publish post';
        await post.save();
      }
    }
  } catch (error) {
    console.error('Error processing scheduled posts:', error);
  }
};

module.exports = {
  initScheduler,
  processScheduledPosts
}; 