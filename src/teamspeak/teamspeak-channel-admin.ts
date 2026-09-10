import { Logger } from "@nestjs/common";
import { TeamSpeak } from "ts3-nodejs-library";
import { TeamSpeakChannelsService } from "./teamspeak-channels";

const logger = new Logger("TeamSpeakChannelAdmin");

export interface CreateManagedChannelParams {
  parentCid: string | null;
  name: string;
  /** cid to sort this channel right under, or null to sort first. */
  orderAfterCid: string | null;
  bannerUrl: string;
  description?: string;
}

/** Creates a permanent channel with its provisional run URL and optional ownership marker.
 * The caller owns the bounded connection and any persistence/recovery around the command.
 */
export async function createManagedChannel(
  ts3: TeamSpeak,
  params: CreateManagedChannelParams,
): Promise<{ cid: string; name: string }> {
  const channel = await ts3.channelCreate(params.name, {
    cpid: params.parentCid ?? "0",
    channelOrder: params.orderAfterCid !== null ? Number(params.orderAfterCid) : undefined,
    channelFlagPermanent: true,
    channelBannerGfxUrl: params.bannerUrl,
    ...(params.description ? { channelDescription: params.description } : {}),
  });
  return { cid: channel.cid, name: channel.name };
}

export interface DeleteManagedChannelsResult {
  deleted: string[];
  failed: { cid: string; error: string }[];
}

/**
 * Low-level batch deletion on one connection, reporting individual failures.
 * Durable wallpaper undo uses ChannelWallpaperService's ownership checks instead.
 */
export async function deleteManagedChannels(
  channels: TeamSpeakChannelsService,
  cids: string[],
): Promise<DeleteManagedChannelsResult> {
  const result = await channels.withConnection(async (ts3) => {
    const deleted: string[] = [];
    const failed: { cid: string; error: string }[] = [];
    for (const cid of cids) {
      try {
        await ts3.channelDelete(cid, false);
        deleted.push(cid);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[deleteManagedChannels] Failed to delete ${cid}: ${message}`);
        failed.push({ cid, error: message });
      }
    }
    return { deleted, failed };
  });
  channels.invalidateCache();
  return result;
}

export interface WallpaperChannelSlice {
  name: string;
  bannerUrl: string;
  depth: number;
  isSpacer: boolean;
}

export interface CreatedWallpaperChannel {
  cid: string;
  name: string;
  depth: number;
  isSpacer: boolean;
}

export interface CreateChannelWallpaperResult {
  created: CreatedWallpaperChannel[];
  failedAt?: { name: string; error: string };
}

/**
 * Low-level ordered creation on a caller-owned connection. Depth is relative
 * to parentCid; each deeper row attaches to the latest row one level above.
 * Stops on the first failure. This helper has no persistence or retry safety;
 * application workflows use ChannelWallpaperService's durable run protocol.
 */
export async function createChannelWallpaper(
  ts3: TeamSpeak,
  parentCid: string | null,
  slices: WallpaperChannelSlice[],
): Promise<CreateChannelWallpaperResult> {
  const created: CreatedWallpaperChannel[] = [];
  // cid to use as `cpid` for a row at a given depth -- depth 0 always
  // parents under the fixed batch root; deeper depths parent under
  // whichever row was most recently created one level shallower.
  const parentCidByDepth = new Map<number, string | null>([[0, parentCid]]);
  // Most recently created sibling's cid at each depth, so the next row at
  // that depth sorts directly after it instead of always being inserted
  // first. Reset for depths below any newly created row, since that row
  // starts a fresh (empty) subtree -- without this, a depth like 1 could
  // otherwise carry over a sibling cid from underneath a *different*
  // parent higher up in a previous row.
  const lastSiblingCidByDepth = new Map<number, string>();

  for (const slice of slices) {
    const depth = slice.depth;
    // Falls back to the batch root if a row plan ever produced a depth
    // whose immediate parent depth wasn't created yet -- shouldn't happen
    // given how buildAlternatingRowPlan() only ever steps depth by +1 at a
    // time, but keeps this function from crashing on a malformed plan.
    const actualParentCid = parentCidByDepth.get(depth) ?? parentCid;

    try {
      const channel = await createManagedChannel(ts3, {
        parentCid: actualParentCid,
        name: slice.name,
        orderAfterCid: lastSiblingCidByDepth.get(depth) ?? null,
        bannerUrl: slice.bannerUrl,
      });

      lastSiblingCidByDepth.set(depth, channel.cid);
      parentCidByDepth.set(depth + 1, channel.cid);
      for (const key of [...lastSiblingCidByDepth.keys()]) {
        if (key > depth) lastSiblingCidByDepth.delete(key);
      }
      for (const key of [...parentCidByDepth.keys()]) {
        if (key > depth + 1) parentCidByDepth.delete(key);
      }

      created.push({
        cid: channel.cid,
        name: channel.name,
        depth,
        isSpacer: slice.isSpacer,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[createChannelWallpaper] Failed to create "${slice.name}": ${message}`);
      return { created, failedAt: { name: slice.name, error: message } };
    }
  }

  return { created };
}
