export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/\s+/g, '-') // Whitespace → hyphen
    .replace(/[^a-z0-9-]/g, ''); // Removes everything except lowercase letters, digits and hyphens
}

/**
 * Whether a channel name looks like a TeamSpeak "spacer" channel -- a
 * decorative, non-joinable channel used purely to organize the channel
 * tree visually. There's no ServerQuery flag for this; per the human
 * operator, the actual convention in use here is simply "the word 'spacer'
 * appears anywhere in the name" (case-insensitive) -- not a fixed prefix,
 * so this deliberately checks a substring rather than anchoring to the
 * start of the name.
 */
export function isSpacerChannelName(name: string): boolean {
  return /spacer/i.test(name);
}

/**
 * Reserved channelName under which the shared "spacer base image" is
 * stored (see images.controller.public.ts's fallback and
 * images.controller.local.ts's upload endpoint for it). Deliberately
 * contains underscores, a character normalizeChannelName() always strips
 * from any real channel name -- so this key can never collide with (or be
 * reachable as) an actual TeamSpeak channel's normalized name, without
 * needing a separate "is this the sentinel" check anywhere a real
 * channelName is handled.
 */
export const SPACER_BASE_IMAGE_CHANNEL_NAME = '__spacer_base_image__';
