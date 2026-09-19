const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'petty_cash_secure_jwt_secret_token_987654321';

// 驗證 JWT Token 中介軟體
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '請先登入系統（未提供驗證權杖）'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: '權杖已過期或無效，請重新登入'
      });
    }

    const user = db.findUserById(decoded.id);
    if (!user) {
      return res.status(403).json({
        success: false,
        message: '使用者不存在或已停用'
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department
    };
    next();
  });
}

// 角色授權中介軟體 (RBAC)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未通過身分驗證' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `權限不足：您目前的身份 (${formatRole(req.user.role)}) 無法執行此項操作`
      });
    }
    next();
  };
}

function formatRole(role) {
  switch (role) {
    case 'admin': return '超級使用者';
    case 'accountant': return '會計人員';
    case 'employee': return '一般同仁';
    default: return role;
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  formatRole,
  JWT_SECRET
};
