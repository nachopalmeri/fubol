/**
 * Shared TorBox/no-TorBox configuration rules.
 *
 * AIOStreams rejects a config that enables an indexer preset without a usable
 * debrid service. The old scripts avoided that by disabling every VOD preset
 * when `.secrets/torbox.key` was missing, which also removed the P2P results
 * that Stremio can play. This helper keeps the config valid without pretending
 * a debrid service exists.
 */

export const TORBOX_PLACEHOLDER = 'PENDING_TORBOX_KEY';

// These presets validate only when a debrid/usenet service is present. They
// cannot return playable results on their own, so they stay off without a key.
const SERVICE_ONLY_PRESETS = new Set(['knaben', 'stremthruTorz', 'animetosho']);

/**
 * Apply the TorBox state to an AIOStreams config object in place.
 *
 * With a key: TorBox stays as the service, all presets are enabled and the
 * service wrapping is active (cached/debrid URLs, playable by AIOStreams
 * Desktop).
 *
 * Without a key: the TorBox service is removed instead of shipping the
 * placeholder key, service wrapping is disabled, and only presets that can
 * return P2P torrents stay enabled. Stremio can play those infoHash streams;
 * AIOStreams Desktop cannot, so VOD in the desktop app still needs a key.
 */
export function applyTorboxMode(config, key) {
  const services = Array.isArray(config.services) ? config.services : [];
  const torbox = services.find((service) => service.id === 'torbox');

  if (key) {
    if (!torbox) throw new Error('config template has no torbox service');
    torbox.credentials = { ...(torbox.credentials || {}), apiKey: key };
    for (const preset of config.presets || []) preset.enabled = true;
    if (config.serviceWrap) config.serviceWrap.enabled = true;
    return config;
  }

  config.services = [];
  if (config.serviceWrap) config.serviceWrap.enabled = false;
  for (const preset of config.presets || []) {
    if (SERVICE_ONLY_PRESETS.has(preset.type)) preset.enabled = false;
  }
  return config;
}
