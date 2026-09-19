const https = require('https');

const gasUrl = 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec';

function requestWithRedirect(url, options, data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      console.log(`[HTTP ${res.statusCode}] ${url.substring(0, 60)}...`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 重定向 follow
        return requestWithRedirect(res.headers.location, { method: 'GET' }).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('Sending ping...');
  const pingRes = await requestWithRedirect(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ action: 'ping' }));
  console.log('Ping output:', pingRes.body);

  console.log('\nSending get_users...');
  const usersRes = await requestWithRedirect(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ action: 'get_users' }));
  console.log('Users output:', usersRes.body.substring(0, 300));
}

test().catch(console.error);
