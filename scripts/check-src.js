const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src';
try {
  const s = fs.lstatSync(p);
  console.log('src is symlink:', s.isSymbolicLink());
  console.log('src type:', s.isDirectory() ? 'dir' : 'file');
} catch (e) {
  console.log('err:', e.code);
}
console.log('src realpath:', fs.realpathSync(p));
