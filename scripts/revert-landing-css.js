const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\landing.css';
let s = fs.readFileSync(p, 'utf8');
const marker = '.final-cta h2{font-size:21px}}';
const idx = s.indexOf(marker);
if (idx >= 0) {
  const end = idx + marker.length;
  s = s.slice(0, end);
  fs.writeFileSync(p, s, 'utf8');
  console.log('landing.css reverted to original end');
} else {
  console.log('marker not found');
}
