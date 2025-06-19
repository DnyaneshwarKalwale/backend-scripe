/**
 * Test script to verify LinkedIn configuration
 * Run with: node scripts/test-linkedin-config.js
 */

require('dotenv').config();

console.log('Testing LinkedIn Environment Configuration');
console.log('==========================================');
console.log('');

// Check required environment variables
const requiredVars = [
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_CALLBACK_URL',
  'FRONTEND_URL'
];

const optionalVars = [
  'LINKEDIN_DIRECT_CALLBACK_URL',
  'BACKEND_URL'
];

let hasErrors = false;

// Check required variables
console.log('Checking required environment variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.log(`❌ ${varName} is missing`);
    hasErrors = true;
  } else {
    // Show first few characters for IDs and secrets
    if (varName.includes('CLIENT_ID') || varName.includes('CLIENT_SECRET')) {
      console.log(`✅ ${varName} is set to: ${value.substring(0, 4)}...`);
    } else {
      console.log(`✅ ${varName} is set to: ${value}`);
    }
  }
});

console.log('\nChecking optional environment variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.log(`⚠️ ${varName} is not set (optional)`);
  } else {
    console.log(`✅ ${varName} is set to: ${value}`);
  }
});

console.log('\nLinkedIn Auth URL Generation Test:');
try {
  // Regular callback URL
  const regularCallbackUrl = process.env.LINKEDIN_CALLBACK_URL;
  const regularLinkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(regularCallbackUrl)}&scope=openid%20profile%20email&state=test123`;
  
  console.log(`\nRegular LinkedIn Auth URL with passport strategy:`);
  console.log(regularLinkedinAuthUrl);
  
  // Direct callback URL
  const directCallbackUrl = process.env.LINKEDIN_DIRECT_CALLBACK_URL || 
    `${process.env.BACKEND_URL || 'https://api.brandout.ai'}/api/auth/linkedin-direct/callback`;
  
  const directLinkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(directCallbackUrl)}&scope=openid%20profile%20email&state=test123`;
  
  console.log(`\nDirect LinkedIn Auth URL:`);
  console.log(directLinkedinAuthUrl);
  
  console.log('\n✅ LinkedIn Auth URL generation successful');
} catch (error) {
  console.error('\n❌ LinkedIn Auth URL generation failed:', error.message);
  hasErrors = true;
}

if (hasErrors) {
  console.log('\n❌ Configuration check failed. Please fix the issues above.');
} else {
  console.log('\n✅ All LinkedIn configuration checks passed!');
  console.log('\nTo test LinkedIn authentication:');
  console.log('1. Start your backend server: npm run dev');
  console.log('2. Try the direct LinkedIn login from your frontend');
  console.log('3. Check server logs for any errors during the authentication process');
} 
//this is test script for linkedin config