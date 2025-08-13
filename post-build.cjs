const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'build', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Remove type="module" de todos os scripts
html = html.replace(/type="module"/g, '');

fs.writeFileSync(indexPath, html);
console.log('Post-build: Removido type="module" do index.html');