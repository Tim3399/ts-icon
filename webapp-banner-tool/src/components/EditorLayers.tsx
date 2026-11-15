import type { Channel } from "../api/types";
import {
  Button,
  Icon,
  LoadingState,
  Panel,
  RequestError,
  StudioLayers,
  ToolbarButton,
} from "../design";
import { channelBanner } from "./channelBanner";
import "./EditorLayers.css";

interface EditorLayersProps {
  channels: Channel[];
  loading: boolean;
  error: string;
  selectedCid: string;
  onSelect: (cid: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

/**
 * The editor's layer panel (T-142-F3 item 4, R4): the live channel tree from
 * GET channels as compact rows – glyph, name, banner thumbnail. A row click
 * selects the channel (the same state as the inspector's select); the
 * selected row carries aria-current.
 */
export function EditorLayers({
  channels,
  loading,
  error,
  selectedCid,
  onSelect,
  onRefresh,
  disabled = false,
}: EditorLayersProps) {
  return (
    <StudioLayers>
      <Panel
        title="Channels"
        meta={channels.length ? `${channels.length} · live` : undefined}
        actions={
          <ToolbarButton
            icon="refresh"
            label="Refresh the live tree"
            onClick={onRefresh}
            disabled={loading}
          />
        }
        footer={`Live from the TeamSpeak server · ${channels.length} channels`}
      >
        {error && (
          <div className="layers-notice">
            <RequestError message={error} retry={onRefresh} />
          </div>
        )}
        {loading && channels.length === 0 && (
          <div className="layers-notice">
            <LoadingState label="Loading channels…" />
          </div>
        )}
        {!loading && !error && channels.length === 0 && (
          <p className="layers-notice layers-empty">No channels found.</p>
        )}
        <ul className="layers" aria-label="Channels">
          {channels.map((channel) => {
            const banner = channelBanner(channel);
            const current = channel.cid === selectedCid;
            return (
              <li
                key={channel.cid}
                style={{ paddingLeft: `calc(var(--space-3) * ${channel.depth})` }}
              >
                <Button
                  variant="plain"
                  className="layer-row"
                  aria-current={current ? "true" : undefined}
                  disabled={disabled}
                  onClick={() => onSelect(channel.cid)}
                >
                  <span className="layer-glyph" aria-hidden="true">
                    <Icon name={channel.isSpacer ? "sliders" : "layers"} size={14} />
                  </span>
                  <span className="layer-name">{channel.name}</span>
                  <span className="layer-thumb" data-empty={banner ? undefined : ""}>
                    {banner && <img src={banner} alt="" loading="lazy" />}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </StudioLayers>
  );
}
