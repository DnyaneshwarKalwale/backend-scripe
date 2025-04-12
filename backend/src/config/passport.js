const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
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
    new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract profile information
        const { id, emails, name, photos } = profile;
        
        if (!emails || emails.length === 0) {
          return done(null, false, { message: 'No email found in Google profile' });
        }
        
        const email = emails[0].value;
        const firstName = name.givenName;
        const lastName = name.familyName;
        const profilePicture = photos[0].value;
        
        // Check if user already exists
        let user = await User.findOne({ googleId: id });
        
        // If not found by Google ID, check by email
        if (!user) {
          user = await User.findOne({ email });
          
          if (user) {
            // Update user with Google ID
            user.googleId = id;
            if (!user.profilePicture) {
              user.profilePicture = profilePicture;
            }
            await user.save();
          } else {
            // Create new user
            user = await User.create({
              googleId: id,
              firstName,
              lastName,
              email,
              profilePicture,
              isEmailVerified: true,
              authMethod: 'google',
            });
          }
        }
        
        return done(null, user);
      } catch (error) {
        console.error('Google auth error:', error);
        return done(error, false);
      }
    })
  );

  // LinkedIn Strategy
  passport.use(
    new LinkedInStrategy({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: process.env.LINKEDIN_CALLBACK_URL,
      scope: ['r_emailaddress', 'r_liteprofile'],
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract profile information
        const { id, name, emails, photos } = profile;
        
        // Check if user already exists
        let user = await User.findOne({ linkedinId: id });
        
        // If user has email, check if exists by email
        if (emails && emails.length > 0) {
          const email = emails[0].value;
          
          if (!user) {
            user = await User.findOne({ email });
            
            if (user) {
              // Update user with LinkedIn ID
              user.linkedinId = id;
              if (!user.profilePicture && photos && photos.length > 0) {
                user.profilePicture = photos[0].value;
              }
              await user.save();
            } else {
              // Create new user
              user = await User.create({
                linkedinId: id,
                firstName: name.givenName,
                lastName: name.familyName,
                email,
                profilePicture: photos && photos.length > 0 ? photos[0].value : null,
                isEmailVerified: true,
                authMethod: 'linkedin',
              });
            }
          }
        } else if (!user) {
          // Create user without email (not ideal but possible)
          user = await User.create({
            linkedinId: id,
            firstName: name.givenName || 'LinkedInUser',
            lastName: name.familyName || '',
            email: `linkedin_${id}@placeholder.scripe.com`,
            profilePicture: photos && photos.length > 0 ? photos[0].value : null,
            isEmailVerified: false,
            authMethod: 'linkedin',
          });
        }
        
        return done(null, user);
      } catch (error) {
        console.error('LinkedIn auth error:', error);
        return done(error, false);
      }
    })
  );
}; 