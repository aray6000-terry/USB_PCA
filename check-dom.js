const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('<header') || l.includes('id="login-view"') || l.includes('id="main-view"') || l.includes('class="view') || l.includes('login-wrapper') || l.includes('login-showcase') || l.includes('stats-grid') || l.includes('main-header')) {
    console.log(`Line ${i+1}: ${l.trim()}`);
  }
});
