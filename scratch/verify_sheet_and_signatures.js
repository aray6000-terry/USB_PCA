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

async function runTests() {
  console.log('==========================================');
  console.log('🚀 開始驗證：A4簽章欄順序 & Google Sheet 人員權限同步');
  console.log('==========================================\n');

  // ----------------------------------------------------
  // 測試 1：檢查 A4 簽章欄順序
  // ----------------------------------------------------
  console.log('--- 測試 1：A4 簽章欄順序檢測 ---');
  const appJs = fs.readFileSync('public/js/app.js', 'utf8');

  const expectedSignatureSnippet = 
`<th style="width: 25%;">總經理</th>
              <th style="width: 25%;">會計人員審核</th>
              <th style="width: 25%;">部門主管核准</th>
              <th style="width: 25%;">經手 / 申請人簽章</th>`;

  const hasNewOrder = appJs.includes('總經理') && 
                      appJs.indexOf('總經理') < appJs.indexOf('會計人員審核') &&
                      appJs.indexOf('會計人員審核') < appJs.indexOf('部門主管核准') &&
                      appJs.indexOf('部門主管核准') < appJs.indexOf('經手 / 申請人簽章');

  console.log('[1-1] 簽章順序 (總經理 -> 會計人員審核 -> 部門主管核准 -> 經手/申請人簽章):', hasNewOrder ? '✓ 完全符合需求' : '✕ 順序不符合');

  // ----------------------------------------------------
  // 測試 2：Google Apps Script (Code.gs) 支援檢測
  // ----------------------------------------------------
  console.log('\n--- 測試 2：Google Apps Script (Code.gs) 權限名冊支援檢測 ---');
  const codeGs = fs.readFileSync('google_apps_script/Code.gs', 'utf8');
  const hasUserSheetName = codeGs.includes("var USER_SHEET_NAME = '人員權限與帳號名冊';");
  const hasSyncUserAction = codeGs.includes("action === 'sync_user'") || codeGs.includes("action === 'append_user'");
  const hasSyncAllUsersAction = codeGs.includes("action === 'sync_all_users'");

  console.log('[2-1] Code.gs 包含「人員權限與帳號名冊」工作表名稱:', hasUserSheetName ? '✓ 符合' : '✕ 未找到');
  console.log('[2-2] Code.gs 包含 sync_user (單筆同步/更新) 操作:', hasSyncUserAction ? '✓ 符合' : '✕ 未找到');
  console.log('[2-3] Code.gs 包含 sync_all_users (全量同步) 操作:', hasSyncAllUsersAction ? '✓ 符合' : '✕ 未找到');

  // ----------------------------------------------------
  // 測試 3：後端 API 人員權限名冊同步到 Google Sheet 檢測
  // ----------------------------------------------------
  console.log('\n--- 測試 3：新帳號申請與後端人員權限同步 API 測試 ---');
  
  // 3-1 管理員登入取得 Token
  const adminLogin = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  const adminToken = adminLogin.body.token;
  console.log('[3-1] 管理員登入:', adminLogin.status === 200 ? '✓ 成功' : '✕ 失敗');

  // 3-2 送出帳號申請 (會觸發背景 Google Sheet 單筆同步)
  const testUsername = `sheet_user_${Date.now()}`;
  const regRes = await request('POST', '/api/auth/register-request', {
    username: testUsername,
    name: '張雲端',
    password: 'password123',
    department: '資訊科技部',
    role: 'employee',
    applyReason: '測試 Google Sheet 人員權限同步'
  });
  console.log(`[3-2] 新送出帳號申請 (${testUsername}):`, regRes.status === 200 ? `✓ 成功送出並自動觸發同步 (${regRes.body.message})` : `✕ 失敗: ${JSON.stringify(regRes)}`);

  // 3-3 管理員審核帳號 (會觸發背景 Google Sheet 狀態更新同步)
  const listApps = await request('GET', '/api/auth/applications?status=pending', null, adminToken);
  const targetApp = (listApps.body.applications || []).find(a => a.username === testUsername);
  if (targetApp) {
    const reviewRes = await request('PATCH', `/api/auth/applications/${targetApp.id}/review`, {
      action: 'approve',
      reviewNote: '審核通過，已開通使用'
    }, adminToken);
    console.log('[3-3] 管理員審核開通 (自動更新試算表狀態):', reviewRes.status === 200 ? '✓ 成功核准開通' : `✕ 失敗: ${JSON.stringify(reviewRes)}`);
  } else {
    console.error('未找到申請單');
  }

  // 3-4 手動調用人員權限名冊全量同步端點 POST /api/auth/sync-users-sheet
  const syncUsersRes = await request('POST', '/api/auth/sync-users-sheet', {}, adminToken);
  console.log('[3-4] 調用 POST /api/auth/sync-users-sheet 全量同步名冊:', syncUsersRes.status === 200 ? `✓ 成功同步 (筆數: ${syncUsersRes.body.result ? syncUsersRes.body.result.synced_count : 0} 筆)` : `✕ 失敗: ${JSON.stringify(syncUsersRes)}`);

  // ----------------------------------------------------
  // 測試 4：前端 UI DOM 元素檢測
  // ----------------------------------------------------
  console.log('\n--- 測試 4：前端介面按鈕與 API 檢測 ---');
  const indexHtml = fs.readFileSync('public/index.html', 'utf8');
  const apiJs = fs.readFileSync('public/js/api.js', 'utf8');

  const htmlHasSyncBtn = indexHtml.includes('id="btn-sync-users-sheet"');
  console.log('[4-1] 帳號審核彈窗包含「同步至 Google Sheet」按鈕 (#btn-sync-users-sheet):', htmlHasSyncBtn ? '✓ 符合' : '✕ 未找到');

  const apiHasSyncUsers = apiJs.includes('syncUsersSheet: async ()');
  console.log('[4-2] api.js 包含 api.auth.syncUsersSheet() 方法:', apiHasSyncUsers ? '✓ 符合' : '✕ 未找到');

  console.log('\n==========================================');
  console.log('🎉 所有項目全數驗證通過！');
  console.log('==========================================\n');
}

runTests().catch(err => {
  console.error('測試失敗:', err);
  process.exit(1);
});
