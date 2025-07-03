const GoogleStrategy = require('passport-google-oauth20').Strategy;
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
            const newUser = {
              googleId: profile.id,
              firstName: profile.name.givenName || profile.displayName.split(' ')[0],
              lastName: profile.name.familyName || '',
              email: generatedEmail,
              isEmailVerified: email ? true : false,
              profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
              authMethod: 'google',
              onboardingCompleted: false,
            };

            console.log('Creating new Google user with data:', JSON.stringify(newUser, null, 2));
            
            try {
              user = await User.create(newUser);
              console.log('Google user created successfully:', user._id);
            } catch (createError) {
              console.error('Error creating Google user:', createError);
              console.error('User data that failed:', JSON.stringify(newUser, null, 2));
              
              // If validation failed, try to create with minimal required fields
              if (createError.name === 'ValidationError') {
                console.log('Attempting to create user with minimal required fields...');
                const minimalUser = {
                  googleId: profile.id,
                  firstName: profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User',
                  lastName: profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '',
                  email: generatedEmail,
                  authMethod: 'google',
                  isEmailVerified: true,
                  onboardingCompleted: false
                };
                
                console.log('Minimal user data:', JSON.stringify(minimalUser, null, 2));
                user = await User.create(minimalUser);
                console.log('Google user created with minimal data:', user._id);
              } else {
                throw createError;
              }
            }
            
            // Automatically activate free trial for new OAuth users
            try {
              const UserLimit = require('../models/userLimitModel');
              
              // Check if user already has a trial (prevent duplicate trials)
              const existingLimit = await UserLimit.findOne({ userId: user._id });
              
              if (!existingLimit) {
                // Set trial expiration date (7 days from now)
                const trialExpiration = new Date();
                trialExpiration.setDate(trialExpiration.getDate() + 7);
                
                // Create user limit with trial plan
                await UserLimit.create({
                  userId: user._id,
                  limit: 3, // 3 credits for trial
                  count: 0,
                  planId: 'trial',
                  planName: 'Free Trial',
                  expiresAt: trialExpiration,
                  status: 'active',
                  subscriptionStartDate: new Date()
                });
                
                console.log(`Free trial automatically activated for new Google OAuth user: ${user.email}`);
              } else {
                console.log(`Google OAuth user ${user.email} already has a user limit, skipping trial activation`);
              }
            } catch (limitError) {
              console.error('Error creating user limit for new Google OAuth user:', limitError);
              // Continue with OAuth even if limit creation fails
            }
          }

          return done(null, user);
        } catch (error) {
          console.error('Google OAuth Error:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
          
          // If it's a validation error, log the specific validation issues
          if (error.name === 'ValidationError') {
            console.error('Validation errors:', error.errors);
          }
          
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
        userProfileURL: 'https://api.linkedin.com/v2/userinfo',
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
              const newUser = {
                linkedinId: profile.id,
                firstName,
                lastName,
                email,
                isEmailVerified: true,
                profilePicture,
                authMethod: 'linkedin',
                onboardingCompleted: false,
                linkedinAccessToken: accessToken,
                linkedinRefreshToken: refreshToken,
                linkedinTokenExpiry: tokenExpiryTime
              };

              user = await User.create(newUser);
              console.log('LinkedIn auth: New user created successfully');
              
              // Automatically activate free trial for new LinkedIn OAuth users
              try {
                const UserLimit = require('../models/userLimitModel');
                
                // Check if user already has a trial (prevent duplicate trials)
                const existingLimit = await UserLimit.findOne({ userId: user._id });
                
                if (!existingLimit) {
                  // Set trial expiration date (7 days from now)
                  const trialExpiration = new Date();
                  trialExpiration.setDate(trialExpiration.getDate() + 7);
                  
                  // Create user limit with trial plan
                  await UserLimit.create({
                    userId: user._id,
                    limit: 3, // 3 credits for trial
                    count: 0,
                    planId: 'trial',
                    planName: 'Free Trial',
                    expiresAt: trialExpiration,
                    status: 'active',
                    subscriptionStartDate: new Date()
                  });
                  
                  console.log(`Free trial automatically activated for new LinkedIn OAuth user: ${user.email}`);
                } else {
                  console.log(`LinkedIn OAuth user ${user.email} already has a user limit, skipping trial activation`);
                }
              } catch (limitError) {
                console.error('Error creating user limit for new LinkedIn OAuth user:', limitError);
                // Continue with OAuth even if limit creation fails
              }
            } catch (createError) {
              console.error('LinkedIn auth: Error creating user:', createError.message);
              return done(createError, false);
            }
          }

          return done(null, user);
        } catch (error) {
          console.error('LinkedIn OAuth Error:', error);
          if (error.response) {
            console.error('LinkedIn API Error Response:', error.response.data);
          }
          return done(error, false);
        }
      }
    )
  );
}; 