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

console.log('Has "Join Aervyx Discord":', s.includes('Join Aervyx Discord'));
console.log('Has "aria-label":', s.includes('aria-label'));
console.log('Snippet around Join Aervyx:');
const i = s.indexOf('Join Aervyx');
if(i>=0) console.log(s.slice(i-60, i+80));
console.log('Snippet around aria-label:');
const j = s.indexOf('aria-label');
if(j>=0) console.log(s.slice(j-30, j+80));
