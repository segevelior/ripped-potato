const adminAuth = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Check if user has admin or superAdmin role
  if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};

module.exports = { adminAuth };