const cron = require('node-cron');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const { linkedinController } = require('../controllers/linkedinController');
const axios = require('axios');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Tracking variable to avoid duplicate scheduler instances
let schedulerInitialized = false;

/**
 * Initialize the scheduler
 * This will set up a job that runs every minute to check for posts that need to be published
 */
const initScheduler = async () => {
  // Avoid initializing multiple times
  if (schedulerInitialized) {
    console.log('Scheduler already initialized, skipping...');
    return;
  }
  
  console.log('Initializing post scheduler service...');
  
  // Function to ensure database connection
  const ensureConnection = async () => {
    if (mongoose.connection.readyState !== 1) {
      console.log('Database connection lost, attempting to reconnect...');
      try {
        await mongoose.connect(process.env.MONGO_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 45000,
          keepAlive: true
        });
        console.log('Database reconnected for scheduler');
      } catch (error) {
        console.error('Failed to reconnect to database:', error);
        return false;
      }
    }
    return true;
  };

  // Initialize database connection
  console.log('Connecting to database for scheduler...');
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        keepAlive: true
      });
    }
    console.log('Database connected for scheduler');
  } catch (error) {
    console.error('Initial database connection failed:', error);
    // Retry initial connection after 5 seconds
    setTimeout(initScheduler, 5000);
    return;
  }

  // Schedule post publishing
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Ensure database connection before operations
      const isConnected = await ensureConnection();
      if (!isConnected) {
        console.log('Skipping scheduled task due to database connection issues');
        return;
      }

      // Your existing scheduler logic here
      const scheduledPosts = await Post.find({
        scheduledTime: { $lte: new Date() },
        status: 'scheduled'
      });

      // Process scheduled posts
      for (const post of scheduledPosts) {
        try {
          // Your post publishing logic here
          post.status = 'published';
          post.publishedAt = new Date();
          await post.save();
        } catch (postError) {
          console.error(`Error publishing post ${post._id}:`, postError);
        }
      }
    } catch (error) {
      console.error('Error in scheduler task:', error);
    }
  });

  schedulerInitialized = true;
  console.log(`Post scheduler initialized successfully at ${new Date().toISOString()}`);
  console.log('Scheduler service initialized successfully');
};

/**
 * Process all scheduled posts that are due for publishing
 * @returns {Object} Results of the processing operation
 */
const processScheduledPosts = async () => {
  try {
    // Ensure we have a database connection
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting now...');
      await connectDB();
      console.log('Database connected successfully');
    }
    
    const now = new Date();
    console.log(`Checking for posts scheduled for publishing before: ${now.toISOString()}`);
    
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      details: []
    };
    
    // Find all scheduled posts with a scheduledTime in the past
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledTime: { $lte: now }
    }).populate('user', 'linkedinAccessToken linkedinId linkedinTokenExpiry');
    
    results.total = scheduledPosts.length;
    
    if (scheduledPosts.length === 0) {
      console.log('No scheduled posts found for publishing');
      return results;
    }
    
    console.log(`Found ${scheduledPosts.length} posts to publish`);
    
    // Process each post
    for (const post of scheduledPosts) {
      const postResult = {
        id: post._id.toString(),
        title: post.title || 'Untitled Post',
        scheduledTime: post.scheduledTime
      };
      
      try {
        if (!post.user || !post.user.linkedinAccessToken) {
          console.error(`Cannot publish post ${post._id}: User has no LinkedIn access token`);
          post.status = 'failed';
          post.error = 'User has no LinkedIn access token';
          await post.save();
          
          postResult.success = false;
          postResult.error = 'User has no LinkedIn access token';
          results.details.push(postResult);
          results.failed++;
          continue;
        }
        
        if (!post.user.linkedinId) {
          console.error(`Cannot publish post ${post._id}: User has no LinkedIn ID`);
          post.status = 'failed';
          post.error = 'LinkedIn user ID not found';
          await post.save();
          
          postResult.success = false;
          postResult.error = 'LinkedIn user ID not found';
          results.details.push(postResult);
          results.failed++;
          continue;
        }
        
        // Check if token has expired
        if (post.user.linkedinTokenExpiry && post.user.linkedinTokenExpiry < now) {
          console.error(`LinkedIn token expired for post ${post._id}`);
          post.status = 'failed';
          post.error = 'LinkedIn access token has expired';
          await post.save();
          
          postResult.success = false;
          postResult.error = 'LinkedIn access token has expired';
          results.details.push(postResult);
          results.failed++;
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
        
        // Handle image if post has an image
        if (post.postImage && post.postImage.secure_url) {
          try {
            console.log(`Post ${post._id} has an image, adding to LinkedIn post`);
            
            // Import necessary functions
            const { uploadImageToLinkedIn } = require('../controllers/linkedinController');
            
            // Upload the image to LinkedIn (if needed)
            const imageUploadResult = await uploadImageToLinkedIn(
              accessToken,
              userUrn,
              post.postImage.secure_url,
              true // Flag indicating this is a Cloudinary URL
            );
            
            if (imageUploadResult && imageUploadResult.success) {
              // Add the image to the post content
              linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
              linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].media = [
                {
                  status: "READY",
                  description: {
                    text: post.title || "Shared image"
                  },
                  media: imageUploadResult.assetUrn,
                  title: {
                    text: post.title || "Image"
                  }
                }
              ];
              
              console.log(`Successfully added image to post ${post._id}`);
              postResult.hasImage = true;
            } else {
              console.error(`Failed to upload image to LinkedIn for post ${post._id}:`, 
                imageUploadResult ? imageUploadResult.error : 'Unknown error');
              postResult.imageError = imageUploadResult ? imageUploadResult.error : 'Unknown image upload error';
            }
          } catch (imageError) {
            console.error(`Error processing image for LinkedIn post ${post._id}:`, imageError);
            postResult.imageError = imageError.message;
            // Continue with text-only post if image processing fails
          }
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
        
        console.log(`Publishing post ${post._id} to LinkedIn with data:`, JSON.stringify(linkedinPostData, null, 2));
        
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
        
        postResult.success = true;
        postResult.linkedinPostId = postId;
        postResult.publishedAt = post.publishedTime;
        results.details.push(postResult);
        results.success++;
      } catch (error) {
        console.error(`Error publishing scheduled post ${post._id}:`, error);
        
        // Mark post as failed
        post.status = 'failed';
        post.error = error.message || 'Failed to publish post';
        await post.save();
        
        postResult.success = false;
        postResult.error = error.message || 'Failed to publish post';
        results.details.push(postResult);
        results.failed++;
      }
    }
    
    console.log(`Completed scheduled post processing. Results: ${JSON.stringify(results, null, 2)}`);
    return results;
  } catch (error) {
    console.error('Error processing scheduled posts:', error);
    throw error;
  }
};

// Export functions for use in the server and for testing
module.exports = {
  initScheduler,
  processScheduledPosts
}; 