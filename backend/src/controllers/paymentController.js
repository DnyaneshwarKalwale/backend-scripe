const PaymentTransaction = require('../models/paymentTransactionModel');
const { isAdmin } = require('../middleware/authMiddleware');

// @desc    Get user's payment transaction history
// @route   GET /api/payments/history
// @access  Private
exports.getUserPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = -1 } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Create sort object
    const sort = {};
    sort[sortBy] = parseInt(sortOrder);
    
    // Find transactions for user
    const transactions = await PaymentTransaction.find({ userId })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await PaymentTransaction.countDocuments({ userId });
    
    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment history'
    });
  }
};

// @desc    Get payment transaction details by ID
// @route   GET /api/payments/:transactionId
// @access  Private
exports.getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;
    
    // Find the transaction
    const transaction = await PaymentTransaction.findOne({ 
      transactionId,
      // Only allow access to transaction if it belongs to the user or user is admin
      ...(req.user.role !== 'admin' && { userId })
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction details'
    });
  }
};

// @desc    Get all payment transactions (admin only)
// @route   GET /api/payments/admin/all
// @access  Private/Admin
exports.getAllTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt', 
      sortOrder = -1,
      userId,
      paymentType,
      paymentStatus,
      startDate,
      endDate
    } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Create sort object
    const sort = {};
    sort[sortBy] = parseInt(sortOrder);
    
    // Build filter object
    const filter = {};
    
    if (userId) filter.userId = userId;
    if (paymentType) filter.paymentType = paymentType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    
    // Add date range filter if provided
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        // Add one day to include the full end date
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        filter.createdAt.$lte = endDateObj;
      }
    }
    
    // Find transactions with filters
    const transactions = await PaymentTransaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await PaymentTransaction.countDocuments(filter);
    
    // Get summary stats
    const stats = await PaymentTransaction.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }}
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCount / parseInt(limit))
        },
        stats: stats.length > 0 ? stats[0] : {
          totalAmount: 0,
          count: 0,
          avgAmount: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions'
    });
  }
};

// @desc    Get user spending summary
// @route   GET /api/payments/summary
// @access  Private
exports.getUserSpendingSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get overall spending statistics
    const overall = await PaymentTransaction.aggregate([
      { $match: { userId, paymentStatus: 'completed' } },
      { $group: {
        _id: null,
        totalSpent: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
        firstPurchase: { $min: '$createdAt' },
        lastPurchase: { $max: '$createdAt' }
      }}
    ]);
    
    // Get spending by category/type
    const byType = await PaymentTransaction.aggregate([
      { $match: { userId, paymentStatus: 'completed' } },
      { $group: {
        _id: '$paymentType',
        totalSpent: { $sum: '$amount' },
        count: { $sum: 1 }
      }},
      { $sort: { totalSpent: -1 } }
    ]);
    
    // Get monthly spending for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlySpending = await PaymentTransaction.aggregate([
      { 
        $match: { 
          userId, 
          paymentStatus: 'completed',
          createdAt: { $gte: sixMonthsAgo }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalSpent: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        overall: overall.length > 0 ? overall[0] : {
          totalSpent: 0,
          transactionCount: 0
        },
        byType,
        monthlySpending
      }
    });
  } catch (error) {
    console.error('Error fetching spending summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve spending summary'
    });
  }
}; 