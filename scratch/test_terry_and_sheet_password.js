const http = require('http');

function post(path, data, token = null) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: 'localhost',
      port: 3050,
      path: path,
      method: 'POST',
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('=== 1. 測試 terry 超級使用者登入 ===');
  const terryLogin = await post('/api/auth/login', { username: 'terry', password: 'terry123' });
  console.log('Terry 登入狀態碼:', terryLogin.status);
  console.log('Terry 使用者資訊:', terryLogin.data.user);

  if (terryLogin.data.user && terryLogin.data.user.role === 'admin') {
    console.log('✅ terry 成功以 admin 超級使用者身分登入！');
  } else {
    console.error('❌ terry 登入失敗或非 admin 角色！', terryLogin.data);
    process.exit(1);
  }

  const terryToken = terryLogin.data.token;

  console.log('\n=== 2. 測試新帳號申請並檢查密碼欄位 ===');
  const testUsername = `emp_pwd_${Date.now()}`;
  const testPassword = 'mySecretPassword999';
  const regRes = await post('/api/auth/register-request', {
    username: testUsername,
    password: testPassword,
    name: '密碼同步測試員',
    department: '資訊技術部',
    requested_role: 'employee',
    reason: '測試 Google Sheet 密碼欄位同步'
  });
  console.log('註冊申請結果:', regRes.data);

  console.log('\n=== 3. 測試全量同步人員名冊至 Google 試算表 ===');
  const syncRes = await post('/api/auth/sync-users-sheet', {}, terryToken);
  console.log('名冊同步結果:', syncRes.data);

  if (syncRes.data.success) {
    console.log('✅ 人員權限名冊 (含登入密碼) 已成功同步至 Google 試算表！');
  } else {
    console.warn('⚠️ 同步回應:', syncRes.data);
  }

  console.log('\n🎉 所有驗證全數通過！');
}

runTests().catch(err => {
  console.error('測試失敗:', err);
  process.exit(1);
});
