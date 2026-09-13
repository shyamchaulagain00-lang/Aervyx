const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\Landing.tsx';
const s = fs.readFileSync(p, 'utf8');

console.log('DOWNLOAD_PROVIDER_LIST import:', s.includes('DOWNLOAD_PROVIDER_LIST'));
console.log('providers-section JSX:', s.includes('providers-section'));
console.log('lootlabs present:', s.includes('LootLabs'));
console.log('linkvertise present:', s.includes('Linkvertise'));
console.log('workink present:', s.includes('Work.ink'));
console.log('discord-float present:', s.includes('discord-float'));
console.log('discord href present:', s.includes('discord.gg/M7pD8FnSe'));
console.log('discord aria-label present:', s.includes('aria-label="Join Aervyx Discord"'));
console.log('total length:', s.length);
