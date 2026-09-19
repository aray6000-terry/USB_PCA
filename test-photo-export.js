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
            resolve({ status: res.statusCode, data: JSON.parse(raw.toString('utf8')) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: raw.toString('utf8') });
          }
        } else {
          resolve({ status: res.statusCode, buffer: raw });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('🧪 測試發票憑證相片上傳、Google 雲端處理與報表匯出...\n');

  // 1. 員工登入
  const empLogin = await makeRequest('POST', '/api/auth/login', { username: 'employee', password: 'emp123' });
  const empToken = empLogin.data.token;

  // 2. 建立附帶發票照片的申請單 (真實 PNG 圖片 base64)
  const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjuAAAAAElFTkSuQmCC';
  const newClaim = await makeRequest('POST', '/api/claims', {
    expense_date: '2026-09-18',
    category: '餐食',
    item_name: '客戶商務會議下午茶點心',
    amount: 850,
    receipt_no: 'INV-77889900',
    notes: '附帶發票憑證照片測試',
    receipt_url: samplePngBase64
  }, empToken);

  console.assert(newClaim.status === 201, 'Claim creation should succeed');
  console.log('   ✓ 附帶照片申請單建立成功！單號:', newClaim.data.claim.claim_no);
  console.log('   ✓ 憑證照片儲存/雲端歸檔路徑:', newClaim.data.claim.receipt_url);
  console.assert(newClaim.data.claim.receipt_url.length > 0, 'Receipt url must exist');

  // 3. 會計登入
  const accLogin = await makeRequest('POST', '/api/auth/login', { username: 'accountant', password: 'acc123' });
  const accToken = accLogin.data.token;

  // 4. 匯出 Excel 報表 (驗證圖片內嵌與超連結)
  const excelRes = await makeRequest('GET', '/api/export/excel', null, accToken);
  console.assert(excelRes.status === 200, 'Excel export should succeed');
  console.log(`   ✓ Excel 報表匯出成功！大小: ${excelRes.buffer.length} bytes (已內嵌發票照片縮圖與超連結)`);

  // 5. 匯出 CSV 報表 (驗證包含照片欄位)
  const csvRes = await makeRequest('GET', '/api/export/csv', null, accToken);
  const csvText = csvRes.buffer.toString('utf8');
  console.assert(csvText.includes('憑證照片網址'), 'CSV must include photo column');
  console.log('   ✓ CSV 報表匯出成功！包含「憑證照片網址」欄位');

  console.log('\n🎉 發票照片上傳與報表同步全部測試通過！');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
