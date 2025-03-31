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
          
          // If email is available, check if user exists
          if (email) {
            let user = await User.findOne({ email });
            
            if (user) {
              // User exists - update Twitter profile data if needed
              if (!user.twitterId) {
                user.twitterId = profile.id;
                await user.save();
              }
              return done(null, user);
            }
          }
          
          // Check if user exists by Twitter ID
          let user = await User.findOne({ twitterId: profile.id });
          
          if (user) {
            return done(null, user);
          }

          // Create new user
          const nameParts = profile.displayName.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          
          user = await User.create({
            twitterId: profile.id,
            firstName,
            lastName,
            email, // May be null
            isEmailVerified: email ? true : false, // Twitter emails are verified when provided
            profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
            authMethod: 'twitter',
            onboardingCompleted: false,
          });

          return done(null, user);
        } catch (error) {
          console.error('Twitter OAuth Error:', error);
          return done(error, false);
        }
      }
    )
  );
}; 