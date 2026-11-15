import { useState, type CSSProperties } from "react";
import { Button, Icon } from "../design";
import { TEAMSPEAK_GEOMETRY, TEAMSPEAK_GEOMETRY_STYLE } from "./teamspeakGeometry";
import "./ChannelTreeRow.css";

type BannerState = "loading" | "loaded" | "failed";

export interface ChannelTreeRowProps {
  name: string;
  /** Tree depth; the row indents itself by it, right edges stay aligned. */
  depth: number;
  /** Banner drawn over the whole pill, or none. */
  image?: string | null;
  isSpacer?: boolean;
  /** The channel has sub-channels right below it (a parent). */
  hasChildren?: boolean;
  /** Alt text for the banner; empty by default because the name is the row's text. */
  imageAlt?: string;
  /** A not-yet-created row from a page's PreviewOverlay. */
  pending?: boolean;
  /** Shown as the chosen row of a selectable tree. */
  selected?: boolean;
  /** Makes the row a button (the Wallpaper parent picker). */
  onSelect?: () => void;
  /** Lazy-load the banner (long trees). */
  lazy?: boolean;
  className?: string;
}

/**
 * One row of the TeamSpeak 6 channel tree, shared by the live tree, the
 * Wallpaper parent picker and the Banner editor's TeamSpeak preview. It uses
 * the TS6 client geometry (teamspeakGeometry.ts): a 30 px pill whose banner
 * covers it without a fade, the name on top, 10 px indent per depth with the
 * right edges aligned, a 44 px row pitch.
 *
 * The kind follows the real channel and the banner's load state, never the
 * mere presence of an image URL (T-142-F1 C2, C3):
 * - a spacer shows only its banner once it has loaded; without a banner (no
 *   image, or the image fails) it shows its name;
 * - a parent channel is a group (bold label over the banner) only while its
 *   banner has loaded; otherwise it is a normal channel row with its icon.
 *
 * The row (li) is one pitch tall and the pill sits centred in it. A
 * selectable row's button fills the whole row, so its hit target is the
 * 44 px pitch, not the 30 px pill.
 */
export function ChannelTreeRow({
  name,
  depth,
  image,
  isSpacer = false,
  hasChildren = false,
  imageAlt = "",
  pending = false,
  selected = false,
  onSelect,
  lazy = false,
  className,
}: ChannelTreeRowProps) {
  const [banner, setBanner] = useState<{ src: string; state: BannerState }>();
  const state: BannerState | undefined = image
    ? banner?.src === image
      ? banner.state
      : "loading"
    : undefined;
  const loaded = state === "loaded";
  const showsBanner = Boolean(image) && state !== "failed";
  const kind = isSpacer
    ? loaded
      ? "spacer"
      : "spacer-text"
    : hasChildren && loaded
      ? "group"
      : "channel";
  const pill = (
    <div
      className="channel-tree-pill"
      data-kind={kind}
      data-pending={pending}
      data-selected={selected}
    >
      {showsBanner && image && (
        <img
          className="channel-tree-banner"
          src={image}
          alt={imageAlt}
          loading={lazy ? "lazy" : undefined}
          onLoad={() => setBanner({ src: image, state: "loaded" })}
          onError={() => setBanner({ src: image, state: "failed" })}
        />
      )}
      <div className="channel-tree-content">
        {kind === "channel" && (
          <span className="channel-tree-icon">
            <Icon name="layers" size={15} />
          </span>
        )}
        <span
          className={`channel-tree-name${kind === "spacer" ? " channel-tree-name-hidden" : ""}`}
          title={name}
        >
          {name}
        </span>
      </div>
    </div>
  );
  const style: CSSProperties = {
    ...TEAMSPEAK_GEOMETRY_STYLE,
    paddingLeft: depth * TEAMSPEAK_GEOMETRY.indent,
  };
  return (
    <li
      className={[
        "channel-tree-row",
        pending ? "channel-tree-row-pending" : "",
        onSelect ? "channel-tree-row-selectable" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {onSelect ? (
        <Button
          variant="plain"
          className="channel-tree-button"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {pill}
        </Button>
      ) : (
        pill
      )}
    </li>
  );
}
