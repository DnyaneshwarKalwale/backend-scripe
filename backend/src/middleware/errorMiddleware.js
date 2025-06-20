// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Always send CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Origin');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Log the error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    status: err.status,
    origin: req.headers.origin,
    method: req.method,
    path: req.path
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

  if (err.name === 'CORSError') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      error: err.message
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};

module.exports = { errorHandler }; 