import { API_URL, VIEW_IMAGE_URL } from "../config";
import type { Channel } from "./types";
export const channelImageEndpoint = (cid: string) =>
  `${API_URL}channels/${encodeURIComponent(cid)}/image`;
export const channelBannerEndpoint = (cid: string) =>
  `${API_URL}channels/${encodeURIComponent(cid)}/banner-url`;
export function channelImageUrl(channel: Channel, revision?: string | number): string {
  const base = channel.imageUrl || `${VIEW_IMAGE_URL}by-id/${encodeURIComponent(channel.cid)}.png`;
  const version = revision ?? channel.contentHash;
  return version
    ? `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`
    : base;
}
