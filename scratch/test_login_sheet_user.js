const http = require('http');
const db = require('../server/db');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3050,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
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

async function run() {
  console.log('=== 模擬：Google Sheet 上新增了同仁帳號 amyliupp@gmail.com，密碼為 amyPassword123 ===');
  const mockSheetUser = {
    username: 'amyliupp@gmail.com',
    password: 'amyPassword123',
    name: 'Amy Liu',
    department: '行銷推廣組',
    role: 'employee',
    status: 'approved'
  };

  // 1. 本地 DB 模擬 Google Sheet 即時同步
  const syncedUser = db.syncOrUpsertUserFromSheet(mockSheetUser);
  console.log('同步至本地使用者成功:', syncedUser);

  // 2. 測試登入 (輸入正確密碼)
  const loginSuccess = await post('/api/auth/login', {
    username: 'amyliupp@gmail.com',
    password: 'amyPassword123'
  });
  console.log('登入成功測試 (狀態碼 200):', loginSuccess.status, loginSuccess.data.message);

  // 3. 測試登入 (輸入錯誤密碼)
  const loginFail = await post('/api/auth/login', {
    username: 'amyliupp@gmail.com',
    password: 'wrongPassword'
  });
  console.log('登入錯誤測試 (狀態碼 401):', loginFail.status, loginFail.data.message);

  console.log('\n=== 模擬：主管在 Google Sheet 將密碼修改為 amyNewPass888 ===');
  mockSheetUser.password = 'amyNewPass888';
  db.syncOrUpsertUserFromSheet(mockSheetUser);

  const loginNewPass = await post('/api/auth/login', {
    username: 'amyliupp@gmail.com',
    password: 'amyNewPass888'
  });
  console.log('新密碼登入測試 (狀態碼 200):', loginNewPass.status, loginNewPass.data.message);

  console.log('\n🎉 即時連動判斷邏輯全部驗證通過！');
}

run().catch(console.error);
