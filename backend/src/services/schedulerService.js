const cron = require('node-cron');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const { linkedinController } = require('../controllers/linkedinController');

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
    }).populate('user', 'linkedinAccessToken');
    
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
        
        let platformResponse;
        const accessToken = post.user.linkedinAccessToken;
        
        // Handle different post types
        if (post.mediaType === 'none') {
          // Text post
          const content = post.content + 
            (post.hashtags && post.hashtags.length > 0 
              ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
              : '');
              
          platformResponse = await linkedinController.createLinkedInPost(
            accessToken,
            content,
            post.visibility
          );
        } 
        else if (post.mediaType === 'image' && post.postImage) {
          // Image post
          platformResponse = await linkedinController.createLinkedInImagePost(
            accessToken,
            post.content,
            post.postImage.secure_url,
            post.postImage.original_filename || 'image',
            post.visibility
          );
        }
        else if (post.mediaType === 'carousel' && post.slides && post.slides.length > 0) {
          // Carousel post
          const slidesWithImages = post.slides.filter(
            slide => slide.cloudinaryImage?.secure_url || slide.imageUrl
          );
          
          if (slidesWithImages.length === 0) {
            throw new Error('Carousel post requires at least one slide with an image');
          }
          
          // First slide with image
          const firstSlide = slidesWithImages[0];
          const imageUrl = firstSlide.cloudinaryImage?.secure_url || firstSlide.imageUrl;
          
          // Add all slide content to the post text
          const slideContents = post.slides.map((slide, index) => 
            `Slide ${index + 1}: ${slide.content}`
          ).join('\n\n');
          
          // Create content with hashtags
          const fullContent = post.content + 
            '\n\n' + slideContents +
            (post.hashtags && post.hashtags.length > 0 
              ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
              : '');
          
          platformResponse = await linkedinController.createLinkedInImagePost(
            accessToken,
            fullContent,
            imageUrl,
            firstSlide.cloudinaryImage?.original_filename || 'Carousel Image',
            post.visibility
          );
        }
        else if (post.mediaType === 'document' && post.documentInfo) {
          // Document post
          const documentInfo = `Document: ${post.documentInfo.documentName}`;
          const fullContent = post.content + 
            '\n\n' + documentInfo +
            (post.hashtags && post.hashtags.length > 0 
              ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
              : '');
              
          platformResponse = await linkedinController.createLinkedInPost(
            accessToken,
            fullContent,
            post.visibility
          );
        }
        else if (post.mediaType === 'article' && post.articleUrl) {
          // Article post
          platformResponse = await linkedinController.createLinkedInArticlePost(
            accessToken,
            post.content,
            post.articleUrl,
            post.articleTitle || '',
            post.articleDescription || '',
            post.visibility
          );
        }
        else if (post.mediaType === 'poll' && post.isPollActive && post.pollOptions.length >= 2) {
          // Poll post
          const filteredOptions = post.pollOptions.filter(opt => opt.trim());
          platformResponse = await linkedinController.createLinkedInPollPost(
            accessToken,
            post.content,
            filteredOptions,
            post.pollDuration
          );
        }
        else {
          // Fallback to text post
          const content = post.content + 
            (post.hashtags && post.hashtags.length > 0 
              ? '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ') 
              : '');
              
          platformResponse = await linkedinController.createLinkedInPost(
            accessToken,
            content,
            post.visibility
          );
        }
        
        // Update post as published
        post.status = 'published';
        post.publishedTime = new Date();
        post.platformPostId = platformResponse.id || null;
        post.platformResponse = platformResponse;
        
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