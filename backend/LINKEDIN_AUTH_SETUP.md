# Setting Up LinkedIn Authentication for Render Deployment

LinkedIn has specific requirements for OAuth callback URLs. This guide shows how to configure LinkedIn authentication for the Render-deployed backend at https://backend-scripe.onrender.com.

## Required Configuration in LinkedIn Developer Portal

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
2. Click the "Create app" button
3. Fill in the required fields:
   - App name: "Scripe"
   - LinkedIn Page: Your company LinkedIn page URL (or personal URL)
   - App logo: Upload your logo
   - Legal agreement: Accept the terms

4. Once created, set up the Auth section:
   - Add the following redirect URLs:
     - `https://backend-scripe.onrender.com/api/auth/linkedin/callback` (Backend callback URL)
     - `https://deluxe-cassata-51d628.netlify.app/auth/social-callback` (Frontend callback URL)
   - Add the "Sign In with LinkedIn using OpenID Connect" product
   - Under "OAuth 2.0 scopes", make sure these scopes are enabled:
     - `openid` - Required for OpenID Connect authentication
     - `profile` - Allows access to the user's basic profile
     - `email` - Allows access to the user's email

5. Use these verified client credentials:
   ```
   LINKEDIN_CLIENT_ID=77rawlclal56f1
   LINKEDIN_CLIENT_SECRET=WPL_AP1.GLiYKT7Fr5tWSTfk.c5so8g==
   ```

## Environment Configuration in Render

1. Go to your Render dashboard for the backend service
2. Navigate to the Environment section
3. Add the following environment variables:
   ```
   LINKEDIN_CLIENT_ID=77rawlclal56f1
   LINKEDIN_CLIENT_SECRET=WPL_AP1.GLiYKT7Fr5tWSTfk.c5so8g==
   LINKEDIN_CALLBACK_URL=https://backend-scripe.onrender.com/api/auth/linkedin/callback
   FRONTEND_URL=https://deluxe-cassata-51d628.netlify.app
   ```

4. Save the changes and deploy the service.

## Testing LinkedIn Authentication

To test your LinkedIn authentication:

1. Visit your frontend application
2. Click on the "Connect with LinkedIn" button
3. You should be redirected to LinkedIn for authentication
4. After authorizing, you should be redirected back to your application

## Using Mock Auth for Local Testing

For quick local testing without setting up a real LinkedIn application:

1. Start your backend and frontend servers locally
2. Use the mock LinkedIn auth endpoint by visiting:
   ```
   http://localhost:5000/api/auth/mock-linkedin-auth
   ```
   
   You can also customize the mock user with query parameters:
   ```
   http://localhost:5000/api/auth/mock-linkedin-auth?name=John%20Doe&email=john@example.com&linkedinId=custom123&profileImage=https://example.com/image.jpg
   ```

## Troubleshooting

Common LinkedIn OAuth issues:

1. **"Invalid redirect URL"**:
   - Ensure the exact callback URL is listed in your LinkedIn app settings
   - Verify that `https://backend-scripe.onrender.com/api/auth/linkedin/callback` is exactly as shown in your LinkedIn Developer Portal

2. **"Missing required parameter: scope"**:
   - Ensure your application correctly requests the required scopes
   - The minimum required scopes are `r_emailaddress` and `r_liteprofile`

3. **"Invalid client ID or secret"**:
   - Double-check your client ID and client secret in your environment variables
   - Make sure they match exactly what's shown in the LinkedIn Developer Portal

### Fixing "Scope 'r_emailaddress' is not authorized for your application" Error

If you're encountering this specific error, follow these steps:

1. **Add required products to your app:**
   - Go to the LinkedIn Developer Portal > Your App > Products
   - Click on "Select Products"
   - Add "Sign In with LinkedIn" product to your application
   - This product grants access to both `r_liteprofile` and `r_emailaddress` scopes

2. **Verify scope permissions:**
   - Go to the "Auth" tab in your app settings
   - Under "OAuth 2.0 scopes", make sure both scopes are listed:
     - `r_liteprofile`
     - `r_emailaddress`
   - If they're not listed, you need to add the "Sign In with LinkedIn" product first

3. **Update scope configuration in your app code:**
   - Make sure your passport.js configuration includes both scopes in this order:
     ```javascript
     scope: ['r_liteprofile', 'r_emailaddress']
     ```

4. **Request app verification if needed:**
   - Some LinkedIn API scopes may require app verification
   - Follow LinkedIn's verification process if prompted

After making these changes, restart your backend server and try the LinkedIn login again. Users should now be able to successfully authenticate with LinkedIn, and those who already have accounts with the same email (e.g., from Google login) will be automatically linked to their existing accounts.

## Troubleshooting Frontend Errors

If you see browser console errors like:

```
Uncaught ReferenceError: require is not defined
Uncaught Error: TrackingTwo requires an initialPageInstance
GET https://static.licdn.com/sc/p/com.linkedin.oauth-fe%3Aoauth-fe-static-content%2B4.0.1491/f/%2Foauth-frontend%2Fartdeco%2Fstatic%2Fimages%2Ficons.svg 404 (Not Found)
```

These errors typically come from LinkedIn's authentication page and are unrelated to your code. Common reasons for these errors appearing:

1. **Browser Extensions**: Ad blockers or privacy extensions can interfere with LinkedIn's authentication scripts
2. **Network Issues**: Temporary connectivity problems with LinkedIn's servers
3. **LinkedIn UI Updates**: LinkedIn occasionally updates their authentication UI, causing temporary script errors

If authentication fails and you're redirected with an error message like "Bummer, something went wrong," try these steps:

1. **Check Network Inspector**: Look for failed API requests with error responses
2. **Server Logs**: Check your backend logs for error messages when LinkedIn tries to call your callback URL
3. **Restart OAuth Flow**: Try the authentication again from scratch (sometimes it's just a temporary issue)
4. **Use Incognito/Private Window**: Test in a browser with no extensions to rule out extension interference
5. **Verify App Settings**: Double-check your LinkedIn Developer Portal settings match your environment configuration

Remember that LinkedIn's OAuth implementation can be sensitive to exact configuration details. The most common issues are:

- Mismatched callback URLs (even a trailing slash difference matters)
- Missing products or permissions in your LinkedIn app
- LinkedIn app not yet approved for the scopes you're requesting

### OpenID Connect Configuration

If you're using the "Sign In with LinkedIn using OpenID Connect" product (which is recommended), note the following:

1. **Correct User Info Endpoint**: 
   - The OpenID Connect user info endpoint is `https://api.linkedin.com/v2/userinfo`
   - This endpoint returns user profile information in the OpenID Connect standard format

2. **Profile Structure Differences**:
   - OpenID Connect returns profile data differently than the legacy OAuth 2.0 API
   - The email is typically found directly in `profile._json.email` rather than in `profile.emails`
   - Name information is formatted according to OpenID Connect standards (`given_name`, `family_name`)

3. **Required Configuration in passport.js**:
   ```javascript
   passport.use(
     new LinkedInStrategy({
       // ... other options
       scope: ['openid', 'profile', 'email'],
       userProfileURL: 'https://api.linkedin.com/v2/userinfo',
     })
   );
   ```

## Troubleshooting Scope-related Errors

The most common error when setting up LinkedIn authentication is the scope-related error:

```
Scope "r_emailaddress" is not authorized for your application
```

This happens when you're using the wrong authentication product or incorrect scopes. Here's how to fix it:

1. If you're using the "Sign In with LinkedIn using OpenID Connect" product:
   - Use scopes: `['openid', 'profile', 'email']`
   - Set `userProfileURL: 'https://api.linkedin.com/v2/userinfo'`

2. If you're using the legacy "Sign In with LinkedIn" product (not OpenID Connect):
   - Use scopes: `['r_liteprofile', 'r_emailaddress']`

After making these changes, restart your backend server and try the LinkedIn login again. Users should now be able to successfully authenticate with LinkedIn, and those who already have accounts with the same email (e.g., from Google login) will be automatically linked to their existing accounts.

### Manual Profile Fetching with OpenID Connect

If you encounter a `{"success":false,"error":"failed to fetch user profile"}` error, you may need to manually fetch the user profile from the OpenID Connect endpoint. This is because the `passport-linkedin-oauth2` package may not be fully compatible with LinkedIn's OpenID Connect implementation.

1. **Make sure axios is installed**:
   ```
   npm install axios
   ```

2. **Update your passport.js configuration to manually fetch the profile**:
   ```javascript
   const axios = require('axios');
   
   passport.use(
     new LinkedInStrategy(
       {
         clientID: process.env.LINKEDIN_CLIENT_ID,
         clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
         callbackURL: process.env.LINKEDIN_CALLBACK_URL,
         scope: ['openid', 'profile', 'email'],
         state: true,
         passReqToCallback: true,
       },
       async (req, accessToken, refreshToken, params, profile, done) => {
         try {
           // Manually fetch the profile from the OpenID Connect endpoint
           const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
             headers: {
               Authorization: `Bearer ${accessToken}`
             }
           });
           
           // Merge the OpenID Connect profile data with the original profile
           profile._json = userInfoResponse.data;
           profile.id = userInfoResponse.data.sub || profile.id;
           
           // Rest of your authentication logic...
         } catch (error) {
           console.error('LinkedIn OAuth Error:', error);
           return done(error, false);
         }
       }
     )
   );
   ```

3. **OpenID Connect Response Format**:
   The response from the `/v2/userinfo` endpoint follows the OpenID Connect standard and typically contains:
   ```json
   {
     "sub": "LinkedIn-ID",
     "email": "user@example.com",
     "email_verified": true,
     "name": "User Name",
     "given_name": "User",
     "family_name": "Name",
     "picture": "https://..."
   }
   ```

After making these changes, restart your backend server and try the LinkedIn login again. Users should now be able to successfully authenticate with LinkedIn, and those who already have accounts with the same email (e.g., from Google login) will be automatically linked to their existing accounts. 