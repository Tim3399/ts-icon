import { useEffect, useRef, useState } from "react";
import { channelImageUrl } from "../api/channels";
import type { Channel } from "../api/types";
import { EmptyState } from "../design";
import { BANNER_HEIGHT, BANNER_WIDTH } from "./bannerExport";
import { ChannelTreeRow } from "./ChannelTreeRow";
import { TEAMSPEAK_GEOMETRY } from "./teamspeakGeometry";
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
 * Below the TS6 tree width the whole mock is scaled down proportionally
 * (CSS zoom), so it keeps the client's proportions on narrow screens.
 */
function useFitScale(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = getComputedStyle(element);
      const available =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setScale(Math.min(1, available / TEAMSPEAK_GEOMETRY.treeWidth));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [active]);
  return [ref, scale] as const;
}

/**
 * The selected channel in a TeamSpeak 6 channel-tree mock, with its real
 * neighbours from the channel list as context (T-142-F1 item 14, addendum 4).
 * The rows are the live tree's ChannelTreeRow at the TS6 client size: the
 * banner is cropped and scaled into the pill the way TS6 draws it. The exact
 * saved pixels follow below at 1:1.
 */
export function TeamSpeakPreview({
  channels,
  selected,
  banner,
  savedBanner,
}: TeamSpeakPreviewProps) {
  const index = selected ? channels.findIndex((c) => c.cid === selected.cid) : -1;
  const [figure, scale] = useFitScale(index >= 0);
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
    <div className="ts-preview-stack">
      <figure ref={figure} className="ts-preview" aria-label="Preview in TeamSpeak">
        <ul
          className="ts-preview-tree"
          style={{ width: TEAMSPEAK_GEOMETRY.treeWidth, zoom: scale < 1 ? scale : undefined }}
        >
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
                className={isSelected ? "ts-preview-selected" : undefined}
              />
            );
          })}
        </ul>
      </figure>
      {scale < 1 && (
        <p className="ts-preview-note">
          Scaled down to fit this screen; TeamSpeak shows it larger.
        </p>
      )}
      {banner && (
        <div className="ts-preview-saved">
          <p className="ts-preview-note">
            Saved image ({BANNER_WIDTH} × {BANNER_HEIGHT})
          </p>
          <img
            className="ts-preview-saved-image"
            src={banner}
            alt={`Saved image for ${selected.name}, ${BANNER_WIDTH} × ${BANNER_HEIGHT} pixels`}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
          />
        </div>
      )}
    </div>
  );
}
