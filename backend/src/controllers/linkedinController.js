const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { ApifyClient } = require('apify-client');
const SavedPost = require('../models/savedPost');

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
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.linkedinConnected || !user.linkedinId) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'LinkedIn account not connected'
      });
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
      location: "Not available",
      url: `https://linkedin.com/in/${username}`,
      joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Recently joined",
      connections: 0,
      followers: 0,
      verified: true
    };
    
    return res.status(200).json({
      success: true,
      data: linkedinProfile,
      usingRealData: true
    });
  } catch (error) {
    console.error('LinkedIn Basic Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching LinkedIn basic profile',
      error: error.message
    });
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
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.linkedinConnected || !user.linkedinId) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'LinkedIn account not connected'
      });
    }
    
    // Check if we have a valid access token
    if (!user.linkedinAccessToken) {
      return res.status(200).json({
        success: false,
        message: 'LinkedIn access token not found. Please reconnect your LinkedIn account.'
      });
    }
    
    // Check if token has expired
    const now = new Date();
    if (user.linkedinTokenExpiry && user.linkedinTokenExpiry < now) {
      return res.status(200).json({
        success: false,
        message: 'LinkedIn access token has expired. Please reconnect your LinkedIn account.'
      });
    }
    
    try {
      console.log('Fetching LinkedIn data with token:', user.linkedinAccessToken);
      
      // Get user info first
      const userInfoResponse = await axios.get(LINKEDIN_USERINFO_URL, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log('LinkedIn UserInfo Response:', userInfoResponse.data);
      
      // Get profile data with more fields
      const profileResponse = await axios.get(`${LINKEDIN_PROFILE_URL}`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log('LinkedIn Profile Response:', profileResponse.data);

      // Get connection count
      const connectionResponse = await axios.get(`${LINKEDIN_API_BASE_URL}/connections?q=viewer&start=0&count=0`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log('LinkedIn Connection Response:', connectionResponse.data);

      // Get posts stats using organization API
      const statsResponse = await axios.get(`${LINKEDIN_API_BASE_URL}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${user.linkedinId}`, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      console.log('LinkedIn Stats Response:', statsResponse.data);

      // Get posts count from our database
      const postsCount = await SavedPost.countDocuments({ 
        userId: user._id,
        status: 'published',
        publishedToLinkedIn: true
      });
      
      // Get the actual LinkedIn vanity name
      const linkedInVanityName = profileResponse.data.vanityName || 
                                profileResponse.data.id ||
                                userInfoResponse.data.sub;
      
      const linkedinProfile = {
        id: user.linkedinId,
        username: linkedInVanityName,
        name: profileResponse.data.localizedFirstName + ' ' + profileResponse.data.localizedLastName,
        profileImage: profileResponse.data.profilePicture?.displayImage || userInfoResponse.data.picture,
        bio: profileResponse.data.headline || '',
        location: userInfoResponse.data.address?.country || "Global",
        url: `https://linkedin.com/in/${linkedInVanityName}`,
        joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Recently joined",
        connections: connectionResponse.data._total || 0,
        followers: statsResponse.data.totalFollowerCount || 0,
        totalPosts: postsCount,
        impressions: statsResponse.data.totalShareStatistics?.impressionCount || 0,
        verified: true,
        summary: profileResponse.data.summary || ''
      };
      
      // Update user's LinkedIn username in database
      await User.findByIdAndUpdate(user._id, {
        linkedinUsername: linkedInVanityName
      });
      
      return res.status(200).json({
        success: true,
        data: linkedinProfile,
        usingRealData: true
      });
    } catch (apiError) {
      console.error('LinkedIn API Error:', apiError.response?.data || apiError.message);
      console.error('Full error:', apiError);
      
      // If API call fails, try to get basic profile with vanity name
      try {
        const basicProfileResponse = await axios.get(`${LINKEDIN_API_BASE_URL}/me`, {
          headers: {
            'Authorization': `Bearer ${user.linkedinAccessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });
        
        const vanityName = basicProfileResponse.data.vanityName || user.linkedinUsername;
    
    const linkedinProfile = {
      id: user.linkedinId,
          username: vanityName,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      profileImage: user.profilePicture || 'https://via.placeholder.com/150',
        bio: `LinkedIn professional connected with Scripe.`,
      location: "Global",
          url: `https://linkedin.com/in/${vanityName}`,
        joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "Recently joined",
        connections: 0,
        followers: 0,
          totalPosts: 0,
          impressions: 0,
          verified: false,
          summary: ''
    };
    
      return res.status(200).json({
      success: true,
        data: linkedinProfile,
        usingRealData: false,
        message: 'Using basic profile data due to API error',
        error: apiError.message
      });
      } catch (basicError) {
        console.error('Basic Profile Error:', basicError);
        return res.status(500).json({
          success: false,
          message: 'Error fetching even basic LinkedIn profile',
          error: basicError.message
        });
      }
    }
  } catch (error) {
    console.error('LinkedIn Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching LinkedIn profile',
      error: error.message
    });
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
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    // Step 2: Get upload URL and asset URN
    const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    const assetUrn = registerResponse.data.value.asset;

    // Step 3: Upload the image binary to LinkedIn
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
        error: 'LinkedIn username or profile URL is required' 
      });
    }

    // Initialize the ApifyClient with API token
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN || 'apify_api_VXCyhcCwpMUgVD2oQRqqLPewsQ14IH3dhZCb',
    });

    // Process the username/URL to get the correct profile URL
    let profileUrl = username;
    
    // If it's not already a full URL, format it
    if (!profileUrl.startsWith('http')) {
      // Check if it's a company profile
      if (username.includes('company/')) {
        profileUrl = `https://www.linkedin.com/company/${username.replace('company/', '')}/`;
      } else {
        profileUrl = `https://www.linkedin.com/in/${username}/`;
      }
    }
    
    // Ensure the URL is properly formatted
    if (!profileUrl.endsWith('/')) {
      profileUrl += '/';
    }
    
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
          username: username.replace(/^https?:\/\/[^\/]+\/(?:in|company)\//, '').replace(/\/$/, '')
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
 * @access Private
 */
const saveScrapedLinkedInPosts = asyncHandler(async (req, res) => {
  try {
    const { posts, profileData } = req.body;
    
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

    // Get the authenticated user's ID from the request
    const authenticatedUserId = req.user._id.toString();
    
    // Process and save each post
    const savedPosts = [];
    const skippedPosts = [];
    const timestamp = new Date();
    
    // Drop old indexes if they exist
    try {
      await SavedPost.collection.dropIndex('userId_1_source_1_postId_1');
    } catch (error) {
      // Index might not exist, that's fine
    }
    
    // Ensure our new index is created
    await SavedPost.collection.createIndex(
      { userId: 1, platform: 1, 'postData.id': 1 },
      { unique: true, name: 'unique_post_per_user' }
    );
    
    // First, find all existing posts for this user to avoid duplicates
    const existingPosts = await SavedPost.find({
      userId: authenticatedUserId,
      platform: 'linkedin',
      'postData.id': { $in: posts.map(p => p.id) }
    });
    
    const existingPostIds = new Set(existingPosts.map(p => p.postData.id));
    
    // Process each post
    for (const post of posts) {
      try {
        // Skip if no ID
        if (!post.id || typeof post.id !== 'string') {
          console.warn('Skipping post without valid ID');
          continue;
        }
        
        // Skip if already exists
        if (existingPostIds.has(post.id)) {
          skippedPosts.push(post.id);
          continue;
        }

        // Create new post document
        const savedPost = await SavedPost.create({
          userId: authenticatedUserId,
          platform: 'linkedin',
          postData: {
            id: post.id,
            content: post.content || '',
            date: post.date,
            dateRelative: post.dateRelative,
            likes: post.likes || 0,
            comments: post.comments || 0,
            shares: post.shares || 0,
            reactions: post.reactions || 0,
            url: post.url,
            author: post.author,
            authorHeadline: post.authorHeadline,
            authorAvatar: post.authorAvatar,
            authorProfile: post.authorProfile,
            media: post.media || [],
            videos: post.videos || [],
            documents: post.documents || [],
            type: post.type || 'post',
            isRepost: post.isRepost || false,
            originalPost: post.originalPost || null,
            savedAt: timestamp
          },
          createdAt: timestamp
        });

        if (savedPost) {
          savedPosts.push(savedPost);
        }
      } catch (error) {
        console.error(`Error saving LinkedIn post ${post.id}:`, error);
        // Don't add to skippedPosts here since we already handle duplicates above
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: `Successfully saved ${savedPosts.length} LinkedIn posts`,
      count: savedPosts.length,
      skippedCount: skippedPosts.length,
      savedAt: timestamp
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

/**
 * Get saved LinkedIn posts
 * @route GET /api/linkedin/saved-posts
 * @access Private
 */
const getSavedLinkedInPosts = asyncHandler(async (req, res) => {
  try {
    const posts = await SavedPost.find({
      userId: req.user._id,
      platform: 'linkedin'
    }).sort({ 'postData.savedAt': -1 });

    res.status(200).json({
      success: true,
      data: posts.map(post => ({
        ...post.postData,
        _id: post._id,  // Include the MongoDB document ID for deletion
        mongoId: post._id.toString()  // Also include as string for easier access
      })),
      count: posts.length
    });
  } catch (error) {
    console.error('Error fetching saved LinkedIn posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved LinkedIn posts',
      message: error.message
    });
  }
});

// Add a new function to handle LinkedIn connection for Google users
const handleGoogleUserLinkedInConnection = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      res.status(400);
      throw new Error('User not found');
    }
    
    // Check if this is a Google user
    if (user.authMethod !== 'google') {
      res.status(400);
      throw new Error('This endpoint is only for Google-authenticated users');
    }
    
    // Get LinkedIn data from the request
    const { linkedinId, linkedinAccessToken, linkedinRefreshToken, tokenExpiry } = req.body;
    
    // Update user with LinkedIn connection data
    user.linkedinId = linkedinId;
    user.linkedinAccessToken = linkedinAccessToken;
    user.linkedinRefreshToken = linkedinRefreshToken;
    user.linkedinTokenExpiry = new Date(tokenExpiry);
    user.linkedinConnected = true;
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'LinkedIn successfully connected to Google account',
      data: {
        linkedinConnected: true,
        linkedinId
      }
    });
  } catch (error) {
    console.error('Error connecting LinkedIn to Google account:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect LinkedIn account'
    });
  }
});

// Modify the existing LinkedIn callback handler to support both direct login and connection
const handleLinkedInCallback = asyncHandler(async (req, res) => {
  try {
    // Get the login type from session or query params
    const loginType = req.session.loginType || req.query.loginType || 'direct';
    
    // Get the LinkedIn authorization code
    const { code } = req.query;
    
    if (!code) {
      throw new Error('No authorization code received from LinkedIn');
    }
    
    // Exchange code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      }
    });
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Get user profile from LinkedIn
    const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const linkedinId = profileResponse.data.id;
    
    // If this is a connection request from a Google user
    if (loginType === 'google_connect') {
      // Find the Google user by their ID (stored in session)
      const googleUserId = req.session.googleUserId;
      
      if (!googleUserId) {
        throw new Error('No Google user ID found in session');
      }
      
      const user = await User.findById(googleUserId);
      
      if (!user) {
        throw new Error('Google user not found');
      }
      
      // Update user with LinkedIn connection
      user.linkedinId = linkedinId;
      user.linkedinAccessToken = access_token;
      user.linkedinRefreshToken = refresh_token;
      user.linkedinTokenExpiry = new Date(Date.now() + expires_in * 1000);
      user.linkedinConnected = true;
      
      await user.save();
      
      // Redirect to dashboard with success message
      res.redirect('/dashboard?linkedin=connected');
    } else {
      // Handle normal LinkedIn login/registration
      let user = await User.findOne({ linkedinId });
      
      if (!user) {
        // Create new user
        user = await User.create({
          linkedinId,
          authMethod: 'linkedin',
          linkedinAccessToken: access_token,
          linkedinRefreshToken: refresh_token,
          linkedinTokenExpiry: new Date(Date.now() + expires_in * 1000),
          linkedinConnected: true,
          // Add other user fields from LinkedIn profile
          firstName: profileResponse.data.localizedFirstName,
          lastName: profileResponse.data.localizedLastName,
          // ... other fields
        });
      } else {
        // Update existing user
        user.linkedinAccessToken = access_token;
        user.linkedinRefreshToken = refresh_token;
        user.linkedinTokenExpiry = new Date(Date.now() + expires_in * 1000);
        user.linkedinConnected = true;
        await user.save();
      }
      
      // Generate JWT token
      const token = generateToken(user._id);
      
      // Set cookie and redirect
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.redirect('/dashboard');
    }
  } catch (error) {
    console.error('LinkedIn callback error:', error);
    res.redirect('/login?error=linkedin_auth_failed');
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
  saveScrapedLinkedInPosts,
  handleGoogleUserLinkedInConnection,
  handleLinkedInCallback,
  getSavedLinkedInPosts
}; 