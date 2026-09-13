const fs = require('fs');
const path = require('path');
const dir = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src';
function walk(d){
  let out=[];
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);
    if(e.isDirectory()) out=out.concat(walk(p));
    else if(/\.(png|svg)$/i.test(e.name)) out.push(p);
  }
  return out;
}
console.log('Image files in src:');
walk(dir).forEach(p=>console.log(' -',p.replace(/^c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\/,'')));
