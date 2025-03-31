# Setting Up Twitter Authentication

Twitter (X) has strict requirements for OAuth callback URLs and no longer allows localhost URLs for development. Here are several approaches to get Twitter authentication working in your development environment:

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

5. Update your Twitter Developer Portal settings:
   - Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Navigate to your project/app settings
   - Add the ngrok URL as a callback URL: `https://your-ngrok-url.ngrok.io/api/auth/twitter/callback`
   - Add the ngrok domain to App permissions > Website URL

6. Update your `.env` file with the ngrok URLs:
   ```
   TWITTER_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/auth/twitter/callback
   FRONTEND_URL=https://your-ngrok-url.ngrok.io
   ```

## Option 2: Use the Direct Twitter Auth API

For development environments where setting up ngrok is not feasible, we've created a direct Twitter auth API endpoint that allows you to manually provide Twitter user data:

### Frontend Implementation

```javascript
// Example of using the direct Twitter auth endpoint
const handleTwitterAuth = async () => {
  // In a real implementation, this data would come from Twitter
  // This is just a simplified example for development
  const mockTwitterUser = {
    twitterId: 'twitter_' + Math.random().toString(36).substring(7),
    name: 'Twitter User',
    email: 'twitter.user@example.com',
    profileImage: 'https://via.placeholder.com/150'
  };

  try {
    const response = await fetch('http://localhost:5000/api/auth/twitter-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockTwitterUser)
    });

    const data = await response.json();
    
    if (data.success) {
      // Save token to localStorage
      localStorage.setItem('token', data.token);
      
      // Redirect based on onboarding status
      window.location.href = data.redirectTo;
    }
  } catch (error) {
    console.error('Error authenticating with Twitter:', error);
  }
};
```

## Option 3: Use a Proper Domain (For Production)

For production environments:

1. Set up your application on a proper domain (e.g., `https://yourdomain.com`)
2. Configure your Twitter app with:
   - Callback URL: `https://yourdomain.com/api/auth/twitter/callback`
   - Website URL: `https://yourdomain.com`
3. Update your `.env` file:
   ```
   TWITTER_CALLBACK_URL=https://yourdomain.com/api/auth/twitter/callback
   FRONTEND_URL=https://yourdomain.com
   ```

## Troubleshooting

Common Twitter OAuth issues:

1. **"Callback URL not approved for this client application"**:
   - Ensure the exact callback URL is listed in your Twitter app settings
   - Check for trailing slashes or http/https differences

2. **"Failed to find request token in session"**:
   - This often happens when the callback URL doesn't match exactly
   - Twitter's OAuth 1.0a requires exact URL matching

3. **"The remote server returned an error: (401) Unauthorized"**:
   - Double-check your consumer key and secret
   - Verify your app has proper permissions 