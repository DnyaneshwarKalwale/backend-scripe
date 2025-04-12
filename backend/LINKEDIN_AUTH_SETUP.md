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
   - Add the following redirect URL:
     - `https://backend-scripe.onrender.com/api/auth/linkedin/callback`
   - Request the following OAuth 2.0 scopes:
     - `r_emailaddress` - to access the user's email
     - `r_liteprofile` - to access basic profile information

5. Take note of the Client ID and Client Secret from the Auth tab and add them to your Render environment variables.

## Environment Configuration in Render

1. Go to your Render dashboard for the backend service
2. Navigate to the Environment section
3. Add the following environment variables:
   ```
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
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