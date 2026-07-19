import { normalizeChannelName } from '../util/util';
import { LiveChannel } from './teamspeak-channels';

export interface ChannelImageRowForMatching {
  channelName: string;
}

export interface ChannelIdMatch {
  channelName: string;
  channelId: string;
}

export interface ChannelIdMatchResult {
  matched: ChannelIdMatch[];
  unmatched: string[];
}

/**
 * Pure matching logic for the channel-ID backfill (see
 * scripts/backfill-channel-ids.ts): given existing ChannelImage rows
 * (identified only by their stored, already-normalized channelName) and the
 * current live TeamSpeak channel list, finds the live channel whose
 * normalized name equals each row's channelName and pairs it with that
 * channel's stable ID.
 *
 * Rows with no live match at all (the channel was renamed or deleted since
 * the image was uploaded) are returned separately in `unmatched` rather than
 * guessed at — the caller decides what to do with them, typically just
 * reporting them for manual review.
 *
 * Kept free of any I/O (no database, no network) so it can be exercised
 * directly in tests without a live TeamSpeak connection or a database.
 */
export function matchChannelIdsToRows(
  rows: ChannelImageRowForMatching[],
  liveChannels: LiveChannel[],
): ChannelIdMatchResult {
  const liveByNormalizedName = new Map<string, LiveChannel>();
  for (const channel of liveChannels) {
    liveByNormalizedName.set(normalizeChannelName(channel.name), channel);
  }

  const matched: ChannelIdMatch[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const liveMatch = liveByNormalizedName.get(row.channelName);
    if (liveMatch) {
      matched.push({ channelName: row.channelName, channelId: liveMatch.cid });
    } else {
      unmatched.push(row.channelName);
    }
  }

  return { matched, unmatched };
}
