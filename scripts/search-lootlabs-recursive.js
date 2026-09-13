const fs = require('fs');
const path = require('path');
const root = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\dist';

let found = [];
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (e.isFile() && /\.js$/i.test(e.name)) {
      try {
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('LootLabs')) found.push(p);
      } catch {}
    }
  }
}
walk(root);

console.log('JS files containing LootLabs:');
found.forEach(p => console.log(' -', p.replace(/^c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\/,'$1')));
if (found.length === 0) console.log('NONE');
