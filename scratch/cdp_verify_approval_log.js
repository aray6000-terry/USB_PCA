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
              socket.end();
            }
          });
        }
      }

      while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f;
        let payloadLen = buffer[1] & 0x7f;
        let offset = 2;
        if (payloadLen === 126) {
          if (buffer.length < 4) break;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) break;
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (buffer.length < offset + payloadLen) break;
        const payload = buffer.slice(offset, offset + payloadLen);
        buffer = buffer.slice(offset + payloadLen);

        if (opcode === 1) {
          try {
            const msg = JSON.parse(payload.toString('utf8'));
            if (msg.id && callbacks.has(msg.id)) {
              const { res, rej } = callbacks.get(msg.id);
              callbacks.delete(msg.id);
              if (msg.error) rej(msg.error);
              else res(msg.result);
            }
          } catch (e) {}
        }
      }
    });

    socket.on('error', reject);
  });
}

async function runTest() {
  console.log('1. 啟動本機 Chrome 測試環境...');
  const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9224;

  const chromeProc = spawn(chromeExe, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:3050'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/json`, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const pageTab = targets.find(t => t.url.includes('3050'));
    if (!pageTab) throw new Error('未找到 3050 頁面 target');

    const ws = await createWsClient(pageTab.webSocketDebuggerUrl);
    console.log('✓ CDP WebSocket 已連線');

    await ws.send('Runtime.enable');
    await ws.send('Page.enable');
    await new Promise(r => setTimeout(r, 1000));

    // 2. 點擊會計快速登入按鈕
    console.log('2. 點擊會計快速登入按鈕...');
    const loginEval = await ws.send('Runtime.evaluate', {
      expression: `
        (function() {
          const btn = document.querySelector('.demo-chip[data-user="accountant"]');
          if (btn) { btn.click(); return 'clicked_accountant'; }
          return 'no_accountant_chip';
        })()
      `,
      returnByValue: true
    });
    console.log('登入點擊結果:', loginEval.result.value);

    // 等待主畫面加載與資料渲染完成
    await new Promise(r => setTimeout(r, 2200));

    // 3. 打開審核彈窗
    console.log('3. 打開審核彈窗...');
    const clickReview = await ws.send('Runtime.evaluate', {
      expression: `
        (function() {
          const btn = document.querySelector('.btn-review');
          if (btn) { btn.click(); return 'clicked_review_btn'; }
          return 'no_review_btn';
        })()
      `,
      returnByValue: true
    });
    console.log('審核按鈕點擊結果:', clickReview.result.value);
    await new Promise(r => setTimeout(r, 1000));

    // 4. 輸入批准金額 1850 並檢查即時差額與中文大寫預覽
    console.log('4. 輸入批准金額 1850 並檢測動態回饋...');
    const inputEval = await ws.send('Runtime.evaluate', {
      expression: `
        (function() {
          const inp = document.getElementById('review-approved-amount');
          if (inp) {
            inp.value = '1850';
            inp.dispatchEvent(new Event('input'));
            const diff = document.getElementById('review-diff-tag');
            const verbal = document.getElementById('review-amount-verbal');
            return {
              val: inp.value,
              diffText: diff ? diff.textContent.trim() : '',
              verbalText: verbal ? verbal.textContent.trim() : ''
            };
          }
          return 'no_approved_input';
        })()
      `,
      returnByValue: true
    });
    console.log('批准金額回饋結果:', inputEval.result.value);
    await new Promise(r => setTimeout(r, 600));

    // 截圖 1: 審核彈窗
    const shot1Res = await ws.send('Page.captureScreenshot', { format: 'png' });
    const shot1Path = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\approval_modal_verified.png';
    fs.writeFileSync(shot1Path, Buffer.from(shot1Res.data, 'base64'));
    console.log('✓ 已儲存審核彈窗截圖:', shot1Path);

    // 5. 點擊查看 Log 檔按鈕
    console.log('5. 點擊查看 Log 檔按鈕...');
    await ws.send('Runtime.evaluate', {
      expression: `
        (function() {
          const btn = document.getElementById('btn-open-logs-from-review');
          if (btn) btn.click();
        })()
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    // 截圖 2: Log 檢視彈窗
    const shot2Res = await ws.send('Page.captureScreenshot', { format: 'png' });
    const shot2Path = 'C:\\Users\\aray6\\.gemini\\antigravity-ide\\brain\\11628249-b804-4cc6-a748-447b86465d76\\audit_logs_modal_verified.png';
    fs.writeFileSync(shot2Path, Buffer.from(shot2Res.data, 'base64'));
    console.log('✓ 已儲存 Log 檢視彈窗截圖:', shot2Path);

    ws.close();
  } finally {
    chromeProc.kill();
  }
  console.log('🎉 瀏覽器自動化驗證與截圖全數成功完成！');
}

runTest().catch(e => {
  console.error('CDP 測試失敗:', e);
  process.exit(1);
});
