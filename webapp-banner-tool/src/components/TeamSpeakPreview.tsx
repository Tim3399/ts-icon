import { channelImageUrl } from "../api/channels";
import type { Channel } from "../api/types";
import { EmptyState } from "../design";
import { ChannelTreeRow } from "./ChannelTreeRow";
import "./TeamSpeakPreview.css";

interface TeamSpeakPreviewProps {
  channels: Channel[];
  selected?: Channel;
  /** The exported crop (exportBanner); null before an image is framed. */
  banner: string | null;
  /** The channel's saved banner, shown until a crop exists. */
  savedBanner: string | null;
}

/** A neighbour's banner as the live tree shows it. */
function bannerOf(channel: Channel) {
  return channel.hasImage ? channelImageUrl(channel) : (channel.bannerGfxUrl ?? null);
}

/**
 * The selected channel in a TeamSpeak channel-tree mock, with its real
 * neighbours from the channel list as context (T-142-F1 item 14). The rows
 * are the live tree's ChannelTreeRow at the banner's exact 500 x 44 size.
 */
export function TeamSpeakPreview({
  channels,
  selected,
  banner,
  savedBanner,
}: TeamSpeakPreviewProps) {
  const index = selected ? channels.findIndex((c) => c.cid === selected.cid) : -1;
  if (!selected || index < 0)
    return (
      <EmptyState
        icon="tree"
        title="Choose a channel to see how its banner looks in TeamSpeak."
        className="ts-preview-empty"
      />
    );
  const shown = channels.slice(Math.max(0, index - 1), index + 2);
  const minDepth = Math.min(...shown.map((c) => c.depth));
  const image = banner ?? savedBanner;
  return (
    <figure className="ts-preview" aria-label="Preview in TeamSpeak">
      <ul className="ts-preview-tree">
        {shown.map((channel) => {
          const at = channels.indexOf(channel);
          const isSelected = channel.cid === selected.cid;
          return (
            <ChannelTreeRow
              key={channel.cid}
              name={channel.name}
              depth={channel.depth - minDepth}
              isSpacer={Boolean(channel.isSpacer)}
              hasChildren={(channels[at + 1]?.depth ?? -1) > channel.depth}
              image={isSelected ? image : bannerOf(channel)}
              imageAlt={
                isSelected && image
                  ? `${banner ? "Cropped" : "Current"} banner for ${channel.name}`
                  : ""
              }
              className={isSelected ? "ts-preview-selected" : "ts-preview-context"}
              exact
            />
          );
        })}
      </ul>
    </figure>
  );
}
