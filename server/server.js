require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const claimsRoutes = require('./routes/claims');
const exportRoutes = require('./routes/export');
const sheetsRoutes = require('./routes/sheets');

const app = express();
const PORT = process.env.PORT || 3000;

// 資安防護 1: 隱藏 Express 標頭與設定安全 HTTP 標頭
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false, // 允許前端載入 Google Fonts 與內聯 SVG
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' } // 允許前端不同 port (如 5500 Live Server) 載入憑證圖片
  })
);

// 資安防護 2: CORS 設定 (允許本地跨網域除錯與 file 存取)
app.use(cors({ origin: true, credentials: true }));

// 資安防護 3: 請求速率限制 (防範暴力破解登入)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 300, // 放寬測試上限
  message: { success: false, message: '登入嘗試過於頻繁，請於 15 分鐘後再試' },
  standardHeaders: true,
  legacyHeaders: false
});


// 請求解析 (支援發票憑證圖片預覽上傳)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 靜態檔案託管
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../data/uploads')));


// 請求日誌紀錄 (方便排查登入連線)
app.use('/api/auth', (req, res, next) => {
  if (req.method === 'POST') {
    console.log(`[AUTH-LOG] ${new Date().toLocaleTimeString()} 收到登入請求: 帳號=${req.body ? req.body.username : '無'}`);
  }
  next();
});

// API 路由掛載
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/claims', claimsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/sheets', sheetsRoutes);

// 健康檢查與系統資訊 API (不洩漏後端敏感設定)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Petty Cash System',
    timestamp: new Date().toISOString()
  });
});

// SPA 前端路由回退處理
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 資安防護 4: 統一錯誤攔截處理 (杜絕後端伺服器內部堆疊資訊洩漏給客戶端)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: '系統處理請求時發生異常，請聯絡系統管理員'
  });
});

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`====================================================`);
    console.log(`✨ 每月零用金申請與核銷系統 已成功啟動！`);
    console.log(`🌐 系統首頁: http://localhost:${portToTry}`);
    console.log(`🔒 資安保護模式: 已啟用 (JWT + RBAC + Bcrypt + Helmet)`);
    console.log(`====================================================`);

    // 伺服器確認就緒後自動開啟瀏覽器 (避免提早開啟導致連線失敗)
    if (process.env.AUTO_OPEN !== 'false') {
      const { exec } = require('child_process');
      const cmd = process.platform === 'win32' ? `start http://localhost:${portToTry}` : `open http://localhost:${portToTry}`;
      exec(cmd, (err) => {
        if (err) console.log(`請手動開啟瀏覽器前往: http://localhost:${portToTry}`);
      });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`通訊埠 ${portToTry} 已被佔用，嘗試使用通訊埠 ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('伺服器啟動異常:', err);
    }
  });
}

startServer(PORT);

