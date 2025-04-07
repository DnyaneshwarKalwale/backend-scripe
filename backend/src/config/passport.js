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
        const user = await User.findById(jwt_payload.id);
        
        if (user) {
          return done(null, user);
        }
        
        return done(null, false);
      } catch (error) {
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
          console.log('Google profile:', JSON.stringify(profile));
          
          // Check if email is available from Google
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const username = profile.displayName.replace(/\s+/g, '').toLowerCase();
          
          // If no email is provided or user email preferences are set to private, generate a placeholder
          const generatedEmail = email || `${username}.google@placeholder.scripe.com`;
          
          // Check if user already exists by Google ID first
          let user = await User.findOne({ googleId: profile.id });
          
          // If not found by Google ID but we have an email, try finding by email
          if (!user && email) {
            user = await User.findOne({ email });
            
            // If user exists by email, update Google ID
            if (user) {
              user.googleId = profile.id;
              if (!user.profilePicture && profile.photos && profile.photos[0]) {
                user.profilePicture = profile.photos[0].value;
              }
              await user.save();
              return done(null, user);
            }
          }

          // If user doesn't exist, create new user
          if (!user) {
            user = await User.create({
              googleId: profile.id,
              firstName: profile.name.givenName || profile.displayName.split(' ')[0],
              lastName: profile.name.familyName || '',
              email: generatedEmail, // Use generated email if actual email isn't available
              isEmailVerified: email ? true : false, // Only verify if actual email was provided
              profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
              authMethod: 'google',
              onboardingCompleted: false,
            });
          }

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
            // Handle name - use the full name as firstName if no space is found
            const nameParts = profile.displayName.trim().split(/\s+/);
            const firstName = nameParts[0] || profile.username || 'User';
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName; // Use firstName as lastName if no last name
            
            user = await User.create({
              twitterId: profile.id,
              firstName,
              lastName,
              email: generatedEmail,
              isEmailVerified: email ? true : false,
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