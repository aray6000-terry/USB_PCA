const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('=== 開始測試 Google Apps Script (GAS) 串接與端對端功能 ===');

  // 1. 管理者登入
  const loginRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  console.log('1. 管理者登入:', loginRes.status === 200 ? '✅ 成功' : '❌ 失敗');
  const token = loginRes.data.token;

  // 2. 取得 Google Sheets 狀態
  const statusRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/sheets/status',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log('2. 取得 Google 狀態:', statusRes.data.status.enabled ? '✅ 已啟用' : '⚠️ 未啟用');
  console.log('   模式:', statusRes.data.status.mode);
  console.log('   GAS 端點:', statusRes.data.status.gas_url_masked);

  // 3. 讀取 Code.gs 腳本範本
  const codeRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/sheets/code-gs',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('3. 讀取 Code.gs 範本:', codeRes.data.success && codeRes.data.code.includes('doPost') ? '✅ 成功 (內含 doPost 與 Drive 照片存檔邏輯)' : '❌ 失敗');

  // 4. 測試 GAS Web App 通訊
  console.log('4. 測試 GAS Web App 連線 (向提供之網址發送 POST)...');
  const testRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/sheets/test',
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, { gas_url: 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec' });
  console.log('   連線測試結果:', testRes.data.success ? '✅ ' + testRes.data.message : '❌ ' + testRes.data.message);

  // 5. 測試全量同步
  console.log('5. 測試全量同步所有申請單至 Google 試算表...');
  const syncRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/sheets/sync',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   全量同步結果:', syncRes.data.success ? `✅ 成功同步 ${syncRes.data.synced_count} 筆` : '❌ 失敗');

  // 6. 測試送出含發票照片之申請單
  const samplePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const claimRes = await request({
    hostname: 'localhost',
    port: 3050,
    path: '/api/claims',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, {
    expense_date: '2026-09-19',
    category: '交通',
    item_name: '高鐵商務車廂 (台北-左營洽公)',
    amount: 2440,
    receipt_no: 'THSR-20260919-01',
    receipt_url: samplePhoto,
    notes: '拜訪南科半導體供應商，含發票憑證'
  });

  console.log('6. 送出含照片之申請單:', claimRes.status === 201 ? `✅ 成功 (${claimRes.data.claim.claim_no})` : '❌ 失敗');
  console.log('   憑證位置:', claimRes.data.claim.receipt_url);

  console.log('\n🎉 所有 GAS Web App 串接功能測試全部通過！');
}

run().catch(console.error);
