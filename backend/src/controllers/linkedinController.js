const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { ApifyClient } = require('apify-client');

// LinkedIn API base URLs
const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/v2';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_PROFILE_URL = 'https://api.linkedin.com/v2/me';
const LINKEDIN_CONNECTIONS_URL = 'https://api.linkedin.com/v2/connections';

/**
 * Get LinkedIn basic profile data without API calls
 * @route GET /api/linkedin/basic-profile
 * @access Private
 */
const getLinkedInBasicProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Generate username from user's name if not available
    const username = user.firstName.toLowerCase() + (user.lastName ? user.lastName.toLowerCase() : '');
    
    // Create a basic profile object using stored user data
    const linkedinProfile = {
      id: user.linkedinId,
      username: username,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
      bio: `LinkedIn professional connected with Scripe.`,
      location: "Not available", // We don't have this stored
      url: `https://linkedin.com/in/${username}`,
      joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Recently joined",
      connections: 0, // Not available without API
      followers: 0, // Not available without API
      verified: true // This profile is verified since it's from our database
    };
    
    res.status(200).json({
      success: true,
      data: linkedinProfile,
      usingRealData: true
    });
  } catch (error) {
    console.error('LinkedIn Basic Profile Error:', error);
    res.status(500);
    throw new Error(error.message || 'Error fetching LinkedIn basic profile');
  }
});

/**
 * Get LinkedIn user profile data
 * @route GET /api/linkedin/profile
 * @access Private
 */
const getLinkedInProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Check if we have a valid access token
    if (!user.linkedinAccessToken) {
      console.error('No LinkedIn access token found for user:', user._id);
      throw new Error('LinkedIn access token not found. Please reconnect your LinkedIn account.');
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      console.error('LinkedIn token expired:', user.linkedinTokenExpiry);
      throw new Error('LinkedIn access token has expired. Please reconnect your LinkedIn account.');
    }
    
    console.log(`Attempting to fetch real LinkedIn profile data for user ${user._id}`);
    console.log(`User LinkedIn ID: ${user.linkedinId}`);
    console.log(`Token expiry: ${user.linkedinTokenExpiry}`);
    
    try {
      // Try to fetch real data from LinkedIn API
      console.log('Calling LinkedIn userInfo endpoint...');
      const userInfoResponse = await axios.get(LINKEDIN_USERINFO_URL, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(error => {
        console.error('LinkedIn userInfo API error:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data));
        }
        throw error;
      });
      
      console.log('LinkedIn API userInfo response successful');
      
      // Try to get profile details with additional fields
      console.log('Calling LinkedIn profile endpoint...');
      const profileResponse = await axios.get(`${LINKEDIN_PROFILE_URL}?projection=(id,firstName,lastName,profilePicture,headline,vanityName)`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(error => {
        console.error('LinkedIn profile API error:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data));
        }
        throw error;
      });
      
      console.log('LinkedIn API profile response successful');
      
      // Build profile from API responses
      const username = profileResponse.data.vanityName || 
                       userInfoResponse.data.given_name?.toLowerCase() + userInfoResponse.data.family_name?.toLowerCase();
      
      const linkedinProfile = {
        id: user.linkedinId,
        username: username,
        name: `${userInfoResponse.data.given_name || user.firstName} ${userInfoResponse.data.family_name || user.lastName || ''}`.trim(),
        profileImage: userInfoResponse.data.picture || user.profilePicture || 'https://via.placeholder.com/150',
        bio: profileResponse.data.headline || `LinkedIn professional connected with Scripe.`,
        location: userInfoResponse.data.address || "Global",
        url: `https://linkedin.com/in/${username}`,
        joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Recently joined",
        connections: 500, // LinkedIn doesn't easily provide this count via API
        followers: 1000, // LinkedIn doesn't easily provide this count via API
        verified: true
      };
      
      console.log('Built LinkedIn profile successfully');
      
      res.status(200).json({
        success: true,
        data: linkedinProfile,
        usingRealData: true
      });
    } catch (apiError) {
      console.error('LinkedIn API Error:', apiError.message);
      
      let errorDetails = apiError.message;
      let errorType = 'api_error';
      
      if (apiError.response) {
        console.error('Error status:', apiError.response.status);
        console.error('Error details:', apiError.response?.data || 'No response data');
        
        // Determine specific error type
        if (apiError.response.status === 401) {
          errorType = 'token_expired';
          errorDetails = 'Your LinkedIn access token has expired. Please reconnect your account.';
          
          // Update user record to clear LinkedIn tokens
          if (user) {
            console.log(`Token expired or revoked for user ${user._id}. Clearing all LinkedIn tokens.`);
            user.linkedinAccessToken = null;
            user.linkedinRefreshToken = null;
            user.linkedinTokenExpiry = new Date(Date.now() - 1000); // Set to past time
            await user.save();
            
            // Check for specific LinkedIn revocation error
            const errorData = apiError.response.data;
            if (errorData && (
                (errorData.serviceErrorCode === 65601) || 
                (errorData.code === 'REVOKED_ACCESS_TOKEN')
              )) {
              errorType = 'token_revoked';
              errorDetails = 'Your LinkedIn access token has been revoked. Please reconnect your account.';
            }
          }
        } else if (apiError.response.status === 403) {
          errorType = 'permission_denied';
          errorDetails = 'LinkedIn API access denied. You may need additional permissions.';
        } else if (apiError.response.status === 404) {
          errorType = 'not_found';
          errorDetails = 'LinkedIn resource not found. The API endpoint may have changed.';
        } else if (apiError.response.status >= 500) {
          errorType = 'linkedin_server_error';
          errorDetails = 'LinkedIn servers are experiencing issues. Please try again later.';
        }
      }
      
      console.error(`LinkedIn API access failed (${errorType}). Falling back to sample data`);
      
      // If API call fails, fall back to sample data
    const username = user.firstName.toLowerCase() + (user.lastName ? user.lastName.toLowerCase() : '');
    
    const linkedinProfile = {
      id: user.linkedinId,
      username: username,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
        bio: `LinkedIn professional connected with Scripe. Generating amazing content with AI.`,
      location: "Global",
      url: `https://linkedin.com/in/${username}`,
      joinedDate: "January 2022",
      connections: 512,
      followers: 1024,
      verified: false
    };
    
    res.status(200).json({
      success: true,
        data: linkedinProfile,
        usingRealData: false,
        error: 'Failed to fetch real data from LinkedIn API. Using sample data instead.',
        errorType: errorType,
        errorDetails: errorDetails
      });
    }
  } catch (error) {
    console.error('LinkedIn Profile Error:', error);
    res.status(500);
    throw new Error(error.message || 'Error fetching LinkedIn profile');
  }
});

/**
 * Upload an image to LinkedIn and get the asset URN
 * @param {string} accessToken LinkedIn access token
 * @param {string} userUrn User's LinkedIn URN
 * @param {string} imagePath Path to the image file or Cloudinary URL
 * @param {boolean} isCloudinaryUrl Whether the imagePath is a Cloudinary URL
 * @returns {Promise<{success: boolean, assetUrn: string, error: string}>}
 */
const uploadImageToLinkedIn = async (accessToken, userUrn, imagePath, isCloudinaryUrl = false) => {
  try {
    console.log('Starting LinkedIn image upload process for:', imagePath);
    
    // Step 1: Register upload with LinkedIn
    console.log('Registering image upload with LinkedIn...');
    const registerResponse = await axios.post(
      `${LINKEDIN_API_BASE_URL}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: userUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent"
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    // Step 2: Get upload URL and asset URN
    const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    const assetUrn = registerResponse.data.value.asset;

    console.log('Upload URL:', uploadUrl);
    console.log('Asset URN:', assetUrn);

    // Step 3: Upload the image binary to LinkedIn
    console.log('Uploading image to LinkedIn...', imagePath);
    
    let imageBuffer;
    
    // Handle Cloudinary URL
    if (isCloudinaryUrl) {
      console.log('Processing Cloudinary URL');
      
      // Validate URL
      if (!imagePath || typeof imagePath !== 'string') {
        throw new Error('Invalid image URL provided');
      }
      
      // Ensure the URL is properly formatted
      const imageUrl = imagePath.trim();
      if (!imageUrl.startsWith('http')) {
        throw new Error('Image URL must start with http:// or https://');
      }
      
      try {
        // Download the image directly from Cloudinary
        console.log('Downloading image from Cloudinary URL:', imageUrl);
        
        const response = await axios({
          method: 'get',
          url: imageUrl,
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
          maxContentLength: 10 * 1024 * 1024, // 10MB max size
          headers: {
            'Accept': 'image/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        console.log('Image downloaded successfully:');
        console.log('Content-Type:', response.headers['content-type']);
        console.log('Content-Length:', response.headers['content-length']);
        console.log('Image data size:', response.data.length, 'bytes');
        
        // Use the downloaded image data directly
        imageBuffer = Buffer.from(response.data);
      } catch (downloadError) {
        console.error('Error downloading image from Cloudinary:', downloadError);
        if (downloadError.response) {
          console.error('Response status:', downloadError.response.status);
          console.error('Response headers:', downloadError.response.headers);
        }
        throw new Error(`Failed to download image from Cloudinary: ${downloadError.message}`);
      }
    } else {
      // Handle local file path
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const imageFileName = path.basename(imagePath);
    const absoluteImagePath = path.join(uploadsDir, imageFileName);
    
    console.log('Looking for image at:', absoluteImagePath);
    
    // Check if file exists
    if (!fs.existsSync(absoluteImagePath)) {
      console.error(`Image file not found at path: ${absoluteImagePath}`);
      console.log('Checking if file exists in uploads directory...');
      
      // List files in uploads directory to debug
      const files = fs.readdirSync(uploadsDir);
      console.log('Files in uploads directory:', files);
      
      throw new Error(`Image file not found at path: ${absoluteImagePath}`);
    }
    
    console.log('Image file found, reading content...');
      imageBuffer = fs.readFileSync(absoluteImagePath);
    }
    
    console.log('Image size:', imageBuffer.length, 'bytes');
    
    console.log('Uploading image to LinkedIn...');
    await axios.put(
      uploadUrl,
      imageBuffer,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        }
      }
    );

    console.log('Image uploaded successfully');
    return {
      success: true,
      assetUrn: assetUrn
    };
  } catch (error) {
    console.error('Error uploading image to LinkedIn:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create a LinkedIn post
 * @route POST /api/linkedin/post
 * @access Private
 */
const createLinkedInPost = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Check if we have a valid access token
    if (!user.linkedinAccessToken) {
      console.error('No LinkedIn access token found for user:', user._id);
      throw new Error('LinkedIn access token not found. Please reconnect your LinkedIn account.');
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      console.error('LinkedIn token expired:', user.linkedinTokenExpiry);
      throw new Error('LinkedIn access token has expired. Please reconnect your LinkedIn account.');
    }
    
    const { 
      postContent, 
      articleUrl, 
      articleTitle, 
      articleDescription,
      imagePath,
      imageTitle,
      imageDescription,
      isCloudinaryImage
    } = req.body;
    
    if (!postContent) {
      return res.status(400).json({ error: 'Post content is required' });
    }
    
    const userUrn = `urn:li:person:${user.linkedinId}`;
    console.log('User URN for posting:', userUrn);
    
    // Prepare post data
    let linkedinPostData = {
      author: userUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: postContent
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    };
    
    // Handle different media types
    if (imagePath) {
      // If we have a Cloudinary image URL, we need to download it first
      let filename;
      let imageUploadResult;
      
      if (isCloudinaryImage) {
        try {
          console.log('Detected Cloudinary image URL, attempting to download:', imagePath);
          
          // Validate URL
          if (!imagePath || typeof imagePath !== 'string') {
            throw new Error('Invalid image URL provided');
          }
          
          // Ensure the URL is properly formatted
          const imageUrl = imagePath.trim();
          if (!imageUrl.startsWith('http')) {
            throw new Error('Image URL must start with http:// or https://');
          }
          
          // Generate a unique filename based on the current timestamp
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 15);
          filename = `cloudinary_${timestamp}_${randomStr}.jpg`;
          
          // Create uploads directory if it doesn't exist
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          console.log('Downloading image from URL:', imageUrl);
          
          // Use the uploadImageToLinkedIn function directly with the URL
          // This will handle the download and upload in one step
          imageUploadResult = await uploadImageToLinkedIn(
            user.linkedinAccessToken, 
            userUrn, 
            imageUrl, 
            true // Mark as Cloudinary URL
          );
          
          if (!imageUploadResult || !imageUploadResult.success) {
            const errorMsg = imageUploadResult ? imageUploadResult.error : 'Failed to upload image';
            throw new Error(`LinkedIn image upload failed: ${errorMsg}`);
          }
        } catch (downloadError) {
          console.error('Error downloading Cloudinary image:', downloadError);
          return res.status(422).json({ 
            success: false, 
            error: 'Failed to download image from Cloudinary',
            details: downloadError.message
          });
        }
      } else {
        // Regular local image upload
        imageUploadResult = await uploadImageToLinkedIn(
          user.linkedinAccessToken, 
          userUrn, 
          imagePath,
          false // Mark as local file path
        );
      }
      
      if (!imageUploadResult || !imageUploadResult.success) {
        const errorMsg = imageUploadResult ? JSON.stringify(imageUploadResult.error) : 'No upload result returned';
        throw new Error(`Failed to upload image to LinkedIn: ${errorMsg}`);
      }
      
      // Add the image to the post
      linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
      linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].media = [
        {
          status: "READY",
          description: {
            text: imageDescription || "Shared image"
          },
          media: imageUploadResult.assetUrn,
          title: {
            text: imageTitle || "Image"
          }
        }
      ];
    }
    // Add article details if provided
    else if (articleUrl) {
      linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "ARTICLE";
      linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].media = [
        {
          status: "READY",
          originalUrl: articleUrl,
          title: {
            text: articleTitle || articleUrl
          }
        }
      ];
      
      if (articleDescription) {
        linkedinPostData.specificContent["com.linkedin.ugc.ShareContent"].media[0].description = {
          text: articleDescription
        };
      }
    }
    
    // Send post request to LinkedIn
    console.log('Sending post to LinkedIn:', JSON.stringify(linkedinPostData));
    const response = await axios.post(`${LINKEDIN_API_BASE_URL}/ugcPosts`, linkedinPostData, {
      headers: {
        'Authorization': `Bearer ${user.linkedinAccessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
    
    // Get the post ID from the response headers
    const postId = response.headers['x-restli-id'];
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      postId: postId || 'unknown'
    });
  } catch (error) {
    console.error('Error creating LinkedIn post:', error.response?.data || error.message);
    
    // Check for token expiration or revocation
    if (error.response) {
      console.error('LinkedIn API error details:', {
        status: error.response.status,
        data: error.response.data
      });
      
      // Handle token expiration or revocation errors
      if (error.response.status === 401) {
        try {
          // Attempt to get the user ID from the request
          const user = await User.findById(req.user._id);
          
          if (user) {
            console.log(`Token revoked or expired for user ${user._id}. Clearing LinkedIn tokens from database.`);
            
            // Clear the LinkedIn tokens from database
            user.linkedinAccessToken = null;
            user.linkedinRefreshToken = null;
            user.linkedinTokenExpiry = new Date(Date.now() - 1000); // Set to past time
            await user.save();
          }
          
          // Check for specific LinkedIn revocation
          const errorData = error.response.data;
          if (errorData && (
              (errorData.serviceErrorCode === 65601) || 
              (errorData.code === 'REVOKED_ACCESS_TOKEN')
            )) {
            return res.status(401).json({
              success: false,
              error: 'LinkedIn token has been revoked',
              details: {
                code: 'REVOKED_ACCESS_TOKEN',
                message: 'The token used in the request has been revoked by the user. Please reconnect your LinkedIn account.'
              }
            });
          }
        } catch (dbError) {
          console.error('Error updating user LinkedIn token status:', dbError);
        }
      }
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create LinkedIn post',
      details: error.response?.data || error.message
    });
  }
});

/**
 * Get user's recent posts
 * @route GET /api/linkedin/posts
 * @access Private
 */
const getUserPosts = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Check if we have a valid access token
    if (!user.linkedinAccessToken) {
      console.error('No LinkedIn access token found for user:', user._id);
      throw new Error('LinkedIn access token not found. Please reconnect your LinkedIn account.');
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      console.error('LinkedIn token expired:', user.linkedinTokenExpiry);
      throw new Error('LinkedIn access token has expired. Please reconnect your LinkedIn account.');
    }
    
    console.log(`Attempting to fetch real LinkedIn posts for user ${user._id}`);
    console.log(`User LinkedIn ID: ${user.linkedinId}`);
    console.log(`Token expiry: ${user.linkedinTokenExpiry}`);
    
    // Prepare API call parameters
    const urn = `urn:li:person:${user.linkedinId}`;
    
    try {
      // Make API call to get user's posts
      const response = await axios.get(`${LINKEDIN_API_BASE_URL}/ugcPosts?q=authors&authors=List(${urn})`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log('Successfully retrieved posts from LinkedIn API');
      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (apiError) {
      console.error('LinkedIn posts API error:', apiError);
      
      // Return sample data as fallback
    res.status(200).json({
      success: true,
        data: {
          elements: [],
          paging: { count: 0, start: 0, total: 0 }
        },
        usingRealData: false,
        error: 'Failed to fetch posts from LinkedIn API',
        errorDetails: apiError.response?.data || apiError.message
      });
    }
  } catch (error) {
    console.error('LinkedIn Posts Error:', error);
    res.status(500);
    throw new Error(error.message || 'Error fetching LinkedIn posts');
  }
});

/**
 * Initialize image upload to LinkedIn
 * @route POST /api/linkedin/images/initializeUpload
 * @access Private
 */
const initializeImageUpload = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.linkedinId) {
      res.status(400);
      throw new Error('LinkedIn account not connected');
    }
    
    // Check if we have a valid access token
    if (!user.linkedinAccessToken) {
      console.error('No LinkedIn access token found for user:', user._id);
      throw new Error('LinkedIn access token not found. Please reconnect your LinkedIn account.');
    }
    
    const userUrn = `urn:li:person:${user.linkedinId}`;
    
    // Step 1: Register upload with LinkedIn
    const registerResponse = await axios.post(
      `${LINKEDIN_API_BASE_URL}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: userUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent"
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    res.status(200).json({
      success: true,
      data: registerResponse.data
    });
  } catch (error) {
    console.error('Error initializing LinkedIn image upload:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Error initializing LinkedIn image upload',
      details: error.response?.data || error.message
    });
  }
});

/**
 * Delete a post from LinkedIn
 * @route DELETE /api/linkedin/delete-linkedin-post
 * @access Private
 */
const deleteLinkedInPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.body;
    
    if (!postId) {
      return res.status(400).json({
        success: false,
        message: 'Post ID is required'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user.linkedinAccessToken) {
      return res.status(401).json({
        success: false,
        message: 'LinkedIn access token not found. Please reconnect your account.'
      });
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      return res.status(401).json({
        success: false,
        message: 'LinkedIn access token has expired. Please reconnect your account.'
      });
    }
    
    // Ensure the post ID is in the correct format
    const formattedPostId = postId.includes('urn:li:ugcPost:') ? 
      postId : 
      `urn:li:ugcPost:${postId}`;
    
    console.log(`Attempting to delete LinkedIn post: ${formattedPostId}`);
    
    try {
      // Make direct call to LinkedIn API
      await axios.delete(`${LINKEDIN_API_BASE_URL}/ugcPosts/${formattedPostId}`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log(`Successfully deleted LinkedIn post: ${formattedPostId}`);
      
      return res.status(200).json({
        success: true,
        message: 'LinkedIn post deleted successfully'
      });
    } catch (linkedinError) {
      console.error('LinkedIn API error deleting post:', linkedinError.response?.data || linkedinError.message);
      
      // Special handling for 404 errors - consider it a success since the post doesn't exist on LinkedIn
      if (linkedinError.response?.status === 404) {
        return res.status(200).json({
          success: true,
          message: 'Post not found on LinkedIn (already deleted or never existed)'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to delete post from LinkedIn',
        error: linkedinError.response?.data?.message || linkedinError.message
      });
    }
  } catch (error) {
    console.error('Error in deleteLinkedInPost:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting LinkedIn post',
      error: error.message
    });
  }
});

/**
 * Scrape LinkedIn profile and posts using Apify
 * @route POST /api/linkedin/scrape-profile
 * @access Public
 */
const scrapeLinkedInProfile = asyncHandler(async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'LinkedIn username is required' 
      });
    }

    // Initialize the ApifyClient with API token
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN || 'apify_api_VXCyhcCwpMUgVD2oQRqqLPewsQ14IH3dhZCb',
    });

    // Format the LinkedIn profile URL
    const profileUrl = `https://www.linkedin.com/in/${username}/`;
    
    console.log(`Scraping LinkedIn profile: ${profileUrl}`);
    
    // Prepare Actor input
    const input = {
      "targetUrls": [profileUrl],
      "maxPosts": 30,
      "maxReactions": 10,
      "maxComments": 5,
      "maxDocumentPages": 20
    };

    // Run the LinkedIn scraper
    const run = await client.actor("harvestapi~linkedin-profile-posts").call(input);

    // Fetch and process Actor results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    console.log(`Scraping completed. Found ${items?.length || 0} items`);
    
    // Process the results
    let profileData = {};
    let posts = [];

    if (items && items.length > 0) {
      // Extract posts from the results
      posts = items.map((item, index) => {
        // Extract media from multiple sources
        let mediaArray = [];
        let documents = [];
        let videos = [];
        
        // Add post images
        if (item.postImages && Array.isArray(item.postImages)) {
          mediaArray = [...mediaArray, ...item.postImages.map(img => ({
            type: 'image',
            url: img.url,
            width: img.width,
            height: img.height
          }))];
        }
        
        // Add repost images if this is a repost
        if (item.repost && item.repost.postImages && Array.isArray(item.repost.postImages)) {
          mediaArray = [...mediaArray, ...item.repost.postImages.map(img => ({
            type: 'image',
            url: img.url,
            width: img.width,
            height: img.height
          }))];
        }
        
        // Handle videos
        if (item.postVideos && Array.isArray(item.postVideos)) {
          videos = item.postVideos.map(video => ({
            type: 'video',
            url: video.url || video.playbackUrl,
            thumbnail: video.thumbnail,
            duration: video.duration
          }));
        }
        
        // Handle documents/PDFs
        if (item.document) {
          documents.push({
            type: 'document',
            title: item.document.title,
            url: item.document.transcribedDocumentUrl || item.document.url,
            coverPages: item.document.coverPages || [],
            totalPageCount: item.document.totalPageCount || null,
            fileType: item.document.title?.toLowerCase().includes('.pdf') ? 'pdf' : 'document'
          });
        }

        // Handle reposts
        let combinedContent = item.content || '';
        let isRepost = false;
        let originalPost = null;

        if (item.repost) {
          isRepost = true;
          originalPost = {
            content: item.repost.content,
            author: item.repost.author?.name,
            authorInfo: item.repost.author?.info,
            authorAvatar: item.repost.author?.avatar?.url,
            date: item.repost.postedAt?.postedAgoText
          };
          if (item.repost.content && item.repost.content.length > combinedContent.length) {
            combinedContent = item.repost.content;
          }
        }

        return {
          id: item.linkedinUrl || `post-${Date.now()}-${Math.random()}-${index}`,
          content: combinedContent,
          date: item.postedAt?.date || item.postedAt?.timestamp,
          dateRelative: item.postedAt?.postedAgoText,
          likes: item.engagement?.likes,
          comments: item.engagement?.comments,
          shares: item.engagement?.shares,
          reactions: item.engagement?.reactions,
          url: item.linkedinUrl,
          author: item.author?.name,
          authorHeadline: item.author?.info,
          authorAvatar: item.author?.avatar?.url,
          authorProfile: item.author?.linkedinUrl,
          media: mediaArray,
          videos: videos,
          documents: documents,
          type: item.type || 'post',
          isRepost: isRepost,
          originalPost: originalPost,
          detailedReactions: item.reactions?.slice(0, 5),
          detailedComments: item.comments?.slice(0, 3)
        };
      });

      // Extract basic profile info from the first post
      if (items[0] && items[0].author) {
        const author = items[0].author;
        profileData = {
          name: author.name,
          headline: author.info,
          profileUrl: author.linkedinUrl,
          avatar: author.avatar?.url,
          publicIdentifier: author.publicIdentifier,
          username: username
        };
      }
    }

    res.status(200).json({ 
      success: true, 
      profileData,
      posts,
      totalPosts: posts.length,
      message: posts.length > 0 ? 
        `Found ${posts.length} recent posts with media and engagement data` : 
        'No posts found for this user.'
    });
  } catch (error) {
    console.error('Error scraping LinkedIn profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to scrape LinkedIn profile',
      message: error.message
    });
  }
});

/**
 * Save scraped LinkedIn posts to database
 * @route POST /api/linkedin/save-scraped-posts
 * @access Public
 */
const saveScrapedLinkedInPosts = asyncHandler(async (req, res) => {
  try {
    const { posts, profileData, userId } = req.body;
    
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Posts array is required and cannot be empty' 
      });
    }

    if (!profileData) {
      return res.status(400).json({ 
        success: false,
        error: 'Profile data is required' 
      });
    }

    // For now, we'll save to a simple JSON file since we don't have a database model
    // In a real application, you'd save this to a proper database
    const fs = require('fs');
    const path = require('path');
    
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Create filename based on profile and timestamp
    const timestamp = new Date().toISOString();
    const filename = `linkedin_posts_${profileData.username}_${Date.now()}.json`;
    const filepath = path.join(dataDir, filename);
    
    // Prepare data to save
    const dataToSave = {
      profileData,
      posts: posts.map(post => ({
        ...post,
        savedAt: timestamp,
        userId: userId || 'anonymous'
      })),
      savedAt: timestamp,
      userId: userId || 'anonymous',
      totalPosts: posts.length
    };
    
    // Save to file
    fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
    
    console.log(`Saved ${posts.length} LinkedIn posts to ${filepath}`);
    
    res.status(200).json({ 
      success: true, 
      message: `Successfully saved ${posts.length} LinkedIn posts`,
      count: posts.length,
      savedAt: timestamp,
      filename: filename
    });
  } catch (error) {
    console.error('Error saving scraped LinkedIn posts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save LinkedIn posts',
      message: error.message
    });
  }
});

module.exports = {
  getLinkedInProfile,
  getUserPosts,
  createLinkedInPost,
  initializeImageUpload,
  getLinkedInBasicProfile,
  uploadImageToLinkedIn,
  deleteLinkedInPost,
  scrapeLinkedInProfile,
  saveScrapedLinkedInPosts
}; 