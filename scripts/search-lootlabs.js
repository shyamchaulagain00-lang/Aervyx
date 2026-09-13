const fs = require('fs');
const path = require('path');
const dir = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\dist\\assets';

let found = [];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
for (const f of files) {
  const p = path.join(dir, f);
  try {
    const c = fs.readFileSync(p, 'utf8');
    if (c.includes('LootLabs')) found.push(f);
  } catch {}
}
console.log('Files containing LootLabs:');
found.forEach(f => console.log(' -', f));
if (found.length === 0) console.log('NONE');
