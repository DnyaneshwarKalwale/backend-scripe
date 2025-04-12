const GoogleStrategy = require('passport-google-oauth20').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/userModel');
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;

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

  // LinkedIn OAuth Strategy
  passport.use(
    new LinkedInStrategy(
      {
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: process.env.LINKEDIN_CALLBACK_URL,
        scope: ['r_emailaddress', 'r_liteprofile'],
        state: true,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          console.log('LinkedIn profile:', JSON.stringify(profile));
          
          // Store access tokens for later API calls
          const tokenExpiryTime = new Date();
          tokenExpiryTime.setSeconds(tokenExpiryTime.getSeconds() + profile.tokenExpiresIn || 3600);
          
          // LinkedIn always provides email
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          
          if (!email) {
            console.error('LinkedIn did not provide an email address');
            return done(new Error('LinkedIn account must have an email address'), false);
          }
          
          // Check if user exists by LinkedIn ID
          let user = await User.findOne({ linkedinId: profile.id });
          
          // If not found by LinkedIn ID, check by email
          if (!user) {
            user = await User.findOne({ email });
            
            // If user exists by email, update LinkedIn ID and tokens
            if (user) {
              user.linkedinId = profile.id;
              user.linkedinAccessToken = accessToken;
              user.linkedinRefreshToken = refreshToken;
              user.linkedinTokenExpiry = tokenExpiryTime;
              
              if (!user.profilePicture && profile.photos && profile.photos[0]) {
                user.profilePicture = profile.photos[0].value;
              }
              await user.save();
            }
          } else {
            // Update tokens for existing LinkedIn user
            user.linkedinAccessToken = accessToken;
            user.linkedinRefreshToken = refreshToken;
            user.linkedinTokenExpiry = tokenExpiryTime;
            await user.save();
          }
          
          // If user doesn't exist, create a new one
          if (!user) {
            // Parse name from profile
            const firstName = profile.name?.givenName || profile.displayName.split(' ')[0] || 'User';
            const lastName = profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ') || '';
            
            user = await User.create({
              linkedinId: profile.id,
              firstName,
              lastName,
              email,
              isEmailVerified: true, // LinkedIn emails are verified
              profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
              authMethod: 'linkedin',
              onboardingCompleted: false,
              linkedinAccessToken: accessToken,
              linkedinRefreshToken: refreshToken,
              linkedinTokenExpiry: tokenExpiryTime
            });
          }

          return done(null, user);
        } catch (error) {
          console.error('LinkedIn OAuth Error:', error);
          return done(error, false);
        }
      }
    )
  );
}; 