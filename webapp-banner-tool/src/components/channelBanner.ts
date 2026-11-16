import { channelImageUrl } from "../api/channels";
import type { Channel } from "../api/types";

/**
 * A channel's banner as the live tree shows it: its own image, or the spacer
 * base image of a spacer without one (`hasFallback`, served by the same
 * by-id URL – T-142-F4, F-142-31), else its banner URL, else none.
 */
export function channelBanner(channel: Channel, revision?: string | number) {
  return channel.hasImage || channel.hasFallback
    ? channelImageUrl(channel, revision)
    : (channel.bannerGfxUrl ?? null);
}
