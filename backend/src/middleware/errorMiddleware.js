// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Add CORS headers to all error responses
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'https://app.brandout.ai');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

  // Log the error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    status: err.status
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};

module.exports = { errorHandler }; 