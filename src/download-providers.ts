// Centralized Aervyx download provider configuration.
// Keep all provider URLs in this file. Replace the placeholder values when the real
// provider links are available. These placeholders are not real working download links.
//
// IMPORTANT:
// - Do not treat these placeholder URLs as live links.
// - Do not add extra providers here without updating the UI mapping.
// - Do not use Xeno branding or Xeno download links.

export const DOWNLOAD_PROVIDERS = {
  lootlabs: {
    name: 'LootLabs',
    url: 'PLACEHOLDER_LOOTLABS_URL',
    // TODO: replace with real provider URL when real provider link is available
  },
  linkvertise: {
    name: 'Linkvertise',
    url: 'PLACEHOLDER_LINKVERTISE_URL',
    // TODO: replace with real provider URL when real provider link is available
  },
  workink: {
    name: 'Work.ink',
    url: 'PLACEHOLDER_WORKINK_URL',
    // TODO: replace with real provider URL when real provider link is available
  },
} as const;

export type DownloadProviderKey = keyof typeof DOWNLOAD_PROVIDERS;

export const DOWNLOAD_PROVIDER_LIST = Object.values(DOWNLOAD_PROVIDERS);
