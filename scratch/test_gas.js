const https = require('https');

const gasUrl = 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec';

function sendGas(payload) {
  return new Promise((resolve, reject) => {
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(r => r.text()).then(text => {
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        resolve({ raw: text });
      }
    }).catch(reject);
  });
}

async function test() {
  console.log('Testing GAS ping...');
  const ping = await sendGas({ action: 'ping' });
  console.log('Ping response:', ping);
}

test().catch(console.error);
