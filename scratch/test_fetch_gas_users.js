const https = require('https');

const gasUrl = 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec';

function postGas(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      console.log('Status:', res.statusCode, 'Location:', res.headers.location);
      if (res.statusCode === 302 && res.headers.location) {
        https.get(res.headers.location, (redirectRes) => {
          let body = '';
          redirectRes.on('data', chunk => body += chunk);
          redirectRes.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ raw: body });
            }
          });
        }).on('error', reject);
      } else {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body });
          }
        });
      }
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function test() {
  const res = await postGas({ action: 'get_users' });
  console.log('Full Response:', res);
}

test().catch(console.error);
