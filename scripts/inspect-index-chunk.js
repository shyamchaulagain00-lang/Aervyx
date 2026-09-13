const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\dist\\assets\\index-C6pFy0hA.js';
const s = fs.readFileSync(p, 'utf8');

console.log('Length:', s.length);
console.log('Contains "download-providers":', s.includes('download-providers'));
console.log('Contains "DOWNLOAD_PROVIDER_LIST":', s.includes('DOWNLOAD_PROVIDER_LIST'));
console.log('Contains "DOWNLOAD_PROVIDER":', s.includes('DOWNLOAD_PROVIDER'));
console.log('Contains "provider-grid":', s.includes('provider-grid'));
console.log('Contains "providers-section":', s.includes('providers-section'));
console.log('Contains "provider-card":', s.includes('provider-card'));
console.log('Contains "Provider":', s.includes('Provider'));
console.log('Contains "placeholder":', s.includes('placeholder'));
console.log('Contains "PLACEHOLDER_LOOTLABS_URL":', s.includes('PLACEHOLDER_LOOTLABS_URL'));
console.log('Contains "https://lootlabs.example":', s.includes('https://lootlabs.example'));
console.log('Contains "https://linkvertise.example":', s.includes('https://linkvertise.example'));
console.log('Contains "https://work.ink/example":', s.includes('https://work.ink/example'));
