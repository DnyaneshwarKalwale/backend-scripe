const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id field
 * @param {string} secret - JWT secret key
 * @param {string} expiresIn - Token expiration time (e.g. '30d')
 * @returns {string} JWT token
 */
const generateToken = (user, secret = process.env.JWT_SECRET, expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(
    { id: user._id || user.id },
    secret,
    { expiresIn }
  );
};

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret key
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret);
};

/**
 * Decode a JWT token without verification
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken
}; 