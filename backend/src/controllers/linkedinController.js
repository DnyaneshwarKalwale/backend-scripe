const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
          
          // Update user record to mark token as expired
          if (user) {
            user.linkedinTokenExpiry = new Date(Date.now() - 1000); // Set to past time
            await user.save();
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
 * @param {string} imagePath Path to the image file
 * @returns {Promise<{success: boolean, assetUrn: string, error: string}>}
 */
const uploadImageToLinkedIn = async (accessToken, userUrn, imagePath) => {
  try {
    console.log('Starting LinkedIn image upload process');
    
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
    
    // Make sure imagePath has the correct format
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const absoluteImagePath = path.join(uploadsDir, path.basename(imagePath));
    
    console.log('Absolute image path:', absoluteImagePath);
    
    if (!fs.existsSync(absoluteImagePath)) {
      throw new Error(`Image file not found at path: ${absoluteImagePath}`);
    }
    
    const imageBuffer = fs.readFileSync(absoluteImagePath);
    
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
      imageDescription
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
      // If we have an image, upload it to LinkedIn first
      console.log('Post includes an image, uploading to LinkedIn...');
      const imageUploadResult = await uploadImageToLinkedIn(
        user.linkedinAccessToken, 
        userUrn, 
        imagePath
      );
      
      if (!imageUploadResult.success) {
        throw new Error(`Failed to upload image to LinkedIn: ${JSON.stringify(imageUploadResult.error)}`);
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

module.exports = {
  getLinkedInProfile,
  getUserPosts,
  createLinkedInPost,
  initializeImageUpload,
  getLinkedInBasicProfile
}; 