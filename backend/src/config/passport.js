const GoogleStrategy = require('passport-google-oauth20').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/userModel');

module.exports = (passport) => {
  // JWT Strategy for token authentication
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(opts, async (jwt_payload, done) => {
      try {
        // Check if the JWT payload has an ID
        if (!jwt_payload || !jwt_payload.id) {
          console.error('JWT payload missing ID:', jwt_payload);
          return done(null, false, { message: 'Invalid token payload' });
        }
        
        const user = await User.findById(jwt_payload.id);
        
        if (user) {
          return done(null, user);
        } else {
          console.error('User not found for ID:', jwt_payload.id);
          return done(null, false, { message: 'User not found' });
        }
      } catch (error) {
        console.error('JWT authentication error:', error);
        return done(error, false);
      }
    })
  );

  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            // User exists - update Google profile data if needed
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            return done(null, user);
          }

          // Create new user
          user = await User.create({
            googleId: profile.id,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email: profile.emails[0].value,
            isEmailVerified: true, // Google accounts are verified
            profilePicture: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
            authMethod: 'google',
            onboardingCompleted: false,
          });

          return done(null, user);
        } catch (error) {
          console.error('Google OAuth Error:', error);
          return done(error, false);
        }
      }
    )
  );

  // Twitter OAuth Strategy
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
        callbackURL: process.env.TWITTER_CALLBACK_URL,
        includeEmail: true, // Request email from Twitter
        userProfileURL: 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
        passReqToCallback: true,
      },
      async (req, token, tokenSecret, profile, done) => {
        try {
          console.log('Twitter profile:', JSON.stringify(profile));
          
          // Twitter may not always provide email
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const username = profile.username || profile.displayName.replace(/\s+/g, '').toLowerCase();
          
          // If no email is provided, generate a placeholder email using the Twitter username
          const generatedEmail = email || `${username}.twitter@placeholder.scripe.com`;
          
          // Check if user exists by Twitter ID
          let user = await User.findOne({ twitterId: profile.id });
          
          // If not found by Twitter ID but email is provided, check by email
          if (!user && email) {
            user = await User.findOne({ email });
            
            // If user exists by email, update Twitter ID
            if (user) {
              user.twitterId = profile.id;
              if (!user.profilePicture && profile.photos && profile.photos[0]) {
                user.profilePicture = profile.photos[0].value;
              }
              await user.save();
            }
          }
          
          // If user doesn't exist, create a new one
          if (!user) {
            // Split name into first and last name
            const nameParts = profile.displayName.split(' ');
            const firstName = nameParts[0] || username;
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            
            user = await User.create({
              twitterId: profile.id,
              firstName,
              lastName,
              email: generatedEmail, // Use the actual email or generated one
              isEmailVerified: email ? true : false, // Only mark as verified if Twitter provided an email
              profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
              authMethod: 'twitter',
              onboardingCompleted: false,
            });
          }

          return done(null, user);
        } catch (error) {
          console.error('Twitter OAuth Error:', error);
          return done(error, false);
        }
      }
    )
  );
}; 