// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Get error status and message
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error for debugging
  console.error('Error:', {
    status: statusCode,
    message: message,
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    message: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Handle CORS preflight requests
const corsHandler = (req, res, next) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    return res.status(200).end();
  }
  next();
};

module.exports = {
  errorHandler,
  corsHandler
}; 