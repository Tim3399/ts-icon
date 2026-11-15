import { channelImageUrl } from "../api/channels";
import type { Channel } from "../api/types";

/** A channel's banner as the live tree shows it: its own image, else its banner URL, else none. */
export function channelBanner(channel: Channel) {
  return channel.hasImage ? channelImageUrl(channel) : (channel.bannerGfxUrl ?? null);
}
