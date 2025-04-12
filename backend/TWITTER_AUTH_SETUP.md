# Setting Up LinkedIn Authentication

LinkedIn has specific requirements for OAuth callback URLs. Here are several approaches to get LinkedIn authentication working in your development and production environments:

## Option 1: Use ngrok (Recommended for Development)

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
   - Make sure the redirect URL is also added to the Authorized redirect URLs list

6. Update your `.env` file with the ngrok URLs:
   ```
   LINKEDIN_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/auth/linkedin/callback
   FRONTEND_URL=https://your-ngrok-url.ngrok.io
   ```

## Option 2: Use the Direct LinkedIn Auth API

For development environments where setting up ngrok is not feasible, we've created a direct LinkedIn auth API endpoint that allows you to manually provide LinkedIn user data:

### Frontend Implementation

```javascript
// Example of using the direct LinkedIn auth endpoint
const handleLinkedInAuth = async () => {
  // In a real implementation, this data would come from LinkedIn
  // This is just a simplified example for development
  const mockLinkedInUser = {
    linkedinId: 'linkedin_' + Math.random().toString(36).substring(7),
    name: 'LinkedIn User',
    email: 'linkedin.user@example.com',
    profileImage: 'https://via.placeholder.com/150'
  };

  try {
    const response = await fetch('http://localhost:5000/api/auth/linkedin-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockLinkedInUser)
    });

    const data = await response.json();
    
    if (data.success) {
      // Save token to localStorage
      localStorage.setItem('token', data.token);
      
      // Redirect based on onboarding status
      window.location.href = data.redirectTo;
    }
  } catch (error) {
    console.error('Error authenticating with LinkedIn:', error);
  }
};
```

## Option 3: Use a Proper Domain (For Production)

For production environments:

1. Set up your application on a proper domain (e.g., `https://yourdomain.com`)
2. Configure your LinkedIn app with:
   - Redirect URL: `https://yourdomain.com/api/auth/linkedin/callback`
   - Add the domain to the authorized domains list
3. Update your `.env` file:
   ```
   LINKEDIN_CALLBACK_URL=https://yourdomain.com/api/auth/linkedin/callback
   FRONTEND_URL=https://yourdomain.com
   ```

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