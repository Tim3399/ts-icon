import { Logger } from '@nestjs/common';
import { TeamSpeak } from 'ts3-nodejs-library';
import type * as Props from 'ts3-nodejs-library/lib/types/PropertyTypes';
import {
  withTeamSpeakConnection,
  invalidateLiveChannelsCache,
} from './teamspeak-channels';

const logger = new Logger('TeamSpeakChannelAdmin');

export interface CreateManagedChannelParams {
  parentCid: string | null;
  name: string;
  /** cid to sort this channel right under, or null to sort first. */
  orderAfterCid: string | null;
  bannerUrl: string;
}

/**
 * Creates a single permanent channel with its banner URL already set at
 * creation time. `channelBannerGfxUrl`'s value is deterministic from the
 * channel name alone (see `expectedBannerUrl()`), so it doesn't need to wait
 * for the image to be sliced/stored -- passing it here instead of a
 * follow-up `channelEdit()` halves the ServerQuery round-trips per row.
 *
 * `channelFlagPermanent: true` is required -- a channel created without it
 * is temporary and disappears once empty. Takes an already-open `ts3`
 * (caller owns the connection lifecycle) so a whole generation run of many
 * rows is one connection, not one per row -- same reasoning as
 * `applyBannerUrlsForAllChannels` in `teamspeak-channels.ts`.
 *
 * `Props.ChannelEdit` already declares `cpid`/`channelOrder`/
 * `channelFlagPermanent` (unlike `channelBannerGfxUrl`, which needs the same
 * intersection-cast trick `setChannelBannerUrl` uses), so only that one
 * property needs the cast. `channelOrder` is declared as `number`, even
 * though what it actually holds is a channel's cid (every cid elsewhere in
 * this codebase, e.g. `LiveChannel.cid`, is a `string`) -- converted with
 * `Number()` here rather than folded into the same cast, since the value is
 * genuinely numeric and this keeps the one remaining cast limited to the
 * property that's actually missing from the library's types.
 */
export async function createManagedChannel(
  ts3: TeamSpeak,
  params: CreateManagedChannelParams,
): Promise<{ cid: string; name: string }> {
  const channel = await ts3.channelCreate(params.name, {
    cpid: params.parentCid ?? '0',
    channelOrder:
      params.orderAfterCid !== null ? Number(params.orderAfterCid) : undefined,
    channelFlagPermanent: true,
    channelBannerGfxUrl: params.bannerUrl,
  } as Props.ChannelEdit & { channelBannerGfxUrl: string });
  return { cid: channel.cid, name: channel.name };
}

export interface DeleteManagedChannelsResult {
  deleted: string[];
  failed: { cid: string; error: string }[];
}

/**
 * Deletes each given channel by cid, tolerant of individual failures (e.g.
 * a channel already deleted by someone else) so one bad cid doesn't abort
 * the whole cleanup -- the "undo a bad generation run" primitive. Opens its
 * own single connection for the whole batch.
 */
export async function deleteManagedChannels(
  cids: string[],
): Promise<DeleteManagedChannelsResult> {
  const result = await withTeamSpeakConnection(async (ts3) => {
    const deleted: string[] = [];
    const failed: { cid: string; error: string }[] = [];
    for (const cid of cids) {
      try {
        await ts3.channelDelete(cid, true);
        deleted.push(cid);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[deleteManagedChannels] Failed to delete ${cid}: ${message}`,
        );
        failed.push({ cid, error: message });
      }
    }
    return { deleted, failed };
  });
  invalidateLiveChannelsCache();
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
 * Creates every slice's channel in order on a single already-open
 * connection. `slice.depth` is relative to `parentCid` (0 = direct child of
 * it), and rows are reconstructed into a tree the same way an indented
 * outline is: a row at depth d parents under the most recently created row
 * at depth d-1 (or `parentCid` itself at depth 0) -- this is what lets the
 * "nested spacer" preset put each spacer under the specific art channel
 * right before it, rather than under the fixed batch root. Sibling order
 * within a parent chains from the previous row created under that same
 * parent, so rows land top-to-bottom in the tree exactly as sliced.
 *
 * Real ServerQuery has no transactions -- on a mid-batch failure this stops
 * and reports which rows succeeded/failed rather than attempting a
 * rollback; the caller can retry or use `deleteManagedChannels()` to clean
 * up the partial result.
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
      logger.error(
        `[createChannelWallpaper] Failed to create "${slice.name}": ${message}`,
      );
      return { created, failedAt: { name: slice.name, error: message } };
    }
  }

  return { created };
}
