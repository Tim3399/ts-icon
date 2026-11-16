import type { Channel } from "../api/types";
import { Dock } from "../design";
import { BANNER_HEIGHT, BANNER_WIDTH } from "./bannerExport";
import { BannerImage } from "./BannerImage";
import { TeamSpeakPreview } from "./TeamSpeakPreview";
import "./EditorDock.css";

interface EditorDockProps {
  channels: Channel[];
  selected?: Channel;
  /** The live crop from exportBanner; null before an image is framed. */
  crop: string | null;
  /** The selected channel's current banner, or null. */
  current: string | null;
  /** The crop is not saved for the selected channel (its row carries "New"). */
  unsaved: boolean;
  /** The current banner is the one this editor just saved. */
  justSaved: boolean;
}

/** A plain 250 x 22 strip (R8), or the quiet empty tile when there is none or it fails to load. */
function Strip({
  label,
  src,
  alt,
  empty,
}: {
  label: string;
  src: string | null;
  alt: string;
  empty: string;
}) {
  return (
    <div className="compare-row">
      <span className="compare-label">{label}</span>
      <BannerImage
        className="compare-strip"
        src={src}
        alt={alt}
        width={250}
        height={22}
        fallback={<span className="compare-strip compare-empty">{empty}</span>}
      />
    </div>
  );
}

/**
 * The dock under the canvas (T-142-F3 items 6 and 7): the TeamSpeak preview
 * with the whole tree, the before/after comparison and the saved 500 x 44
 * strip. The preview, "After" and the saved strip all show the one export of
 * the crop (exportBanner).
 */
export function EditorDock({
  channels,
  selected,
  crop,
  current,
  unsaved,
  justSaved,
}: EditorDockProps) {
  const name = selected?.name ?? "";
  return (
    <Dock title="Preview in TeamSpeak" meta="TS6 · live while you crop">
      <div className="dock-layout">
        <TeamSpeakPreview
          channels={channels}
          selected={selected}
          banner={crop ?? current}
          bannerAlt={crop ? `Cropped banner for ${name}` : `Current banner for ${name}`}
          marker={selected && crop && unsaved ? "New" : undefined}
          // Scroll the edited row into view on a channel select and when a crop starts.
          focusKey={`${selected?.cid ?? ""}:${crop ? "crop" : "none"}`}
        />
        {selected && (
          <div className="dock-side">
            <div className="compare" aria-label="Before and after">
              <p className="compare-title">{name}</p>
              <Strip
                label="Before"
                src={current}
                alt={justSaved ? `Saved banner for ${name}` : `Current banner of ${name}`}
                empty="No banner yet"
              />
              <Strip label="After" src={crop} alt={`New banner of ${name}`} empty="No crop yet" />
            </div>
            <p className="dock-hint">
              {crop
                ? `Sending replaces ${name}'s banner in TeamSpeak; the preview shows it already.`
                : "Add an image to see the new banner next to the current one."}
            </p>
          </div>
        )}
      </div>
      {selected && crop && (
        <div className="saved">
          <span className="saved-label">
            Saved image · {BANNER_WIDTH} × {BANNER_HEIGHT} · 1:1
          </span>
          <img
            className="saved-strip"
            src={crop}
            alt={`Saved image for ${name}, ${BANNER_WIDTH} × ${BANNER_HEIGHT} pixels`}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
          />
        </div>
      )}
      {!selected && (
        <p className="dock-hint">Choose a channel to see how its banner looks in TeamSpeak.</p>
      )}
    </Dock>
  );
}
