// Centralized download provider configuration for the Aervyx website.
// Keep all three provider URLs in this file. Replace the placeholder values when
// the real provider links are available. These placeholders are not real working links.
//
// IMPORTANT:
// - These placeholder URLs are not real download links.
// - Do not add extra providers here without also updating the UI mapping.
// - Do not use Xeno branding or Xeno download links.

export const DOWNLOAD_PROVIDERS = {
  lootlabs: {
    name: 'LootLabs',
    url: 'https://lootdest.org/s?L8ac26sS', // real provider URL
  },
  linkvertise: {
    name: 'Linkvertise',
    url: 'PLACEHOLDER_LINKVERTISE_URL', // TODO: replace with real provider URL
  },
  workink: {
    name: 'Work.ink',
    url: 'PLACEHOLDER_WORKINK_URL', // TODO: replace with real provider URL
  },
} as const;

export type DownloadProviderKey = keyof typeof DOWNLOAD_PROVIDERS;

export const DOWNLOAD_PROVIDER_LIST = Object.values(DOWNLOAD_PROVIDERS);
