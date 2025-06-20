require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set in environment variables');
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
module.exports = stripe; 