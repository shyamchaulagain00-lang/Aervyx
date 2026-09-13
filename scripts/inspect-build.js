const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\dist\\assets\\index-C6pFy0hA.js';
const s = fs.readFileSync(p, 'utf8');

const checks = {
  providersSection: s.includes('providers-section'),
  providerGrid: s.includes('provider-grid'),
  providerCard: s.includes('provider-card'),
  lootlabs: s.includes('LootLabs'),
  linkvertise: s.includes('Linkvertise'),
  workink: s.includes('Work.ink'),
  placeholderLootlabs: s.includes('PLACEHOLDER_LOOTLABS_URL'),
  placeholderLinkvertise: s.includes('PLACEHOLDER_LINKVERTISE_URL'),
  placeholderWorkink: s.includes('PLACEHOLDER_WORKINK_URL'),
  discordFloat: s.includes('discord-float'),
  discordHref: s.includes('discord.gg/M7pD8FnSe'),
  noopener: s.includes('noopener'),
  noreferrer: s.includes('noreferrer'),
  ariaLabel: s.includes('aria-label=') && s.includes('Join Aervyx Discord'),
};

Object.entries(checks).forEach(([k, v]) => console.log(`${k}: ${v}`));
