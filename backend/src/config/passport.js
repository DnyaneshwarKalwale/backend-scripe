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
        userProfileURL: 'https://api.linkedin.com/v2/userinfo',
      },
      async (req, accessToken, refreshToken, params, profile, done) => {
        try {
          console.log('LinkedIn auth starting with access token:', accessToken ? 'Token received' : 'No token');
          console.log('LinkedIn params:', JSON.stringify(params));
          
          // Debug profile data
          if (!profile) {
            console.error('LinkedIn auth: No profile received from strategy');
          } else {
            console.log('LinkedIn profile ID:', profile.id || 'No ID');
            console.log('LinkedIn profile has emails:', profile.emails ? 'Yes' : 'No');
            console.log('LinkedIn profile has name:', profile.name ? 'Yes' : 'No');
            console.log('LinkedIn profile has _json:', profile._json ? 'Yes' : 'No');
            console.log('LinkedIn profile from strategy:', JSON.stringify(profile));
          }
          
          let userData = null;

          // The passport-linkedin-oauth2 package might not properly fetch the profile from OpenID Connect endpoint
          // So we'll manually fetch the user info from the OpenID Connect endpoint
          try {
            console.log('Manually fetching user info from OpenID Connect endpoint');
            
            // Add retry mechanism for userinfo endpoint
            let userInfoResponse = null;
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
              try {
                userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000, // 10 second timeout
                  // Add proxy configuration to bypass potential network issues
                  proxy: false,
                  maxRedirects: 5,
                  validateStatus: status => status < 500, // Accept all status codes less than 500
                });
                
                // Check if response has the basic data we need
                if (!userInfoResponse.data || !userInfoResponse.data.sub) {
                  console.error('LinkedIn auth: Invalid response from userinfo endpoint:', 
                    JSON.stringify(userInfoResponse.data));
                  throw new Error('Invalid response from LinkedIn OpenID Connect endpoint');
                }
                
                break; // Success, exit the retry loop
              } catch (retryError) {
                retryCount++;
                console.log(`OpenID Connect endpoint call failed, attempt ${retryCount} of ${maxRetries + 1}`);
                if (retryCount > maxRetries) throw retryError;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
              }
            }
            
            console.log('LinkedIn OpenID profile data:', JSON.stringify(userInfoResponse.data));
            userData = userInfoResponse.data;
            
            // Check if userInfoResponse has basic required data
            if (!userData || !userData.sub) {
              console.error('LinkedIn auth: Missing required fields in userInfo response');
              throw new Error('Invalid profile data received from LinkedIn');
            }
            
            // Merge the OpenID Connect profile data with the original profile
            profile._json = userData;
            profile.id = userData.sub || profile.id;
            
            // Set email from OpenID Connect response
            if (userData.email) {
              profile.emails = [{ value: userData.email }];
            }
            
            // Set name from OpenID Connect response
            if (userData.given_name || userData.family_name) {
              profile.name = {
                givenName: userData.given_name || '',
                familyName: userData.family_name || ''
              };
              
              profile.displayName = `${userData.given_name || ''} ${userData.family_name || ''}`.trim();
            }
            
            // Set profile picture if available
            if (userData.picture) {
              profile.photos = [{ value: userData.picture }];
            }
          } catch (error) {
            console.error('Error fetching LinkedIn OpenID profile:');
            console.error('Error message:', error.message);
            if (error.response) {
              // The request was made and the server responded with a status code
              // that falls out of the range of 2xx
              console.error('Response data:', error.response.data);
              console.error('Response status:', error.response.status);
              console.error('Response headers:', error.response.headers);
            } else if (error.request) {
              // The request was made but no response was received
              console.error('No response received from LinkedIn API');
              console.error('Request details:', error.request);
            }
            
            // Try alternative approach: using LinkedIn V2 API directly if OpenID Connect fails
            try {
              console.log('Trying alternative LinkedIn API endpoint');
              // Get basic profile data
              const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              });
              
              console.log('LinkedIn V2 profile data:', JSON.stringify(profileResponse.data));
              
              // Get email address through a separate API call
              const emailResponse = await axios.get('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              });
              
              console.log('LinkedIn V2 email data:', JSON.stringify(emailResponse.data));
              
              // Extract the email and build the profile data
              const emailData = emailResponse.data;
              const v2ProfileData = profileResponse.data;
              
              // Build a profile similar to the OpenID Connect format
              userData = {
                sub: v2ProfileData.id,
                given_name: v2ProfileData.localizedFirstName,
                family_name: v2ProfileData.localizedLastName
              };
              
              // Extract email if available
              if (emailData && emailData.elements && emailData.elements.length > 0) {
                userData.email = emailData.elements[0]['handle~'].emailAddress;
              }
              
              profile._json = userData;
              profile.id = userData.sub;
              
              if (userData.email) {
                profile.emails = [{ value: userData.email }];
              }
              
              profile.name = {
                givenName: userData.given_name || '',
                familyName: userData.family_name || ''
              };
              
              profile.displayName = `${userData.given_name || ''} ${userData.family_name || ''}`.trim();
            } catch (v2Error) {
              console.error('Error with V2 API fallback:');
              console.error('Error message:', v2Error.message);
              
              if (v2Error.response) {
                console.error('Response data:', v2Error.response.data);
                console.error('Response status:', v2Error.response.status);
              }
              
              // If both OpenID Connect and V2 API attempts failed, check if we have enough data in the original profile
              if (!profile.id) {
                console.error('LinkedIn auth: No profile data available after all attempts');
                return done(new Error('Failed to fetch LinkedIn user profile'), false);
              }
              
              console.log('Continuing with original profile data');
            }
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
            // If no email is available, and this is a production environment,
            // still try to proceed with the authentication if we have enough other profile data
            if (!profile.id) {
              console.error('LinkedIn auth: No profile ID provided');
              return done(new Error('LinkedIn did not provide sufficient profile information.'), false);
            }
            
            console.warn('LinkedIn auth: No email provided, generating placeholder based on ID');
            email = `linkedin_${profile.id}@placeholder.scripe.com`;
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