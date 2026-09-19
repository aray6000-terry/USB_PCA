const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = [];
const found = [];
while ((match = regex.exec(appJs)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missing.push(id);
  } else {
    found.push(id);
  }
}
console.log('Checked', found.length + missing.length, 'IDs');
if (missing.length > 0) {
  console.log('MISSING IDs:', missing);
} else {
  console.log('All DOM IDs exist in index.html!');
}
