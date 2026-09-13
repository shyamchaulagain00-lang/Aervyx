const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\dist\\index-BWYJtdLH.js';
const s = fs.readFileSync(p, 'utf8');

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
