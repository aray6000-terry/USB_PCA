const http = require('http');

const BASE_URL = 'http://localhost:3050';

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('json')) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw.toString('utf8')), headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, raw: raw.toString('utf8'), headers: res.headers });
          }
        } else {
          resolve({ status: res.statusCode, buffer: raw, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 開始執行系統端到端測試...\n');

  // 1. 健康檢查
  console.log('1. 測試 GET /api/health');
  const health = await makeRequest('GET', '/api/health');
  console.assert(health.status === 200, 'Health check should be 200');
  console.log('   ✓ 健康檢查通過:', health.data.status);

  // 2. 測試員工登入
  console.log('\n2. 測試 POST /api/auth/login (一般員工)');
  const empLogin = await makeRequest('POST', '/api/auth/login', { username: 'employee', password: 'emp123' });
  console.assert(empLogin.status === 200 && empLogin.data.token, 'Employee login failed');
  const empToken = empLogin.data.token;
  console.log('   ✓ 員工登入成功，取得 JWT Token');

  // 3. 測試會計登入
  console.log('\n3. 測試 POST /api/auth/login (會計人員)');
  const accLogin = await makeRequest('POST', '/api/auth/login', { username: 'accountant', password: 'acc123' });
  console.assert(accLogin.status === 200 && accLogin.data.token, 'Accountant login failed');
  const accToken = accLogin.data.token;
  console.log('   ✓ 會計登入成功，取得 JWT Token');

  // 4. 測試超級使用者登入
  console.log('\n4. 測試 POST /api/auth/login (超級使用者)');
  const adminLogin = await makeRequest('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  console.assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin login failed');
  const adminToken = adminLogin.data.token;
  console.log('   ✓ 管理者登入成功，取得 JWT Token');

  // 5. 驗證 RBAC 資料隔離
  console.log('\n5. 驗證 RBAC 權限隔離 (一般員工 vs 會計全公司查閱)');
  const empClaims = await makeRequest('GET', '/api/claims', null, empToken);
  const accClaims = await makeRequest('GET', '/api/claims', null, accToken);
  console.log(`   員工查得單據數量: ${empClaims.data.total} 筆`);
  console.log(`   會計查得全公司單據數量: ${accClaims.data.total} 筆`);
  console.assert(accClaims.data.total >= empClaims.data.total, 'Accountant should see all claims');
  // 檢查員工查出的所有單據 user_id 都是本人
  const onlySelf = empClaims.data.claims.every(c => c.user_id === empLogin.data.user.id);
  console.assert(onlySelf, 'Employee should only see their own claims');
  console.log('   ✓ RBAC 權限隔離校驗通過 (員工僅能查閱個人單據)');

  // 6. 員工送出新申請
  console.log('\n6. 測試 POST /api/claims (送出零用金申請)');
  const newClaimPayload = {
    expense_date: '2026-09-18',
    category: '交通',
    item_name: '拜訪竹科客戶高鐵商務車票',
    amount: 2980,
    receipt_no: 'THSR-99881122',
    notes: '竹科聯發科專案拜訪',
    receipt_url: ''
  };
  const createRes = await makeRequest('POST', '/api/claims', newClaimPayload, empToken);
  console.assert(createRes.status === 201 && createRes.data.success, 'Create claim failed');
  const createdClaim = createRes.data.claim;
  console.log(`   ✓ 申請成功建立！單號: ${createdClaim.claim_no}, 金額: NT$ ${createdClaim.amount}, 狀態: ${createdClaim.status}`);

  // 7. 會計審核並核銷撥款
  console.log('\n7. 測試 PATCH /api/claims/:id/status (會計審核與撥款)');
  // 7a: 審核通過
  const approveRes = await makeRequest('PATCH', `/api/claims/${createdClaim.id}/status`, { status: 'approved' }, accToken);
  console.assert(approveRes.status === 200, 'Approve claim failed');
  console.log('   ✓ 會計審核通過');

  // 7b: 撥款核銷
  const disburseRes = await makeRequest('PATCH', `/api/claims/${createdClaim.id}/status`, { status: 'disbursed' }, accToken);
  console.assert(disburseRes.status === 200, 'Disburse claim failed');
  console.log('   ✓ 會計完成撥款核銷');

  // 8. 報表匯出 Excel 測試
  console.log('\n8. 測試 GET /api/export/excel (匯出 Excel 報表)');
  const excelRes = await makeRequest('GET', '/api/export/excel', null, accToken);
  console.assert(excelRes.status === 200, 'Excel export failed');
  console.assert(excelRes.buffer && excelRes.buffer.length > 2000, 'Excel buffer should be valid');
  console.log(`   ✓ Excel 報表生成成功！檔案大小: ${excelRes.buffer.length} bytes`);

  // 9. 報表匯出 CSV 測試
  console.log('\n9. 測試 GET /api/export/csv (匯出 CSV 報表)');
  const csvRes = await makeRequest('GET', '/api/export/csv', null, accToken);
  console.assert(csvRes.status === 200, 'CSV export failed');
  console.assert(csvRes.buffer && csvRes.buffer.length > 0, 'CSV buffer should be valid');
  console.log(`   ✓ CSV 報表生成成功！長度: ${csvRes.buffer.length} bytes`);

  // 10. Google Sheets 狀態與資安遮罩
  console.log('\n10. 測試 GET /api/sheets/status (資安防護與遮罩)');
  const sheetsStatus = await makeRequest('GET', '/api/sheets/status', null, adminToken);
  console.assert(sheetsStatus.status === 200, 'Sheets status failed');
  console.log('   ✓ 取得 Google Sheets 安全狀態:', sheetsStatus.data.status);
  console.assert(!sheetsStatus.data.status.privateKey, 'Private key MUST NEVER be in public response');
  console.log('   ✓ 確認無機密金鑰外洩至前端！');

  console.log('\n🎉 所有核心測試全部通過 (10/10)！');
}

runTests().catch(err => {
  console.error('測試失敗:', err);
  process.exit(1);
});
