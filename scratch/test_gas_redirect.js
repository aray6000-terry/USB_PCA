const https = require('https');

const url = 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec?action=ping';

function getFollow(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, (res) => {
      console.log('Status:', res.statusCode, 'Location:', res.headers.location);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        getFollow(res.headers.location).then(resolve).catch(reject);
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    }).on('error', reject);
  });
}

getFollow(url).then(res => {
  console.log('Final Data Preview (first 200 chars):', res.data.substring(0, 200));
}).catch(console.error);
