import { useState, type CSSProperties } from "react";
import { Button, Icon } from "../design";
import "./ChannelTreeRow.css";

/** Match --size-channel-indent and --space-3: the row's own left padding carries the tree indent. */
export const TREE_INDENT_PX = 20;
export const TREE_BASE_PADDING_PX = 12;

type BannerState = "loading" | "loaded" | "failed";

export interface ChannelTreeRowProps {
  name: string;
  /** Tree depth; the row indents itself by it. */
  depth: number;
  /** Banner behind the row, or none. */
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
  /** Banner at its exact 500 x 44 size (the editor's TeamSpeak preview). */
  exact?: boolean;
  /** Lazy-load the banner (long trees). */
  lazy?: boolean;
  className?: string;
}

/**
 * One row of the TeamSpeak channel tree (T-142 item 17, docs/design/DESIGN.md
 * "Channel tree look"), shared by the live tree, the Wallpaper parent picker
 * and the Banner editor's TeamSpeak preview.
 *
 * The kind follows the real channel and the banner's load state, never the
 * mere presence of an image URL (T-142-F1 C2, C3):
 * - a spacer shows only its banner once it has loaded; without a banner (no
 *   image, or the image fails) it shows its name;
 * - a parent channel is a group (bold label over the banner) only while its
 *   banner has loaded; otherwise it is a normal channel row with its icon.
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
  exact = false,
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
  const content = (
    <>
      {kind === "channel" && (
        <span className="channel-tree-icon">
          <Icon name="layers" size={17} />
        </span>
      )}
      <span
        className={`channel-tree-name${kind === "spacer" ? " channel-tree-name-hidden" : ""}`}
        title={name}
      >
        {name}
      </span>
    </>
  );
  const style: CSSProperties = { paddingLeft: TREE_BASE_PADDING_PX + depth * TREE_INDENT_PX };
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
      <div
        className="channel-tree-pill"
        data-kind={kind}
        data-pending={pending}
        data-selected={selected}
        data-exact={exact || undefined}
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
        {onSelect ? (
          <Button
            variant="plain"
            className="channel-tree-button"
            aria-pressed={selected}
            onClick={onSelect}
          >
            {content}
          </Button>
        ) : (
          <div className="channel-tree-content">{content}</div>
        )}
      </div>
    </li>
  );
}
