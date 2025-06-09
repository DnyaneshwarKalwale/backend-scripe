# Scripe Backend API

A NodeJS backend for the Scripe application that generates LinkedIn content with high reach. This backend provides authentication, user management, and content generation APIs.

## Features

- User Authentication (Email, Google, Twitter)
- Email Verification
- JWT-based Authentication
- Onboarding Flow
- Content Generation
- User Profile Management

## Tech Stack

- Node.js
- Express.js
- MongoDB (Mongoose ORM)
- Passport.js for OAuth
- JWT for Authentication
- Nodemailer for Email Services

## Prerequisites

- Node.js (v14+)
- MongoDB instance
- Google & Twitter API credentials for OAuth

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```
PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=30d

# Email configuration
EMAIL_SERVICE=gmail
EMAIL_USERNAME=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=your_email@gmail.com

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://api.brandout.ai/api/auth/google/callback

# Twitter OAuth
TWITTER_CONSUMER_KEY=your_twitter_consumer_key
TWITTER_CONSUMER_SECRET=your_twitter_consumer_secret
TWITTER_CALLBACK_URL=https://api.brandout.ai/api/auth/twitter/callback

# Frontend URL (for redirects)
FRONTEND_URL=https://deluxe-cassata-51d628.netlify.app
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/DnyaneshwarKalwale/scripe_backend.git
cd scripe_backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The server will run on `https://api.brandout.ai` by default.

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/google` - Google OAuth login
- `GET /api/auth/twitter` - Twitter OAuth login
- `GET /api/auth/me` - Get current user profile
- `GET /api/auth/verify-email/:token` - Verify email address

### Onboarding

- `POST /api/onboarding` - Save onboarding data
- `GET /api/onboarding` - Get onboarding data
- `PUT /api/onboarding/theme` - Update theme preference
- `PUT /api/onboarding/language` - Update language preference

### Development

For local development, you can use:

- `GET /api/auth/mock-twitter-auth` - Mock Twitter authentication
- `GET /api/auth/dev-login` - Development login bypass

## Development

Run the server with nodemon for automatic reloading during development:

```bash
npm run dev
```

## License

[MIT](LICENSE)

## Contact

Dnyaneshwar Kalwale - [GitHub](https://github.com/DnyaneshwarKalwale) 