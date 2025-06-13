require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51QynHLKTFKZwTwxNXuoybI2Kzeu5wQjmcfRo8ooPESudzQetfJJUmd44SbCZWubziGw2GPXgPODDjJ6k4Xg8qEAb003nKKjj66');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set in environment variables');
}

module.exports = stripe; 