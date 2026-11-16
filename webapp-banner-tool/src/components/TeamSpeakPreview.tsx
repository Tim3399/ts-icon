import { useEffect, useRef, useState } from "react";
import type { Channel } from "../api/types";
import { channelBanner } from "./channelBanner";
import { scrollWithin } from "./scrollWithin";
import { ChannelTreeRow } from "./ChannelTreeRow";
import { TEAMSPEAK_GEOMETRY } from "./teamspeakGeometry";
import "./TeamSpeakPreview.css";

interface TeamSpeakPreviewProps {
  channels: Channel[];
  /** The channel being edited; its row shows `banner`. */
  selected?: Channel;
  /** What the edited row shows: the live crop, else its current banner, else nothing. */
  banner: string | null;
  /** Alt text for the edited row's banner. */
  bannerAlt?: string;
  /** Marker after the edited row's name ("New" while the crop is unsaved). */
  marker?: string;
  /** When it changes, the edited row is scrolled into the middle of the preview. */
  focusKey?: string;
}

/** True while the TS6-width tree is wider than its column (narrow screens). */
function useOverflow(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [dependency]);
  return [ref, overflow] as const;
}

/**
 * The whole channel tree in a TeamSpeak 6 client mock (T-142-F3 item 7): the
 * live tree's ChannelTreeRow at the TS6 client size (D-10), so the edited
 * banner is cropped and scaled into its pill the way TS6 draws it, between
 * its real neighbours. The tree is never scaled: on a narrow screen it
 * scrolls sideways inside the preview, so names stay at their TS6 size
 * (item 12). A long tree keeps all rows in a bounded scroll area, and the
 * edited row is scrolled into its middle on a channel select and when a crop
 * starts (T-142-F4, F-142-32).
 */
export function TeamSpeakPreview({
  channels,
  selected,
  banner,
  bannerAlt = "",
  marker,
  focusKey,
}: TeamSpeakPreviewProps) {
  const [scroller, overflow] = useOverflow(channels.length);
  useEffect(() => {
    scrollWithin(scroller.current?.querySelector<HTMLElement>(".ts-preview-selected"));
  }, [focusKey, channels.length, scroller]);
  return (
    <div className="ts-preview-stack">
      <figure className="ts-preview" aria-label="Preview in TeamSpeak">
        <div className="ts-preview-scroll" ref={scroller}>
          <ul className="ts-preview-tree" style={{ width: TEAMSPEAK_GEOMETRY.treeWidth }}>
            {channels.map((channel, at) => {
              const isSelected = channel.cid === selected?.cid;
              return (
                <ChannelTreeRow
                  key={channel.cid}
                  name={channel.name}
                  depth={channel.depth}
                  isSpacer={Boolean(channel.isSpacer)}
                  hasChildren={(channels[at + 1]?.depth ?? -1) > channel.depth}
                  image={isSelected ? banner : channelBanner(channel)}
                  imageAlt={isSelected && banner ? bannerAlt : ""}
                  marker={isSelected ? marker : undefined}
                  className={isSelected ? "ts-preview-selected" : undefined}
                />
              );
            })}
          </ul>
        </div>
      </figure>
      {overflow && (
        <p className="ts-preview-note">
          The rows keep their TeamSpeak size; scroll sideways to see them whole.
        </p>
      )}
    </div>
  );
}
