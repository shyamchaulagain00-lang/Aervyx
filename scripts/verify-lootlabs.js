const fs = require('fs');
const path = require('path');
const dir = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\dist';

let jsFiles = [];
function walk(d){
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p = path.join(d, e.name);
    if(e.isDirectory()) walk(p);
    else if(/\.js$/i.test(e.name)) jsFiles.push(p);
  }
}
walk(dir);
jsFiles.sort((a,b)=> fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
const p = jsFiles[0];
const s = fs.readFileSync(p,'utf8');

const expectedLootLabs = 'https://lootdest.org/s?L8ac26sS';
const checks = {
  lootLabsUrl: s.includes(expectedLootLabs),
  lootLabsUrlExact: s.includes(expectedLootLabs),
  linkvertisePlaceholder: s.includes('PLACEHOLDER_LINKVERTISE_URL'),
  workinkPlaceholder: s.includes('PLACEHOLDER_WORKINK_URL'),
  lootLabsName: s.includes('LootLabs'),
  linkvertiseName: s.includes('Linkvertise'),
  workinkName: s.includes('Work.ink'),
  providerCardLinks: s.includes('provider-card'),
};

console.log('Built chunk:', p.replace(/^c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\dist\\/,''));
console.log('---');
Object.entries(checks).forEach(([k,v]) => console.log(`${k}: ${v}`));

if (checks.lootLabsUrl && checks.linkvertisePlaceholder && checks.workinkPlaceholder) {
  console.log('\\nVERIFICATION OK');
} else {
  console.log('\\nVERIFICATION FAILED');
}
