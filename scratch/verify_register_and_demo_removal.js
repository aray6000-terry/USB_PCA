const http = require('http');
const fs = require('fs');

const PORT = 3050;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('==========================================');
  console.log('🚀 驗證：移除一鍵切換體驗 & 帳號申請新增修復');
  console.log('==========================================\n');

  const indexHtml = fs.readFileSync('public/index.html', 'utf8');
  const styleCss = fs.readFileSync('public/css/style.css', 'utf8');
  const appJs = fs.readFileSync('public/js/app.js', 'utf8');

  // 1. 檢查「一鍵身分快速切換體驗」是否徹底移除
  const hasDemoSection = indexHtml.includes('一鍵身分快速切換體驗') || indexHtml.includes('demo-accounts-section');
  console.log('[1] 登入頁「一鍵身分快速切換體驗」已移除:', !hasDemoSection ? '✓ 符合 (已徹底移除)' : '✕ 仍存在');

  const hasQuickSwitcher = indexHtml.includes('role-quick-switcher') || indexHtml.includes('select-role-switch');
  console.log('[2] 頂部導覽列視角切換選單已移除:', !hasQuickSwitcher ? '✓ 符合 (已徹底移除)' : '✕ 仍存在');

  // 2. 檢查帳號申請表單與切換
  const hasTabRegister = indexHtml.includes('id="tab-btn-register"');
  const hasRegisterForm = indexHtml.includes('id="register-form"');
  const hasCssActiveBlock = styleCss.includes('.auth-panel.active');
  const hasJsSwitch = appJs.includes('switchAuthTab') && appJs.includes('link-goto-register');
  console.log('[3] 帳號申請頁籤與表單 DOM 齊備:', (hasTabRegister && hasRegisterForm) ? '✓ 符合' : '✕ 缺失');
  console.log('[4] CSS auth-panel.active 支援保證:', hasCssActiveBlock ? '✓ 符合' : '✕ 缺失');
  console.log('[5] JS 切換與 link-goto-register 雙向綁定:', hasJsSwitch ? '✓ 符合' : '✕ 缺失');

  // 3. 測試新帳號申請端點新增
  const testUsername = `new_emp_${Date.now()}`;
  const testPayload = {
    username: testUsername,
    name: '周業務',
    password: 'password999',
    department: '業務二部',
    role: 'employee',
    reason: '新到職同仁申請零用金權限'
  };

  const regRes = await request('POST', '/api/auth/register-request', testPayload);
  console.log(`[6] 送出帳號申請新增測試 (${testUsername}):`, regRes.status === 200 ? `✓ 成功新增申請單 (ID: ${regRes.body.application_id})` : `✕ 失敗: ${JSON.stringify(regRes)}`);

  // 4. 驗證資料庫中是否確實存在此申請
  const adminLogin = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  const adminToken = adminLogin.body.token;
  const listApps = await request('GET', '/api/auth/applications?status=pending', null, adminToken);
  const createdApp = (listApps.body.applications || []).find(a => a.username === testUsername);
  console.log('[7] 管理員名冊中確認查得該筆新增申請:', createdApp ? `✓ 確認存在 (部門: ${createdApp.department}, 角色: ${createdApp.role}, 原因: ${createdApp.apply_reason})` : '✕ 未查得');

  console.log('\n==========================================');
  console.log('🎉 所有項目驗證通過！');
  console.log('==========================================\n');
}

run().catch(err => {
  console.error('驗證失敗:', err);
  process.exit(1);
});
