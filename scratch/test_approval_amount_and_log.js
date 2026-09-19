const fs = require('fs');
const path = require('path');

async function testApprovalAndLog() {
  console.log('=== 開始測試批准金額與實體 Log 檔機制 ===\n');

  const BASE_URL = 'http://localhost:3050/api';

  // 1. 會計登入
  console.log('1. 以會計身份登入 (accountant)...');
  const accLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'accountant', password: 'acc123' })
  });
  const accLoginData = await accLoginRes.json();
  if (!accLoginData.success || !accLoginData.token) {
    throw new Error('會計登入失敗: ' + JSON.stringify(accLoginData));
  }
  const accToken = accLoginData.token;
  console.log('✓ 會計登入成功，取得 Token');

  // 2. 獲取第一筆申請單
  const claimsRes = await fetch(`${BASE_URL}/claims`, {
    headers: { 'Authorization': `Bearer ${accToken}` }
  });
  const claimsData = await claimsRes.json();
  if (!claimsData.success || claimsData.claims.length === 0) {
    throw new Error('無申請單可供測試');
  }
  const targetClaim = claimsData.claims[0];
  console.log(`✓ 鎖定測試申請單: ${targetClaim.claim_no}，原申報金額: NT$ ${targetClaim.amount}`);

  // 3. 執行審核並調整批准金額 (例如調為 原金額 - 100)
  const testApprovedAmount = Math.max(10, targetClaim.amount - 100);
  const testReason = '測試會計審核：部分非公務開支剔除，實批核准';
  console.log(`2. 送出審核變更：批准金額改為 NT$ ${testApprovedAmount}，原因: ${testReason}`);

  const patchRes = await fetch(`${BASE_URL}/claims/${targetClaim.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accToken}`
    },
    body: JSON.stringify({
      status: 'approved',
      approved_amount: testApprovedAmount,
      reason: testReason
    })
  });
  const patchData = await patchRes.json();
  if (!patchData.success) {
    throw new Error('審核狀態更新失敗: ' + JSON.stringify(patchData));
  }
  console.log('✓ 伺服器回傳:', patchData.message);
  console.log('✓ 單據 approved_amount 欄位值:', patchData.claim.approved_amount);

  if (patchData.claim.approved_amount !== testApprovedAmount) {
    throw new Error(`批准金額不符合預期！期望: ${testApprovedAmount}, 實際: ${patchData.claim.approved_amount}`);
  }

  // 4. 實體檢查 data/logs/approval_changes.log
  console.log('\n3. 檢查伺服器實體 Log 檔 (data/logs/approval_changes.log)...');
  const logFilePath = path.join(__dirname, '../data/logs/approval_changes.log');
  if (!fs.existsSync(logFilePath)) {
    throw new Error(`實體 Log 檔不存在！路徑: ${logFilePath}`);
  }
  const logContent = fs.readFileSync(logFilePath, 'utf8');
  console.log('--- 實體 Log 檔最新內容 ---');
  const logLines = logContent.trim().split('\n');
  const latestLogLine = logLines[logLines.length - 1];
  console.log(latestLogLine);
  console.log('---------------------------');

  if (!latestLogLine.includes(targetClaim.claim_no) || !latestLogLine.includes(testApprovedAmount.toLocaleString('en-US'))) {
    throw new Error('實體 Log 檔中未找到對應的單號或實批金額！');
  }
  console.log('✓ 實體 Log 檔驗證完全正確！');

  // 5. 測試 GET /api/claims/approval-logs API 端點
  console.log('\n4. 測試 API 端點 GET /api/claims/approval-logs...');
  const logsRes = await fetch(`${BASE_URL}/claims/approval-logs?limit=5`, {
    headers: { 'Authorization': `Bearer ${accToken}` }
  });
  const logsData = await logsRes.json();
  if (!logsData.success || !logsData.logs || logsData.logs.length === 0) {
    throw new Error('API 讀取日誌失敗: ' + JSON.stringify(logsData));
  }
  console.log(`✓ 成功讀取 ${logsData.logs.length} 筆 Log，最新一筆單號: ${logsData.logs[0].claim_no}，操作人: ${logsData.logs[0].operator}`);
  console.log('✓ 檔案資訊:', logsData.fileInfo.sizeFormatted, '路徑:', logsData.fileInfo.fileName);

  // 6. 測試一般員工存取權限控制 (RBAC)
  console.log('\n5. 測試權限控制 (一般員工存取)...');
  const empLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'employee', password: 'emp123' })
  });
  const empLoginData = await empLoginRes.json();
  const empToken = empLoginData.token;

  const empLogRes = await fetch(`${BASE_URL}/claims/approval-logs`, {
    headers: { 'Authorization': `Bearer ${empToken}` }
  });
  if (empLogRes.status === 403) {
    console.log('✓ 一般員工讀取 Log 檔正確被攔截 (HTTP 403 Forbidden)');
  } else {
    throw new Error('權限漏洞：一般員工竟然可以存取 Log 檔！HTTP ' + empLogRes.status);
  }

  const empPatchRes = await fetch(`${BASE_URL}/claims/${targetClaim.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${empToken}`
    },
    body: JSON.stringify({
      status: 'approved',
      approved_amount: 9999
    })
  });
  if (empPatchRes.status === 403) {
    console.log('✓ 一般員工修改審核金額正確被攔截 (HTTP 403 Forbidden)');
  } else {
    throw new Error('權限漏洞：一般員工竟然可以修改審核狀態！HTTP ' + empPatchRes.status);
  }

  // 7. 測試 CSV 與 Excel 匯出內容
  console.log('\n6. 測試報表匯出欄位...');
  const csvRes = await fetch(`${BASE_URL}/export/csv`, {
    headers: { 'Authorization': `Bearer ${accToken}` }
  });
  const csvText = await csvRes.text();
  if (csvText.includes('核准金額') && csvText.includes(String(testApprovedAmount))) {
    console.log('✓ CSV 報表已正確包含「核准金額」欄位與數值');
  } else {
    throw new Error('CSV 報表未找到「核准金額」！內容預覽: ' + csvText.slice(0, 200));
  }

  console.log('\n🎉 所有批准金額與 Log 檔稽核功能測試全數通過！');
}

testApprovalAndLog().catch(err => {
  console.error('❌ 測試失敗:', err);
  process.exit(1);
});
