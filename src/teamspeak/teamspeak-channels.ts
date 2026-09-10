import { Injectable, Logger } from "@nestjs/common";
import { TeamSpeak, QueryProtocol } from "ts3-nodejs-library";
import {
  TS_HOST,
  TS_QUERY_PORT,
  TS_SERVER_PORT,
  TS_PROTOCOL,
  getTeamSpeakCredentials,
} from "../../config";
import type { TsProtocol } from "../../config";
import { normalizeChannelName } from "../util/util";
import { runTeamSpeakOperation } from "./teamspeak-transport";

const PROTOCOL_MAP: Record<TsProtocol, (typeof QueryProtocol)[keyof typeof QueryProtocol]> = {
  raw: QueryProtocol.RAW,
  ssh: QueryProtocol.SSH,
};
const logger = new Logger("TeamSpeakChannels");
const CACHE_TTL_MS = 30_000;

export interface LiveChannel {
  cid: string;
  name: string;
  /** Current TeamSpeak banner URL; null when unset. */
  bannerGfxUrl: string | null;
  /** Parent CID; TeamSpeak's top-level "0" is normalized to null. */
  pid: string | null;
}

/** Opens one bounded connection and closes it on success, failure or timeout. */
export async function withTeamSpeakConnection<T>(fn: (ts3: TeamSpeak) => Promise<T>): Promise<T> {
  const { username, password } = getTeamSpeakCredentials();
  const ts3 = new TeamSpeak({
    host: TS_HOST,
    queryport: TS_QUERY_PORT,
    serverport: TS_SERVER_PORT,
    protocol: PROTOCOL_MAP[TS_PROTOCOL],
    username,
    password,
    autoConnect: false,
  });
  ts3.on("error", (err) => {
    logger.error("[TeamSpeak] client error", err instanceof Error ? err.name : "UnknownError");
  });
  return runTeamSpeakOperation(ts3, fn);
}

function toLiveChannel(c: {
  cid: string;
  name: string;
  bannerGfxUrl?: string;
  pid?: string;
}): LiveChannel {
  return {
    cid: c.cid,
    name: c.name,
    bannerGfxUrl: c.bannerGfxUrl || null,
    pid: c.pid && c.pid !== "0" ? c.pid : null,
  };
}

/** Lists on a caller-owned connection; channelList already requests banner properties. */
export async function listChannelsOnConnection(ts3: TeamSpeak): Promise<LiveChannel[]> {
  return (await ts3.channelList()).map(toLiveChannel);
}

export interface ApplyBannerUrlsResult {
  updated: string[];
  alreadyManaged: string[];
  failed: { cid: string; error: string }[];
}

/** One cache per application provider; independent Nest contexts never share channel state. */
@Injectable()
export class TeamSpeakChannelsService {
  private cachedResult: { data: LiveChannel[]; expiresAt: number } | null = null;
  private inFlightFetch: Promise<LiveChannel[]> | null = null;
  private cacheGeneration = 0;

  withConnection<T>(fn: (ts3: TeamSpeak) => Promise<T>): Promise<T> {
    return withTeamSpeakConnection(fn);
  }

  /** Deduplicates concurrent reads and caches successful snapshots for at most 30 seconds. */
  fetchLiveChannels(): Promise<LiveChannel[]> {
    if (this.cachedResult && this.cachedResult.expiresAt > Date.now()) {
      return Promise.resolve(this.cachedResult.data);
    }
    if (!this.inFlightFetch) {
      const generation = this.cacheGeneration;
      const pending = this.withConnection(listChannelsOnConnection)
        .then((result) => {
          if (generation === this.cacheGeneration) {
            this.cachedResult = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
          }
          return result;
        })
        .finally(() => {
          if (this.inFlightFetch === pending) this.inFlightFetch = null;
        });
      this.inFlightFetch = pending;
    }
    return this.inFlightFetch;
  }

  /** Fences outstanding reads so a response started before a mutation cannot repopulate the cache. */
  invalidateCache(): void {
    this.cacheGeneration++;
    this.cachedResult = null;
    this.inFlightFetch = null;
  }

  async setChannelBannerUrl(cid: string, url: string): Promise<void> {
    try {
      await this.withConnection(async (ts3) => {
        await ts3.channelEdit(cid, { channelBannerGfxUrl: url });
      });
    } finally {
      this.invalidateCache();
    }
  }

  /** Applies a fresh live snapshot on one connection, preserving individual failure results. */
  async applyBannerUrlsForAllChannels(publicBaseUrl: string): Promise<ApplyBannerUrlsResult> {
    try {
      return await this.withConnection(async (ts3) => {
        const channels = await listChannelsOnConnection(ts3);
        const updated: string[] = [];
        const alreadyManaged: string[] = [];
        const failed: { cid: string; error: string }[] = [];
        for (const channel of channels) {
          if (isManagedByUs(channel, publicBaseUrl)) {
            alreadyManaged.push(channel.name);
            continue;
          }
          try {
            await ts3.channelEdit(channel.cid, {
              channelBannerGfxUrl: expectedBannerUrlForId(channel.cid, publicBaseUrl),
            });
            updated.push(channel.name);
          } catch (error) {
            failed.push({
              cid: channel.cid,
              error: error instanceof Error ? error.message : "Channel update failed",
            });
          }
        }
        return { updated, alreadyManaged, failed };
      });
    } finally {
      this.invalidateCache();
    }
  }
}

/** Counts parent hops; a null or absent CID represents the level above top-level channels. */
export function computeChannelDepth(
  cid: string | null,
  channels: LiveChannel[] | Map<string, LiveChannel>,
): number {
  if (cid === null) return -1;
  const byId = channels instanceof Map ? channels : new Map(channels.map((c) => [c.cid, c]));
  let depth = 0;
  let current = byId.get(cid);
  if (!current) return -1;
  const visited = new Set<string>([current.cid]);
  while (current.pid !== null) {
    if (visited.has(current.pid)) throw new Error("Cyclic TeamSpeak channel tree");
    visited.add(current.pid);
    depth++;
    current = byId.get(current.pid);
    if (!current) break;
  }
  return depth;
}

/** Legacy name-based URL retained for existing banners; new assignments use the stable CID. */
export function expectedBannerUrl(channelName: string, publicBaseUrl: string): string {
  return `${publicBaseUrl}/images/${normalizeChannelName(channelName)}.png`;
}
export function expectedBannerUrlForId(cid: string, publicBaseUrl: string): string {
  return `${publicBaseUrl}/images/by-id/${encodeURIComponent(cid)}.png`;
}
export function isManagedByUs(channel: LiveChannel, publicBaseUrl: string): boolean {
  return channel.bannerGfxUrl === expectedBannerUrlForId(channel.cid, publicBaseUrl);
}
