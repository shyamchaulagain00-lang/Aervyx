const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\aervyx-logo.png';
try {
  const s = fs.statSync(p);
  console.log('src/aervyx-logo.png exists:', s.size, 'bytes');
} catch (e) {
  console.log('src/aervyx-logo.png missing:', e.code);
}
const p2 = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\public\\aervyx-logo.png';
try {
  const s = fs.statSync(p2);
  console.log('public/aervyx-logo.png exists:', s.size, 'bytes');
} catch (e) {
  console.log('public/aervyx-logo.png missing:', e.code);
}
