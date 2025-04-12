const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const User = require('../models/userModel');

module.exports = (passport) => {
  // JWT Strategy for token authentication
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET,
      },
      async (jwt_payload, done) => {
        try {
          const user = await User.findById(jwt_payload.id);
          if (user) {
            return done(null, user);
          }
          return done(null, false);
        } catch (error) {
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
        scope: ['openid', 'profile', 'email', 'w_member_social'],
        profileFields: ['id', 'first-name', 'last-name', 'email-address', 'profile-picture'],
        state: true,
        passReqToCallback: true,
        // ✅ FIXED: Removed userProfileURL (was causing 500 error)
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          console.log('LinkedIn auth: OAuth flow successful');
          console.log('LinkedIn accessToken:', accessToken);
          console.log('LinkedIn refreshToken:', refreshToken ? 'Present' : 'Not provided');
          console.log('LinkedIn profile received:', JSON.stringify(profile, null, 2));
          
          // Store access tokens for later API calls
          const tokenExpiryTime = new Date();
          tokenExpiryTime.setSeconds(tokenExpiryTime.getSeconds() + (profile.tokenExpiresIn || 3600));
          
          // Extract email from profile (handle both OpenID and old API formats)
          let email = null;
          
          // For OpenID format, the email is available directly in the profile
          if (profile.emails && profile.emails.length > 0) {
            email = profile.emails[0].value;
          } 
          // For OpenID format with email in the id_token
          else if (profile.email) {
            email = profile.email;
          }
          // Check if it's available in the _json object (old format)
          else if (profile._json && profile._json.email) {
            email = profile._json.email;
          }
          
          console.log(`LinkedIn auth: Email ${email ? 'provided: ' + email : 'not provided'}`);
          
          // First check if user exists by LinkedIn ID
          let user = await User.findOne({ linkedinId: profile.id });
          console.log(`LinkedIn auth: User by linkedinId ${user ? 'found' : 'not found'}`);
          
          // If not found by LinkedIn ID but email is provided, check by email (to link with existing accounts)
          if (!user && email) {
            user = await User.findOne({ email });
            console.log(`LinkedIn auth: User by email ${user ? 'found' : 'not found'}`);
            
            // If user exists by email, update LinkedIn ID and tokens (link accounts)
            if (user) {
              console.log(`LinkedIn auth: Linking LinkedIn account to existing user with email ${email}`);
              user.linkedinId = profile.id;
              user.linkedinAccessToken = accessToken;
              user.linkedinRefreshToken = refreshToken;
              user.linkedinTokenExpiry = tokenExpiryTime;
              
              // Get profile picture - handle both formats
              let profilePicture = null;
              if (profile.photos && profile.photos[0]) {
                profilePicture = profile.photos[0].value;
              } else if (profile.picture) {
                profilePicture = profile.picture;
              }
              
              if (!user.profilePicture && profilePicture) {
                user.profilePicture = profilePicture;
              }
              await user.save();
              console.log('LinkedIn auth: Account successfully linked');
            }
          } else if (user) {
            // Update tokens for existing LinkedIn user
            console.log('LinkedIn auth: Updating tokens for existing LinkedIn user');
            user.linkedinAccessToken = accessToken;
            user.linkedinRefreshToken = refreshToken;
            user.linkedinTokenExpiry = tokenExpiryTime;
            await user.save();
          }
          
          // If user doesn't exist, create a new one
          if (!user) {
            // Only proceed if we have an email
            if (!email) {
              console.error('LinkedIn auth: No email provided and user does not exist');
              return done(new Error('LinkedIn account must provide an email address for registration'), false);
            }
            
            console.log('LinkedIn auth: Creating new user');
            // Parse name from profile - handle both formats
            let firstName, lastName;
            
            if (profile.name) {
              // OpenID format might provide name directly
              firstName = profile.name.givenName || profile.displayName?.split(' ')[0] || 'User';
              lastName = profile.name.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
            } else if (profile.firstName || profile.lastName) {
              // Direct properties 
              firstName = profile.firstName || 'User';
              lastName = profile.lastName || '';
            } else if (profile.given_name || profile.family_name) {
              // OpenID Connect standard claims
              firstName = profile.given_name || 'User';
              lastName = profile.family_name || '';
            } else {
              // Fallback to display name or default
              firstName = profile.displayName?.split(' ')[0] || 'User';
              lastName = profile.displayName?.split(' ').slice(1).join(' ') || '';
            }
            
            // Get profile picture - handle both formats
            let profilePicture = null;
            if (profile.photos && profile.photos[0]) {
              profilePicture = profile.photos[0].value;
            } else if (profile.picture) {
              profilePicture = profile.picture;
            }
            
            try {
              user = await User.create({
                linkedinId: profile.id,
                firstName,
                lastName,
                email,
                isEmailVerified: true, // LinkedIn emails are verified
                profilePicture,
                authMethod: 'linkedin',
                onboardingCompleted: false,
                linkedinAccessToken: accessToken,
                linkedinRefreshToken: refreshToken,
                linkedinTokenExpiry: tokenExpiryTime
              });
              console.log('LinkedIn auth: New user created successfully');
            } catch (createError) {
              console.error('LinkedIn auth: Error creating user:', createError.message);
              return done(createError, false);
            }
          }

          return done(null, user);
        } catch (error) {
          console.error('LinkedIn OAuth Error:', error);
          // Add more detailed error logging
          if (error.response) {
            console.error('LinkedIn API Error Response:', error.response.data);
          }
          return done(error, false);
        }
      }
    )
  );
};
