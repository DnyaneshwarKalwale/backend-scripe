# Setting Up LinkedIn Authentication

LinkedIn has specific requirements for OAuth callback URLs. Here are several approaches to get LinkedIn authentication working in your development and production environments:

## Option 1: Create a LinkedIn Developer App

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
2. Click the "Create app" button
3. Fill in the required fields:
   - App name: "Scripe"
   - LinkedIn Page: Your company LinkedIn page URL (or personal URL)
   - App logo: Upload your logo
   - Legal agreement: Accept the terms

4. Once created, set up the Auth section:
   - Add redirect URLs for development and production:
     - `http://localhost:5000/api/auth/linkedin/callback` (for local development)
     - `https://your-production-domain.com/api/auth/linkedin/callback` (for production)
   - Request the following OAuth 2.0 scopes:
     - `r_emailaddress` - to access the user's email
     - `r_liteprofile` - to access basic profile information

5. Take note of the Client ID and Client Secret from the Auth tab

## Option 2: Use ngrok for Development

[ngrok](https://ngrok.com/) creates secure tunnels to expose your local server to the internet.

1. Install ngrok:
   ```
   npm install -g ngrok
   # or
   brew install ngrok
   ```

2. Start your backend server on port 5000:
   ```
   npm run dev
   ```

3. In a separate terminal, start ngrok:
   ```
   ngrok http 5000
   ```

4. Ngrok will provide a public URL (e.g., `https://a1b2c3d4.ngrok.io`)

5. Update your LinkedIn Developer Portal settings:
   - Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
   - Navigate to your project/app settings
   - Add the ngrok URL as a redirect URL: `https://your-ngrok-url.ngrok.io/api/auth/linkedin/callback`

6. Update your `.env` file with the ngrok URLs:
   ```
   LINKEDIN_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/auth/linkedin/callback
   FRONTEND_URL=https://your-ngrok-url.ngrok.io
   ```

## Option 3: Use a Proper Domain (For Production)

For production environments:

1. Set up your application on a proper domain (e.g., `https://yourdomain.com`)
2. Configure your LinkedIn app with:
   - Redirect URL: `https://yourdomain.com/api/auth/linkedin/callback`
3. Update your `.env` file:
   ```
   LINKEDIN_CALLBACK_URL=https://yourdomain.com/api/auth/linkedin/callback
   FRONTEND_URL=https://yourdomain.com
   ```

## Option 4: Using Mock LinkedIn Auth for Local Testing

For quick local testing without setting up a real LinkedIn application:

1. Start your backend and frontend servers:
   ```
   # Start backend
   cd backend-scripe/backend
   npm run dev
   
   # Start frontend
   cd multi-lang-welcome
   npm run dev
   ```

2. Use the mock LinkedIn auth endpoint by visiting this URL in your browser:
   ```
   http://localhost:5000/api/auth/mock-linkedin-auth
   ```
   
   You can also customize the mock user with query parameters:
   ```
   http://localhost:5000/api/auth/mock-linkedin-auth?name=John%20Doe&email=john@example.com&linkedinId=custom123&profileImage=https://example.com/image.jpg
   ```

3. This will create a mock LinkedIn user and redirect you to the OAuth callback page, simulating a real LinkedIn login flow.

This method is useful for development and testing without requiring real LinkedIn API credentials.

## Troubleshooting

Common LinkedIn OAuth issues:

1. **"Invalid redirect URL"**:
   - Ensure the exact callback URL is listed in your LinkedIn app settings
   - Check for trailing slashes or http/https differences

2. **"Missing required parameter: scope"**:
   - Ensure your application correctly requests the required scopes
   - The minimum required scopes are `r_emailaddress` and `r_liteprofile`

3. **"Invalid client ID or secret"**:
   - Double-check your client ID and client secret
   - Make sure you're using the correct values in your environment variables 