const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('1. 正在開啟系統頁面...');
  await page.goto('http://localhost:3050');

  // 等待畫面載入
  await page.waitForSelector('#login-username', { timeout: 5000 });

  console.log('2. 正在登入會計帳號...');
  await page.fill('#login-username', 'accountant');
  await page.fill('#login-password', 'accountant123');
  await page.click('#btn-submit-login');

  // 等待主要畫面與表格出現
  await page.waitForSelector('#claims-tbody tr', { timeout: 8000 });
  console.log('3. 登入成功，主要表格已載入。');

  // 檢查是否有「🔍 檢視憑證」按鈕
  const previewButtons = await page.$$('.btn-receipt-preview');
  console.log(`4. 找到 ${previewButtons.length} 個「🔍 檢視憑證」按鈕。`);

  if (previewButtons.length === 0) {
    throw new Error('未找到任何「🔍 檢視憑證」按鈕！');
  }

  // 點擊第一個「🔍 檢視憑證」按鈕
  console.log('5. 點擊第一個憑證檢視按鈕...');
  await previewButtons[0].click();

  // 等待彈窗出現
  await page.waitForSelector('#modal-receipt-viewer.active', { timeout: 5000 });
  console.log('6. 憑證檢視彈窗已成功彈出 (已包含 .active)！');

  // 等待圖片載入完畢 (naturalWidth > 0)
  await page.waitForFunction(() => {
    const img = document.getElementById('receipt-viewer-img');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 8000 });

  const modalData = await page.evaluate(() => {
    const modal = document.getElementById('modal-receipt-viewer');
    const img = document.getElementById('receipt-viewer-img');
    const claimNo = document.getElementById('receipt-viewer-claim-no').textContent;
    const receiptNo = document.getElementById('receipt-viewer-receipt-no').textContent;
    const amount = document.getElementById('receipt-viewer-amount').textContent;

    return {
      isActive: modal.classList.contains('active'),
      claimNo,
      receiptNo,
      amount,
      imgSrc: img.src,
      imgComplete: img.complete,
      imgNaturalWidth: img.naturalWidth,
      imgNaturalHeight: img.naturalHeight
    };
  });

  console.log('7. 憑證彈窗狀態數據:', JSON.stringify(modalData, null, 2));

  // 截圖保存
  const screenshotPath = path.join(__dirname, 'receipt_preview_success.png');
  await page.screenshot({ path: screenshotPath });
  console.log('8. 截圖已儲存至:', screenshotPath);

  // 同步複製到 artifacts 目錄
  const artifactPath = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\receipt_preview_success.png';
  fs.copyFileSync(screenshotPath, artifactPath);
  console.log('9. 已同步到 Artifacts 目錄:', artifactPath);

  await browser.close();
  console.log('🎉 測試全部通過！');
})();
