const fs = require('fs');

const siteFile = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\src\\download-providers.ts';
const rootFile = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\download-providers.ts';

console.log('site config exists:', fs.existsSync(siteFile));
console.log('root config exists:', fs.existsSync(rootFile));

const siteApp = fs.readFileSync('c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\src\\App.tsx', 'utf8');
console.log('site App imports download-providers:', siteApp.includes('download-providers'));

// Check if any src file in root imports download-providers
let rootImportFound = false;
function walkDir(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '\\' + e.name;
    if (e.isDirectory() && e.name !== 'node_modules') {
      walkDir(p);
    } else if (/\.tsx?$/i.test(e.name) && e.name !== 'download-providers.ts') {
      try {
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('download-providers')) {
          console.log('root import found in:', p.replace('c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\', ''));
          rootImportFound = true;
        }
      } catch {}
    }
  }
}
walkDir('c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src');
if (!rootImportFound) console.log('no root src file imports download-providers');
