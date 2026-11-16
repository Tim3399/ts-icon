import { Button, InspectorSection, PropertyRow, Spinner, StatusGlyph } from "../design";
import type { Channel } from "../api/types";

interface BannerUrlInspectorProps {
  channel: Channel;
  /** The whole list: the path comes from it. */
  channels: Channel[];
  /** True while a banner URL operation runs. */
  busy: boolean;
  /** True while this channel's own "Set banner URL" runs. */
  setting: boolean;
  onSet: () => void;
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
 * The inspector of Banner URLs (T-142-F3 item 10): the selected channel's path,
 * managed state and current banner URL, and "Set banner URL" for that channel.
 */
export default function BannerUrlInspector({
  channel,
  channels,
  busy,
  setting,
  onSet,
}: BannerUrlInspectorProps) {
  return (
    <InspectorSection title={channel.name} meta={`#${channel.cid}`}>
      <PropertyRow label="Path">{pathOf(channel, channels)}</PropertyRow>
      <PropertyRow label="State">
        <StatusGlyph
          tone={channel.managed ? "positive" : "warning"}
          label={channel.managed ? "Managed" : "Not managed"}
        />
      </PropertyRow>
      <PropertyRow label="Current">
        {channel.bannerGfxUrl ? (
          <code className="banner-urls-url">{channel.bannerGfxUrl}</code>
        ) : (
          <span className="banner-urls-none">No banner URL in TeamSpeak</span>
        )}
      </PropertyRow>
      <div className="banner-urls-inspector-actions">
        <Button icon={setting ? undefined : "link"} disabled={busy} onClick={onSet}>
          {setting && <Spinner />}
          {setting ? "Setting…" : "Set banner URL"}
        </Button>
      </div>
      <p className="banner-urls-hint">
        TeamSpeak then loads this channel's banner from ts-icon. Upload an image in Manage channel
        images to fill it.
      </p>
    </InspectorSection>
  );
}
