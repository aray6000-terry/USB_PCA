const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function createWsClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(url.port || 80, url.hostname, () => {
      const req = [
        `GET ${url.pathname} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n');
      socket.write(req);
    });

    let msgId = 1;
    const callbacks = new Map();
    let buffer = Buffer.alloc(0);
    let upgraded = false;

    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (!upgraded) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          upgraded = true;
          buffer = buffer.slice(headerEnd + 4);
          resolve({
            send(method, params = {}) {
              return new Promise((res, rej) => {
                const id = msgId++;
                callbacks.set(id, { res, rej });
                const json = JSON.stringify({ id, method, params });
                const payload = Buffer.from(json);
                let header;
                if (payload.length < 126) {
                  header = Buffer.from([0x81, 0x80 | payload.length]);
                } else if (payload.length <= 65535) {
                  header = Buffer.alloc(4);
                  header[0] = 0x81;
                  header[1] = 0x80 | 126;
                  header.writeUInt16BE(payload.length, 2);
                } else {
                  header = Buffer.alloc(10);
                  header[0] = 0x81;
                  header[1] = 0x80 | 127;
                  header.writeBigUInt64BE(BigInt(payload.length), 2);
                }
                const mask = crypto.randomBytes(4);
                const masked = Buffer.alloc(payload.length);
                for (let i = 0; i < payload.length; i++) {
                  masked[i] = payload[i] ^ mask[i % 4];
                }
                socket.write(Buffer.concat([header, mask, masked]));
              });
            },
            close() {
              socket.destroy();
            }
          });
        }
      }

      if (upgraded) {
        while (buffer.length >= 2) {
          const secondByte = buffer[1];
          const hasMask = (secondByte & 0x80) !== 0;
          let len = secondByte & 0x7F;
          let offset = 2;

          if (len === 126) {
            if (buffer.length < 4) break;
            len = buffer.readUInt16BE(2);
            offset = 4;
          } else if (len === 127) {
            if (buffer.length < 10) break;
            len = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }

          if (hasMask) offset += 4;
          if (buffer.length < offset + len) break;

          const rawData = buffer.slice(offset, offset + len);
          buffer = buffer.slice(offset + len);

          try {
            const parsed = JSON.parse(rawData.toString('utf8'));
            if (parsed.id && callbacks.has(parsed.id)) {
              const cb = callbacks.get(parsed.id);
              callbacks.delete(parsed.id);
              if (parsed.error) cb.rej(parsed.error);
              else cb.res(parsed.result);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    });

    socket.on('error', reject);
  });
}

async function runTest() {
  console.log('1. 啟動 headless Chrome (port 9224)...');
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    'http://localhost:3050'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await new Promise((resolve, reject) => {
      http.get('http://localhost:9224/json', res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('找不到 Chrome 頁面 target');

    const client = await createWsClient(pageTarget.webSocketDebuggerUrl);
    console.log('2. 連線 CDP WebSocket 成功！');

    async function evaluate(expr) {
      const res = await client.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    }

    // 等待載入登入畫面
    await new Promise(r => setTimeout(r, 1000));

    console.log('3. 登入會計帳號 (accountant)...');
    await evaluate(`
      document.getElementById('login-username').value = 'accountant';
      document.getElementById('login-password').value = 'acc123';
      document.getElementById('btn-submit-login').click();
    `);

    // 等待表格載入
    await new Promise(r => setTimeout(r, 2000));

    // 檢查表格行數與憑證按鈕
    const tableInfo = await evaluate(`
      (() => {
        const rows = document.querySelectorAll('#claims-tbody tr');
        const previewBtns = document.querySelectorAll('.btn-receipt-preview');
        return {
          rowCount: rows.length,
          previewBtnCount: previewBtns.length,
          btnIds: Array.from(previewBtns).map(b => b.dataset.id)
        };
      })()
    `);
    console.log('4. 表格與憑證按鈕統計:', tableInfo);

    if (tableInfo.previewBtnCount === 0) {
      throw new Error('未在表格中找到任何憑證按鈕！');
    }

    console.log('5. 模擬點擊第一個「🔍 檢視憑證」按鈕 (Claim ID: ' + tableInfo.btnIds[0] + ')...');
    await evaluate(`
      const btn = document.querySelector('.btn-receipt-preview');
      btn.click();
    `);

    // 等待彈窗開啟與圖片載入
    await new Promise(r => setTimeout(r, 1500));

    // 檢查彈窗狀態與圖片狀態
    const modalState = await evaluate(`
      (() => {
        const modal = document.getElementById('modal-receipt-viewer');
        const img = document.getElementById('receipt-viewer-img');
        const claimNo = document.getElementById('receipt-viewer-claim-no').textContent;
        const receiptNo = document.getElementById('receipt-viewer-receipt-no').textContent;
        const amount = document.getElementById('receipt-viewer-amount').textContent;
        const openLink = document.getElementById('receipt-viewer-open-link').href;

        return {
          isModalActive: modal.classList.contains('active'),
          claimNo,
          receiptNo,
          amount,
          openLink,
          imgSrc: img.src,
          imgComplete: img.complete,
          imgNaturalWidth: img.naturalWidth,
          imgNaturalHeight: img.naturalHeight,
          imgDisplayWidth: img.clientWidth,
          imgDisplayHeight: img.clientHeight
        };
      })()
    `);

    console.log('6. 憑證檢視彈窗即時驗證結果:\n', JSON.stringify(modalState, null, 2));

    // 螢幕截圖
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    const screenshotBuf = Buffer.from(screenshot.data, 'base64');

    const artifactPath = 'C:\\\\Users\\\\aray6\\\\.gemini\\\\antigravity-ide\\\\brain\\\\11628249-b804-4cc6-a748-447b86465d76\\\\receipt_preview_clicked.png';
    fs.writeFileSync(artifactPath, screenshotBuf);
    console.log('7. 已成功儲存點擊後的彈窗完整截圖至:', artifactPath);

    client.close();
    chromeProcess.kill();

    if (!modalState.isModalActive) {
      throw new Error('❌ 失敗: 彈窗未成功加上 .active');
    }
    if (!modalState.imgComplete || modalState.imgNaturalWidth <= 0) {
      throw new Error('❌ 失敗: 圖片載入失敗 (imgComplete=' + modalState.imgComplete + ', naturalWidth=' + modalState.imgNaturalWidth + ')');
    }

    console.log('🎉 測試大成功！憑證檢視彈窗 100% 正常載入且圖片成功渲染！');
  } catch (err) {
    chromeProcess.kill();
    throw err;
  }
}

runTest().catch(err => {
  console.error('執行測試發生異常:', err);
  process.exit(1);
});
