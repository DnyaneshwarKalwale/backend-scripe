const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/userModel');
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const axios = require('axios');

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

  // LinkedIn OAuth Strategy using OpenID Connect
  passport.use(
    new LinkedInStrategy(
      {
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: process.env.LINKEDIN_CALLBACK_URL,
        scope: ['openid', 'profile', 'email'],
        state: true,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, params, profile, done) => {
        try {
          console.log('LinkedIn auth starting with access token');
          console.log('LinkedIn profile from strategy:', JSON.stringify(profile));
          
          // The passport-linkedin-oauth2 package might not properly fetch the profile from OpenID Connect endpoint
          // So we'll manually fetch the user info from the OpenID Connect endpoint
          try {
            console.log('Manually fetching user info from OpenID Connect endpoint');
            const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            });
            
            console.log('LinkedIn OpenID profile data:', JSON.stringify(userInfoResponse.data));
            
            // Merge the OpenID Connect profile data with the original profile
            profile._json = userInfoResponse.data;
            profile.id = userInfoResponse.data.sub || profile.id;
            
            // Set email from OpenID Connect response
            if (userInfoResponse.data.email) {
              profile.emails = [{ value: userInfoResponse.data.email }];
            }
            
            // Set name from OpenID Connect response
            if (userInfoResponse.data.given_name || userInfoResponse.data.family_name) {
              profile.name = {
                givenName: userInfoResponse.data.given_name || '',
                familyName: userInfoResponse.data.family_name || ''
              };
              
              profile.displayName = `${userInfoResponse.data.given_name || ''} ${userInfoResponse.data.family_name || ''}`.trim();
            }
            
            // Set profile picture if available
            if (userInfoResponse.data.picture) {
              profile.photos = [{ value: userInfoResponse.data.picture }];
            }
          } catch (error) {
            console.error('Error fetching LinkedIn OpenID profile:', error.message);
            // Continue with the original profile data if available
          }
          
          // Store access tokens for later API calls with proper expiry time
          const tokenExpiryTime = new Date();
          tokenExpiryTime.setSeconds(tokenExpiryTime.getSeconds() + (params.expires_in || 3600));
          
          // Extract email from the profile based on OpenID Connect format
          let email = null;
          if (profile.emails && profile.emails[0]) {
            email = profile.emails[0].value;
          } else if (profile._json && profile._json.email) {
            // OpenID Connect format often puts email directly in _json
            email = profile._json.email;
          }
          
          console.log(`LinkedIn auth: Email ${email ? 'provided: ' + email : 'not provided'}`);
          
          if (!email) {
            console.error('LinkedIn auth: No email provided from LinkedIn. Check scope permissions.');
            return done(new Error('LinkedIn did not provide an email address. Please check your app permissions.'), false);
          }
          
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
              
              if (!user.profilePicture && profile.photos && profile.photos[0]) {
                user.profilePicture = profile.photos[0].value;
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
            // Parse name from profile - handle both OAuth 2.0 and OpenID Connect formats
            let firstName = 'User';
            let lastName = '';
            
            if (profile.name) {
              firstName = profile.name.givenName || firstName;
              lastName = profile.name.familyName || lastName;
            } else if (profile.displayName) {
              const nameParts = profile.displayName.split(' ');
              firstName = nameParts[0] || firstName;
              lastName = nameParts.slice(1).join(' ') || lastName;
            } else if (profile._json) {
              // Try to extract from OpenID Connect format
              firstName = profile._json.given_name || firstName;
              lastName = profile._json.family_name || lastName;
            }
            
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
            console.log('LinkedIn auth: New user created successfully');
          }

          console.log('LinkedIn auth: Authentication successful, returning user');
          return done(null, user);
        } catch (error) {
          console.error('LinkedIn OAuth Error:', error.message);
          console.error('Full error stack:', error.stack);
          return done(error, false);
        }
      }
    )
  );
}; 