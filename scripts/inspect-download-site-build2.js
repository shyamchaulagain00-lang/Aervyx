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
if(!p){ console.log('no js files'); process.exit(1); }

const s = fs.readFileSync(p,'utf8');
console.log('Using chunk:', p.replace(/^c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\dist\\/,''));

const checks = {
  discordFloat: s.includes('discord-float'),
  discordTooltip: s.includes('discord-tooltip'),
  discordHref: s.includes('discord.gg/M7pD8FnSe'),
  noopener: s.includes('noopener'),
  noreferrer: s.includes('noreferrer'),
  ariaLabel: s.includes('aria-label=') && s.includes('Join Aervyx Discord'),
  providerSection: s.includes('section-label"><span /> DOWNLOAD FROM'),
  providerGrid: s.includes('provider-grid'),
  providerCard: s.includes('provider-card'),
  lootLabs: s.includes('LootLabs'),
  linkvertise: s.includes('Linkvertise'),
  workink: s.includes('Work.ink'),
  placeholderLootlabs: s.includes('PLACEHOLDER_LOOTLABS_URL'),
  placeholderLinkvertise: s.includes('PLACEHOLDER_LINKVERTISE_URL'),
  placeholderWorkink: s.includes('PLACEHOLDER_WORKINK_URL'),
  discordSvgPath: s.includes('M20.321 19.267'),
};
Object.entries(checks).forEach(([k,v]) => console.log(`${k}: ${v}`));
