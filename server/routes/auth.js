const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const googleSheetService = require('../services/googleSheetService');

// 登入 API
// 登入 API (即時判斷最新 Google Sheet 上的人員權限與密碼)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '請輸入帳號與密碼'
      });
    }

    const cleanUsername = String(username).trim();
    let user = null;

    // 1. 即時向 Google Sheet 查詢最新名冊與密碼
    let sheetUser = null;
    try {
      sheetUser = await googleSheetService.fetchUserByUsernameFromSheet(cleanUsername);
    } catch (err) {
      console.warn('[AUTH-SHEET-WARN] 無法從 Google Sheet 即時抓取帳號:', err.message);
    }

    if (sheetUser) {
      // 檢查 Google Sheet 上的開通狀態
      if (sheetUser.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: '該帳號申請目前處於「待主管審核」狀態，請靜候超級管理者核准開通。'
        });
      }
      if (sheetUser.status === 'rejected') {
        return res.status(403).json({
          success: false,
          message: '該帳號在試算表名冊中已被駁回或停用，無法登入系統。'
        });
      }

      // 若 Google Sheet 該列有設定密碼，優先以 Google Sheet 最新密碼為準
      if (sheetUser.password) {
        if (String(password) === String(sheetUser.password)) {
          // 密碼完全正確！即時同步 Google Sheet 最新角色與密碼至本地資料庫
          user = db.syncOrUpsertUserFromSheet(sheetUser);
        } else {
          return res.status(401).json({
            success: false,
            message: '帳號或密碼錯誤 (已連動 Google 試算表最新密碼檢核)'
          });
        }
      } else {
        // Google Sheet 密碼欄若為空，fallback 驗證本地資料庫已有之 password_hash
        const localUser = db.findUserByUsername(cleanUsername);
        if (localUser && bcrypt.compareSync(password, localUser.password_hash)) {
          user = db.syncOrUpsertUserFromSheet({ ...sheetUser, password });
        } else {
          return res.status(401).json({
            success: false,
            message: '帳號或密碼錯誤'
          });
        }
      }
    } else {
      // 2. Google Sheet 尚未收錄或暫時斷網時，fallback 驗證本地資料庫
      user = db.findUserByUsername(cleanUsername);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: '帳號或密碼錯誤'
        });
      }

      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: '帳號或密碼錯誤'
        });
      }
    }

    // 簽發 JWT Token (效期 24 小時)
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 排除 password_hash
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      message: '登入成功',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      message: '伺服器錯誤，請稍後再試'
    });
  }
});

// 取得當前使用者資訊
router.get('/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: '找不到使用者' });
  }
  const { password_hash, ...safeUser } = user;
  res.json({
    success: true,
    user: safeUser
  });
});

// 提供快速測試帳號列表 (方便評估驗證三種角色之權限視角)
router.get('/demo-users', (req, res) => {
  const users = db.listUsers().map(u => ({
    username: u.username,
    name: u.name,
    role: u.role,
    department: u.department
  }));
  res.json({ success: true, users });
});

// 4. 提交帳號申請 (公開端點)
router.post('/register-request', (req, res) => {
  try {
    const { username, password, name, department } = req.body;
    const requested_role = req.body.requested_role || req.body.role || 'employee';
    const reason = req.body.reason || req.body.applyReason || '';

    if (!username || !password || !name) {
      return res.status(400).json({
        success: false,
        message: '請填寫完整帳號、密碼與真實姓名'
      });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: '帳號長度至少需 3 個字元'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: '密碼長度至少需 6 個字元'
      });
    }

    // 檢查是否已有相同帳號
    const existingUser = db.findUserByUsername(cleanUsername);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '該帳號名稱已被使用，請更換其他帳號'
      });
    }

    // 檢查是否有同名且審核中的申請
    const pendingApp = db.listUserApplications('pending').find(a => a.username.toLowerCase() === cleanUsername);
    if (pendingApp) {
      return res.status(400).json({
        success: false,
        message: '該帳號目前已提交審核中，請靜候超級管理者核准，無須重複申請'
      });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    const application = db.createUserApplication({
      username: cleanUsername,
      password_hash,
      plain_password: String(password),
      name: String(name).trim(),
      department: department ? String(department).trim() : '一般業務部',
      requested_role: ['employee', 'accountant'].includes(requested_role) ? requested_role : 'employee',
      reason: reason ? String(reason).trim() : ''
    });

    // 非同步同步至 Google Sheets 人員權限與帳號名冊 (不阻塞註冊回應)
    googleSheetService.syncUserApplication(application).catch(err => {
      console.warn('Google Sheet user registration sync notice:', err.message);
    });

    res.json({
      success: true,
      message: '🎉 帳號申請已成功送出！已排入審核名冊並同步至 Google 試算表，請靜候超級管理者(陳總監)審核開通。',
      application_id: application.id
    });
  } catch (err) {
    console.error('Register request error:', err);
    res.status(500).json({
      success: false,
      message: '提交申請失敗，請稍後再試: ' + err.message
    });
  }
});

// 5. 取得帳號申請名冊 (僅限超級管理者)
router.get('/applications', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '權限不足：僅超級使用者可審核帳號申請' });
    }

    const { status } = req.query;
    const applications = db.listUserApplications(status || 'all').map(app => {
      const { password_hash, ...safeApp } = app;
      return safeApp;
    });

    res.json({
      success: true,
      total: applications.length,
      applications
    });
  } catch (err) {
    console.error('List applications error:', err);
    res.status(500).json({ success: false, message: '讀取申請名冊失敗' });
  }
});

// 6. 審核帳號申請 (核准開通或拒絕，僅限超級管理者)
router.patch('/applications/:id/review', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '權限不足：僅超級使用者可審核帳號申請' });
    }

    const { id } = req.params;
    const { action, assigned_role, reject_reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '無效的審核動作' });
    }

    const result = db.reviewUserApplication(id, {
      action,
      reviewer: req.user,
      assigned_role,
      reject_reason
    });

    if (!result) {
      return res.status(404).json({ success: false, message: '找不到該筆帳號申請或已完成審核' });
    }

    // 非同步同步更新至 Google Sheets 人員權限名冊
    googleSheetService.syncUserApplication(result.application).catch(err => {
      console.warn('Google Sheet user review sync notice:', err.message);
    });

    if (action === 'approve') {
      const { password_hash, ...safeUser } = result.user;
      res.json({
        success: true,
        message: `✅ 已成功核准開通帳號【${result.application.username}】！該同仁現在已可正常登入系統。`,
        user: safeUser
      });
    } else {
      res.json({
        success: true,
        message: `已退回帳號【${result.application.username}】之申請。`
      });
    }
  } catch (err) {
    console.error('Review application error:', err);
    res.status(500).json({ success: false, message: '審核操作失敗: ' + err.message });
  }
});

// 7. 手動全量同步人員權限名冊至 Google 試算表 (僅限超級管理者)
router.post('/sync-users-sheet', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '權限不足：僅超級使用者可執行人員名冊同步' });
    }

    const result = await googleSheetService.syncAllUsersToSheet();
    res.json({
      success: true,
      message: `🎉 人員權限名冊已成功同步至 Google 試算表 (共更新 ${result.synced_count} 筆同仁紀錄)！`,
      result
    });
  } catch (err) {
    console.error('Sync users sheet error:', err);
    res.status(500).json({
      success: false,
      message: '同步人員權限名冊失敗: ' + err.message
    });
  }
});

module.exports = router;
