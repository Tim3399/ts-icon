import {
  Button,
  FileButton,
  InspectorSection,
  LinkButton,
  PropertyRow,
  StatusGlyph,
} from "../design";
import { ChannelTreeRow } from "./ChannelTreeRow";
import { formatImageSize, formatImageUpdated } from "./channelImageFormat";
import type { Channel } from "../api/types";

interface ChannelInspectorProps {
  channel: Channel;
  /** The whole list: the path and the parent kind come from it. */
  channels: Channel[];
  /** The banner URL of the channel (its own image or the spacer fallback), or null. */
  imageSrc: string | null;
  /** The banner exists but failed to load (404 or error); the pill then shows no banner. */
  imageFailed?: boolean;
  /** "Uploading…" or "Removing…" while an operation runs. */
  busy?: string;
  fileError?: string;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function pathOf(channel: Channel, channels: Channel[]): string {
  const names = [channel.name];
  let parent = channels.find((c) => c.cid === channel.pid);
  for (let guard = 0; parent && guard < 32; guard++) {
    names.unshift(parent.name);
    parent = channels.find((c) => c.cid === parent?.pid);
  }
  return names.join(" / ");
}

/**
 * The inspector of Channel images (T-142-F3 item 9): the selected channel as a
 * read-only TS6 pill, its path, image state, size and change time, and the
 * actions Open in editor, Replace… and Remove….
 */
export default function ChannelInspector({
  channel,
  channels,
  imageSrc,
  imageFailed = false,
  busy,
  fileError,
  onFile,
  onRemove,
}: ChannelInspectorProps) {
  const size = channel.hasImage ? formatImageSize(channel.size) : null;
  const updated = channel.hasImage ? formatImageUpdated(channel.updatedAt) : null;
  const hasChildren = channels.some((c) => c.pid === channel.cid);
  const verb = channel.hasImage ? "Replace" : "Upload";
  return (
    <InspectorSection title={channel.name} meta={`#${channel.cid}`}>
      <ul className="channel-inspector-pill" aria-label={`${channel.name} in TeamSpeak`}>
        <ChannelTreeRow
          name={channel.name}
          depth={0}
          image={imageSrc}
          isSpacer={channel.isSpacer}
          hasChildren={hasChildren}
        />
      </ul>
      <PropertyRow label="Path">{pathOf(channel, channels)}</PropertyRow>
      <PropertyRow label="Image">
        {channel.hasImage ? (
          <StatusGlyph tone="positive" label="Own image" />
        ) : channel.hasFallback ? (
          "Spacer base image"
        ) : (
          <StatusGlyph tone="warning" label="No image" />
        )}
        {imageFailed && <span className="channel-image-note">Banner could not be loaded</span>}
      </PropertyRow>
      {size && <PropertyRow label="Size">{size}</PropertyRow>}
      {updated && channel.updatedAt && (
        <PropertyRow label="Updated">
          <time dateTime={channel.updatedAt}>{updated}</time>
        </PropertyRow>
      )}
      <div className="channel-inspector-actions">
        <LinkButton to={`/?channel=${encodeURIComponent(channel.cid)}`} icon="crop">
          Open in editor
        </LinkButton>
        <FileButton
          id={`inspector-file-upload-${channel.cid}`}
          aria-label={`${verb} image of ${channel.name}`}
          label={busy === "Uploading…" ? busy : `${verb}…`}
          disabled={Boolean(busy)}
          error={fileError}
          onFile={onFile}
        />
        <Button
          variant="plain"
          destructive
          disabled={!channel.hasImage || Boolean(busy)}
          onClick={onRemove}
        >
          {busy === "Removing…" ? busy : "Remove…"}
        </Button>
      </div>
    </InspectorSection>
  );
}
