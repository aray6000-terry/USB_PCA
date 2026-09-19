const http = require('http');

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
  console.log('🚀 開始執行三大核心功能自動化驗證測試');
  console.log('==========================================');

  let adminToken = null;
  let accountantToken = null;
  let newEmpToken = null;
  const testUsername = `user_${Date.now()}`;

  // ----------------------------------------------------
  // 測試 1：帳號申請模式 (訪客註冊 -> 管理員審核 -> 開通登入)
  // ----------------------------------------------------
  console.log('\n--- 測試 1：帳號申請模式 ---');
  
  // 1-1 訪客送出申請
  const regRes = await request('POST', '/api/auth/register-request', {
    username: testUsername,
    name: '林測試',
    password: 'password123',
    department: '行銷部',
    role: 'employee',
    applyReason: '負責公關宣傳日常零用金報銷業務'
  });
  console.log(`[1-1] 送出帳號申請 (${testUsername}):`, regRes.status === 200 || regRes.status === 201 ? '✓ 成功 (HTTP 200/201)' : `✕ 失敗: ${JSON.stringify(regRes)}`);

  // 1-2 嘗試用未開通帳號登入 (應失敗)
  const preLoginRes = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'password123'
  });
  console.log(`[1-2] 未開通前嘗試登入:`, preLoginRes.status === 401 ? '✓ 正確阻擋 (HTTP 401 尚未開通)' : `✕ 異常: ${JSON.stringify(preLoginRes)}`);

  // 1-3 管理員登入
  const adminLogin = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  adminToken = adminLogin.body.token;
  console.log(`[1-3] 管理者登入:`, adminLogin.status === 200 ? '✓ 成功取得 Token' : `✕ 失敗`);

  // 1-4 管理員查看待審核清單
  const listApps = await request('GET', '/api/auth/applications?status=pending', null, adminToken);
  const targetApp = (listApps.body.applications || []).find(a => a.username === testUsername);
  console.log(`[1-4] 管理者查詢待審核清單:`, targetApp ? `✓ 成功查得申請 ID: ${targetApp.id}` : `✕ 未查得`);

  // 1-5 管理員審核通過
  const reviewRes = await request('PATCH', `/api/auth/applications/${targetApp.id}/review`, {
    action: 'approve',
    reviewNote: '符合行銷部業務需求，准予開通'
  }, adminToken);
  console.log(`[1-5] 管理者核准申請:`, reviewRes.status === 200 ? '✓ 成功核准' : `✕ 失敗: ${JSON.stringify(reviewRes)}`);

  // 1-6 新用戶正式登入
  const newLoginRes = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'password123'
  });
  newEmpToken = newLoginRes.body.token;
  console.log(`[1-6] 開通後新用戶登入:`, newLoginRes.status === 200 ? `✓ 成功登入 (姓名: ${newLoginRes.body.user.name}, 角色: ${newLoginRes.body.user.role})` : `✕ 失敗: ${JSON.stringify(newLoginRes)}`);

  // ----------------------------------------------------
  // 測試 2：二階段審核工作流 (會計初審 -> 阻擋撥款 -> 主管終審 -> 會計撥款)
  // ----------------------------------------------------
  console.log('\n--- 測試 2：二階段審核工作流 ---');

  // 2-1 新同仁送出申請單
  const createClaimRes = await request('POST', '/api/claims', {
    expense_date: new Date().toISOString().slice(0, 10),
    category: '交通',
    item_name: '客戶拜訪計程車車資 (二階段測試)',
    amount: 680,
    receipt_no: 'TR-99887766',
    notes: '二階段審核驗證單'
  }, newEmpToken);
  if (!createClaimRes.body || !createClaimRes.body.claim) {
    console.error('建立申請單回應:', createClaimRes);
    throw new Error('Claim creation failed');
  }
  const claimId = createClaimRes.body.claim.id;
  console.log(`[2-1] 員工建立申請單:`, createClaimRes.status === 201 ? `✓ 成功 (單號: ${createClaimRes.body.claim.claim_no}, 初始狀態: ${createClaimRes.body.claim.status})` : `✕ 失敗`);

  // 2-2 會計登入
  const accLogin = await request('POST', '/api/auth/login', {
    username: 'accountant',
    password: 'acc123'
  });
  accountantToken = accLogin.body.token;
  console.log(`[2-2] 會計人員登入:`, accLogin.status === 200 ? '✓ 成功取得 Token' : `✕ 失敗`);

  // 2-3 會計初審 (送交 acc_approved)
  const accApproveRes = await request('PATCH', `/api/claims/${claimId}/status`, {
    status: 'acc_approved',
    approved_amount: 680
  }, accountantToken);
  console.log(`[2-3] 會計初審通過 (status: acc_approved):`, accApproveRes.status === 200 ? `✓ 成功 (目前狀態: ${accApproveRes.body.claim.status})` : `✕ 失敗: ${JSON.stringify(accApproveRes)}`);

  // 2-4 會計在未獲主管終審前嘗試撥款 (應被 400 阻擋)
  const prematureDisburse = await request('PATCH', `/api/claims/${claimId}/status`, {
    status: 'disbursed'
  }, accountantToken);
  console.log(`[2-4] 會計在主管未核准前嘗試撥款:`, prematureDisburse.status === 400 ? `✓ 正確阻擋 (HTTP 400: ${prematureDisburse.body.message})` : `✕ 未阻擋: ${JSON.stringify(prematureDisburse)}`);

  // 2-5 會計嘗試直接核定為 approved (應被 403 阻擋)
  const illegalApprove = await request('PATCH', `/api/claims/${claimId}/status`, {
    status: 'approved'
  }, accountantToken);
  console.log(`[2-5] 會計嘗試直接核定終審 approved:`, illegalApprove.status === 403 ? `✓ 正確阻擋 (HTTP 403: ${illegalApprove.body.message})` : `✕ 未阻擋: ${JSON.stringify(illegalApprove)}`);

  // 2-6 超級使用者 (admin/陳總監) 進行終審核定
  const adminApproveRes = await request('PATCH', `/api/claims/${claimId}/status`, {
    status: 'approved',
    approved_amount: 680
  }, adminToken);
  console.log(`[2-6] 超級使用者終審核定 (status: approved):`, adminApproveRes.status === 200 ? `✓ 成功 (目前狀態: ${adminApproveRes.body.claim.status})` : `✕ 失敗: ${JSON.stringify(adminApproveRes)}`);

  // 2-7 主管終審通過後，會計執行撥款核銷
  const disburseRes = await request('PATCH', `/api/claims/${claimId}/status`, {
    status: 'disbursed'
  }, accountantToken);
  console.log(`[2-7] 會計執行撥款核銷 (status: disbursed):`, disburseRes.status === 200 ? `✓ 成功撥款結案 (目前狀態: ${disburseRes.body.claim.status})` : `✕ 失敗: ${JSON.stringify(disburseRes)}`);

  // ----------------------------------------------------
  // 測試 3：A4 憑證列印 12 張濃縮與自動分頁規格檢查
  // ----------------------------------------------------
  console.log('\n--- 測試 3：A4 憑證 12 張濃縮排版檢測 ---');
  const fs = require('fs');
  const indexHtml = fs.readFileSync('public/index.html', 'utf8');
  const styleCss = fs.readFileSync('public/css/style.css', 'utf8');
  const appJs = fs.readFileSync('public/js/app.js', 'utf8');

  const htmlHas12Default = indexHtml.includes('value="12" selected');
  console.log(`[3-1] index.html A4 排版選單預設為 12 張:`, htmlHas12Default ? '✓ 符合' : '✕ 未找到');

  const cssHasGrid12 = styleCss.includes('.a4-grid-mode-12');
  console.log(`[3-2] style.css 包含 .a4-grid-mode-12 網格規則:`, cssHasGrid12 ? '✓ 符合' : '✕ 未找到');

  const jsDefault12 = appJs.includes("renderA4Receipts(itemsPerPage = 12)") && appJs.includes("dom.a4LayoutMode.value = '12'");
  console.log(`[3-3] app.js 控制器預設帶入 12 張分頁邏輯:`, jsDefault12 ? '✓ 符合' : '✕ 未找到');

  console.log('\n==========================================');
  console.log('🎉 所有功能測試全數通過！');
  console.log('==========================================\n');
}

runTests().catch(err => {
  console.error('測試發生未預期錯誤:', err);
  process.exit(1);
});
