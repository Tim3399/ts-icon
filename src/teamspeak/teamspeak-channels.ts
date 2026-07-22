import { Logger } from '@nestjs/common';
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library';
import type * as Props from 'ts3-nodejs-library/lib/types/PropertyTypes';
import {
  TS_HOST,
  TS_QUERY_PORT,
  TS_SERVER_PORT,
  TS_PROTOCOL,
  getTeamSpeakCredentials,
} from '../../config';
import type { TsProtocol } from '../../config';
import { normalizeChannelName } from '../util/util';

const PROTOCOL_MAP: Record<
  TsProtocol,
  (typeof QueryProtocol)[keyof typeof QueryProtocol]
> = {
  raw: QueryProtocol.RAW,
  ssh: QueryProtocol.SSH,
};

const logger = new Logger('TeamSpeakChannels');

export interface LiveChannel {
  cid: string;
  name: string;
  /**
   * The channel's current TeamSpeak banner URL (its `channelBannerGfxUrl`
   * property), or `null` if it has none set. Compared against
   * `expectedBannerUrl()` by `isManagedByUs()` to decide whether this
   * channel's banner is already pointed at our own managed image.
   */
  bannerGfxUrl: string | null;
}

/**
 * Opens a TeamSpeak connection, runs `fn` against it, and always disconnects
 * afterward -- success or failure. Shared by every operation in this module
 * that needs a live connection (listing channels, editing a channel's
 * banner URL), so there's one place that knows how to connect/attach an
 * error handler/disconnect, instead of that boilerplate being duplicated at
 * every call site. Using `finally` for the disconnect (rather than only
 * calling `quit()` after a successful operation, the previous shape of this
 * code) also means a connection is no longer leaked if `fn` throws.
 */
async function withTeamSpeakConnection<T>(
  fn: (ts3: TeamSpeak) => Promise<T>,
): Promise<T> {
  logger.log('[TeamSpeak] Starting connection to TeamSpeak...');
  const { username, password } = getTeamSpeakCredentials();
  const ts3 = await TeamSpeak.connect({
    host: TS_HOST,
    queryport: TS_QUERY_PORT,
    serverport: TS_SERVER_PORT,
    protocol: PROTOCOL_MAP[TS_PROTOCOL],
    username,
    password,
  });
  ts3.on('error', (err) => {
    logger.error('[TeamSpeak] client error:', err);
  });
  logger.log('[TeamSpeak] Connection to TeamSpeak established.');

  try {
    return await fn(ts3);
  } finally {
    await ts3.quit();
    logger.log('[TeamSpeak] Connection to TeamSpeak closed.');
  }
}

function toLiveChannel(c: {
  cid: string;
  name: string;
  bannerGfxUrl?: string;
}): LiveChannel {
  return { cid: c.cid, name: c.name, bannerGfxUrl: c.bannerGfxUrl || null };
}

// Both the admin channel picker (GET /images-local/channels) and the
// upload-path channel resolution call fetchLiveChannels() per-request. Two
// layers cut down on TeamSpeak connections:
//  - inFlightFetch dedupes concurrent callers into the one connection
//    attempt already in progress (cleared once it settles, success or
//    failure, so the *next*, non-concurrent call still gets a fresh
//    connection rather than being stuck with a stale result forever).
//  - cachedResult additionally short-circuits rapid *sequential* calls
//    (e.g. an admin refreshing the channel picker a few seconds apart)
//    within CACHE_TTL_MS, without opening a new connection at all.
// Trade-off: both the channel picker and the upload-path channel resolution
// can now see up to CACHE_TTL_MS-stale TeamSpeak data -- a channel created
// or renamed in the last few seconds might not show up yet. A failed fetch
// is never cached (only the success path below sets cachedResult), so a
// transient failure doesn't get stuck repeating for the TTL.
const CACHE_TTL_MS = 30_000;

interface CachedChannels {
  data: LiveChannel[];
  expiresAt: number;
}

let cachedResult: CachedChannels | null = null;
let inFlightFetch: Promise<LiveChannel[]> | null = null;

/**
 * Connects to the TeamSpeak server configured via TS_HOST/TS_QUERY_PORT/
 * TS_SERVER_PORT and the ServerQuery credentials, fetches the current live
 * channel list (raw, un-normalized names, each channel's stable ID, and its
 * current banner URL), and disconnects again.
 *
 * This is the one place that opens a TeamSpeak connection to list channels —
 * both the admin channel picker and the upload-path channel resolution call
 * it, and the one-time channel-ID backfill script does too, so there's a
 * single connect/list/disconnect implementation instead of the pattern being
 * duplicated across call sites. Concurrent calls are deduped into a single
 * in-flight connection attempt, and successful results are cached briefly —
 * see the comment above `CACHE_TTL_MS`.
 *
 * The transport (raw ServerQuery vs. SSH-tunneled ServerQuery) is
 * configurable via TS_PROTOCOL rather than hardcoded: some TeamSpeak
 * deployments only expose the SSH transport, even though the command set on
 * the wire is identical either way.
 */
export function fetchLiveChannels(): Promise<LiveChannel[]> {
  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return Promise.resolve(cachedResult.data);
  }
  if (!inFlightFetch) {
    inFlightFetch = connectAndListChannels()
      .then((result) => {
        cachedResult = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
        return result;
      })
      .finally(() => {
        inFlightFetch = null;
      });
  }
  return inFlightFetch;
}

/**
 * Drops the cached channel list so the next `fetchLiveChannels()` call
 * reconnects instead of returning a stale result. Called by
 * `setChannelBannerUrl()`/`applyBannerUrlsForAllChannels()` after they
 * change a channel's banner URL on the TeamSpeak server -- without this,
 * a "Set banner URL" action followed immediately by a channel-list refresh
 * (the normal admin-UI workflow) would show the *pre-update* bannerGfxUrl
 * for up to CACHE_TTL_MS, making a channel that was just successfully
 * marked as managed. Also used by tests as an explicit way to start from a
 * clean slate between cases, since cachedResult/inFlightFetch are
 * module-level state that jest.clearAllMocks() does not touch.
 */
export function invalidateLiveChannelsCache(): void {
  cachedResult = null;
  inFlightFetch = null;
}

async function connectAndListChannels(): Promise<LiveChannel[]> {
  return withTeamSpeakConnection(async (ts3) => {
    // ts3.channelList() already requests the -banner flag internally, so
    // every returned channel's .bannerGfxUrl getter is populated without
    // any extra ServerQuery call.
    const channels = await ts3.channelList();
    const result = channels.map(toLiveChannel);
    logger.log(`[fetchLiveChannels] Found ${result.length} channel(s).`);
    return result;
  });
}

/**
 * The banner URL a channel *should* have if its banner is managed by this
 * system: this server's public base URL plus the same `/images/:channelName`
 * path the public app actually serves (see images.controller.public.ts) —
 * `normalizeChannelName()` is the single source of truth for turning a raw
 * TeamSpeak channel name into that URL slug, reused here rather than
 * reimplemented.
 *
 * Always ends in `.png`: TeamSpeak 6 only renders a channel banner from a
 * URL with a recognized image file extension -- it doesn't consult the
 * response's `Content-Type` header at all, unlike a browser. Every stored
 * image is always re-encoded to canonical PNG by `processImageForStorage()`
 * regardless of what was uploaded, so this suffix is never a lie. The
 * public route strips it back off before doing the actual channel lookup
 * (see `images.controller.public.ts`'s `getImage()`), so this is purely a
 * URL-shape concern, not a real second file extension living anywhere.
 */
export function expectedBannerUrl(
  channelName: string,
  publicBaseUrl: string,
): string {
  return `${publicBaseUrl}/images/${normalizeChannelName(channelName)}.png`;
}

/** Whether a channel's current banner URL already matches what we'd set it to. */
export function isManagedByUs(
  channel: LiveChannel,
  publicBaseUrl: string,
): boolean {
  return (
    channel.bannerGfxUrl === expectedBannerUrl(channel.name, publicBaseUrl)
  );
}

/**
 * Sets a single channel's TeamSpeak banner URL. `channelEdit` is a thin
 * pass-through to the `channeledit` ServerQuery command -- it accepts
 * whatever properties it's given. `Props.ChannelEdit` doesn't declare
 * `channelBannerGfxUrl` (the installed library's typings are out of date
 * here), so the cast below is required to compile; it works correctly at
 * runtime regardless, since `channelEdit` doesn't validate property names
 * against its own type.
 */
export async function setChannelBannerUrl(
  cid: string,
  url: string,
): Promise<void> {
  await withTeamSpeakConnection(async (ts3) => {
    await ts3.channelEdit(cid, {
      channelBannerGfxUrl: url,
    } as Props.ChannelEdit & {
      channelBannerGfxUrl: string;
    });
  });
  invalidateLiveChannelsCache();
}

export interface ApplyBannerUrlsResult {
  updated: string[];
  alreadyManaged: string[];
}

/**
 * Sets the banner URL on every live channel that isn't already pointed at
 * our own managed image. Deliberately does its own connect/list/edit/quit
 * in a single connection (rather than combining the already-exported
 * `fetchLiveChannels()`/`setChannelBannerUrl()` in a loop, which would open
 * one connection to read the list plus one more per channel that needs
 * updating) -- a bulk "apply to every channel" action is exactly the case
 * where opening a fresh connection per channel would be wasteful.
 */
export async function applyBannerUrlsForAllChannels(
  publicBaseUrl: string,
): Promise<ApplyBannerUrlsResult> {
  const result = await withTeamSpeakConnection(async (ts3) => {
    const channels = (await ts3.channelList()).map(toLiveChannel);
    const updated: string[] = [];
    const alreadyManaged: string[] = [];

    for (const channel of channels) {
      if (isManagedByUs(channel, publicBaseUrl)) {
        alreadyManaged.push(channel.name);
        continue;
      }
      const url = expectedBannerUrl(channel.name, publicBaseUrl);
      await ts3.channelEdit(channel.cid, {
        channelBannerGfxUrl: url,
      } as Props.ChannelEdit & {
        channelBannerGfxUrl: string;
      });
      updated.push(channel.name);
    }

    logger.log(
      `[applyBannerUrlsForAllChannels] Updated ${updated.length}, already managed ${alreadyManaged.length}.`,
    );
    return { updated, alreadyManaged };
  });
  invalidateLiveChannelsCache();
  return result;
}
