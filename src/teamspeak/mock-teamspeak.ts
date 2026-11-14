import { Logger } from "@nestjs/common";
import type { TeamSpeak } from "ts3-nodejs-library";

const logger = new Logger("MockTeamSpeak");

interface MockChannel {
  cid: string;
  name: string;
  /** "0" for a top-level channel, matching real ServerQuery's own convention. */
  pid: string;
  bannerGfxUrl?: string;
  description?: string;
}

function seedChannels(): MockChannel[] {
  return [
    { cid: "1", name: "Welcome", pid: "0" },
    { cid: "2", name: "Lobby", pid: "0" },
    { cid: "3", name: "Gaming", pid: "0" },
    { cid: "4", name: "General Chat", pid: "3" },
    { cid: "5", name: "AFK", pid: "3" },
    // Spacer naming convention (util.ts), no banner of its own.
    { cid: "6", name: "Spacer 1", pid: "0" },
  ];
}

/**
 * Module-level (not per-connection) so state persists across the many short-lived
 * "connections" the app opens via withTeamSpeakConnection(), like a real server's
 * channel tree surviving across ServerQuery sessions. Reset by process restart.
 */
let channels: MockChannel[] = seedChannels();
let nextCid = 7;

/** Restores the seed channel tree. Exported for tests only. */
export function resetMockTeamSpeakState(): void {
  channels = seedChannels();
  nextCid = 7;
}

/**
 * Inserts at the sibling position real ServerQuery's channelOrder would produce:
 * no anchor sorts first among that parent's existing children, an anchor places
 * the channel right after it.
 */
function insertWithOrder(channel: MockChannel, orderAfterCid: string | null): void {
  if (orderAfterCid === null) {
    const firstSiblingIndex = channels.findIndex((c) => c.pid === channel.pid);
    if (firstSiblingIndex === -1) channels.push(channel);
    else channels.splice(firstSiblingIndex, 0, channel);
    return;
  }
  const afterIndex = channels.findIndex((c) => c.cid === orderAfterCid);
  channels.splice(afterIndex === -1 ? channels.length : afterIndex + 1, 0, channel);
}

/** Real channellist returns tree-display order: parents before children, siblings in order. */
function orderedChannelList(): MockChannel[] {
  const byParent = new Map<string, MockChannel[]>();
  for (const c of channels) {
    const siblings = byParent.get(c.pid) ?? [];
    siblings.push(c);
    byParent.set(c.pid, siblings);
  }
  const result: MockChannel[] = [];
  function visit(pid: string): void {
    for (const c of byParent.get(pid) ?? []) {
      result.push(c);
      visit(c.cid);
    }
  }
  visit("0");
  return result;
}

function readStringProp(props: Record<string, unknown>, key: string): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
}

function readCpid(props: Record<string, unknown>): string {
  const value = props.cpid;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "0";
}

/**
 * An in-memory stand-in for the part of the TeamSpeak client the app uses through
 * withTeamSpeakConnection(): the transport lifecycle (on, connect, quit, forceQuit),
 * execute("channellist") and channelCreate/channelEdit/channelInfo/channelDelete.
 * Not a real TeamSpeak instance, hence the cast.
 */
export function createMockTeamSpeak(): TeamSpeak {
  const mock: object = {
    on(): object {
      // The mock never emits events.
      return mock;
    },

    connect(): Promise<object> {
      return Promise.resolve(mock);
    },

    quit(): Promise<void> {
      logger.log("quit() -- in-memory state persists for the next connection.");
      return Promise.resolve();
    },

    forceQuit(): void {
      // Nothing to close.
    },

    execute(command: string): Promise<unknown[]> {
      if (command !== "channellist") {
        return Promise.reject(new Error(`MockTeamSpeak: unsupported command ${command}`));
      }
      return Promise.resolve(
        orderedChannelList().map((c) => ({
          cid: c.cid,
          pid: c.pid,
          channelName: c.name,
          channelBannerGfxUrl: c.bannerGfxUrl,
        })),
      );
    },

    channelCreate(
      name: string,
      props: Record<string, unknown> = {},
    ): Promise<{ cid: string; name: string }> {
      const cid = String(nextCid++);
      const pid = readCpid(props);
      const channel: MockChannel = {
        cid,
        name,
        pid,
        bannerGfxUrl: readStringProp(props, "channelBannerGfxUrl"),
        description: readStringProp(props, "channelDescription"),
      };
      const channelOrder = props.channelOrder;
      const orderAfterCid =
        typeof channelOrder === "number" && channelOrder !== 0 ? String(channelOrder) : null;
      insertWithOrder(channel, orderAfterCid);
      logger.log(`Created channel "${name}" (cid ${cid}, pid ${pid}).`);
      return Promise.resolve({ cid, name });
    },

    channelEdit(cid: string, props: Record<string, unknown> = {}): Promise<void> {
      const channel = channels.find((c) => c.cid === cid);
      if (!channel) return Promise.reject(new Error(`MockTeamSpeak: no channel with cid ${cid}`));
      const bannerGfxUrl = readStringProp(props, "channelBannerGfxUrl");
      if (bannerGfxUrl !== undefined) channel.bannerGfxUrl = bannerGfxUrl;
      const description = readStringProp(props, "channelDescription");
      if (description !== undefined) channel.description = description;
      return Promise.resolve();
    },

    channelInfo(cid: string): Promise<{ channelDescription: string }> {
      const channel = channels.find((c) => c.cid === cid);
      if (!channel) return Promise.reject(new Error(`MockTeamSpeak: no channel with cid ${cid}`));
      return Promise.resolve({ channelDescription: channel.description ?? "" });
    },

    channelDelete(cid: string, force?: boolean): Promise<void> {
      if (!channels.some((c) => c.cid === cid)) {
        return Promise.reject(new Error(`MockTeamSpeak: no channel with cid ${cid}`));
      }
      if (channels.some((c) => c.pid === cid) && !force) {
        return Promise.reject(
          new Error(`MockTeamSpeak: channel ${cid} has subchannels (pass force to delete anyway)`),
        );
      }
      const toDelete = new Set([cid]);
      let added = true;
      while (added) {
        added = false;
        for (const c of channels) {
          if (toDelete.has(c.pid) && !toDelete.has(c.cid)) {
            toDelete.add(c.cid);
            added = true;
          }
        }
      }
      channels = channels.filter((c) => !toDelete.has(c.cid));
      return Promise.resolve();
    },
  };

  return mock as unknown as TeamSpeak;
}
