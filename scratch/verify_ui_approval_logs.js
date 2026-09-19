const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME || 'aray6') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
];
const chromeExecutable = chromePaths.find(p => fs.existsSync(p));

async function verifyUi() {
  console.log('啟動 Chrome 進行審核與 Log 檔 UI 驗證...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromeExecutable,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3050', { waitUntil: 'networkidle0' });

  // 1. 快速切換至會計身份
  console.log('切換登入為會計角色...');
  await page.evaluate(() => {
    const sel = document.getElementById('select-role-switch');
    if (sel) {
      sel.value = 'accountant';
      sel.dispatchEvent(new Event('change'));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. 找到第一筆申請單的審核按鈕並點擊
  console.log('點擊審核按鈕...');
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.btn-review');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 600));

  // 截圖 1: 審核彈窗 (含批准金額輸入框與差額計算)
  const screenshot1 = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\approval_modal_verified.png';
  await page.screenshot({ path: screenshot1 });
  console.log('已儲存審核彈窗截圖:', screenshot1);

  // 3. 在批准金額中輸入調降後的金額 (例如 1800)
  console.log('在批准金額輸入框填寫 1800 並觸發 input...');
  await page.evaluate(() => {
    const inp = document.getElementById('review-approved-amount');
    if (inp) {
      inp.value = '1800';
      inp.dispatchEvent(new Event('input'));
    }
  });
  await new Promise(r => setTimeout(r, 400));

  const screenshot2 = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\approval_amount_diff_verified.png';
  await page.screenshot({ path: screenshot2 });
  console.log('已儲存差額標籤截圖:', screenshot2);

  // 4. 點擊「查看本系統金額異動 Log 檔」按鈕
  console.log('開啟 Log 檔檢視彈窗...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-open-logs-from-review');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const screenshot3 = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\audit_logs_modal_verified.png';
  await page.screenshot({ path: screenshot3 });
  console.log('已儲存 Log 檔檢視彈窗截圖:', screenshot3);

  await browser.close();
  console.log('✓ 前端 UI 驗證全部完成！');
}

verifyUi().catch(e => {
  console.error('UI 驗證錯誤:', e);
  process.exit(1);
});
