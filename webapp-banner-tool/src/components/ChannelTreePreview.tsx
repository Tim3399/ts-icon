import React, { useCallback, useEffect, useState } from 'react';
import { CHANNEL_BANNER_URLS_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';
import { apiFetchJson, describeApiError } from '../api/client';
import { useToast } from './Toast';

export interface TreeChannel {
  cid: string;
  name: string;
  bannerGfxUrl: string | null;
  managed: boolean;
  pid: string | null;
  depth: number;
}

interface ChannelTreePreviewProps {
  /** When set, rows (and the top-level pseudo-row) become clickable, calling onSelectParent. */
  selectable?: boolean;
  selectedCid?: string | null;
  onSelectParent?: (cid: string | null) => void;
  /** Bump this to force a re-fetch, e.g. right after a generate/undo action. */
  refreshKey?: number;
}

/**
 * Renders the entire live TeamSpeak channel tree, each row showing its
 * actual current banner thumbnail -- every managed channel's banner is
 * already a public image this server serves, so this is just an <img> per
 * row, no separate thumbnail endpoint needed. `GET .../channels/banner-urls`
 * returns channels in the same order ServerQuery's own channellist does,
 * which TeamSpeak already returns in real tree display order -- so parents
 * always precede their children and siblings stay in their real order with
 * no client-side re-sorting required; only the indent (via `depth`) is this
 * component's own doing.
 */
const ChannelTreePreview: React.FC<ChannelTreePreviewProps> = ({
  selectable = false,
  selectedCid = null,
  onSelectParent,
  refreshKey = 0,
}) => {
  const [channels, setChannels] = useState<TreeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();
  const { showToast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    return apiFetchJson<{ channels: TreeChannel[] }>(CHANNEL_BANNER_URLS_URL, { getToken })
      .then((data) => {
        if (!Array.isArray(data.channels)) {
          throw new Error('Response does not contain a valid channels array');
        }
        setChannels(data.channels);
      })
      .catch((err) => {
        showToast(describeApiError(err, 'Channel tree could not be loaded'), 'error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [getToken, showToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="channel-tree">
      {loading && <p className="loading-state">Loading channel tree…</p>}
      {!loading && channels.length === 0 && (
        <p className="empty-state">No channels found.</p>
      )}
      {!loading && (
        <ul className="channel-tree-list">
          {selectable && (
            <li
              className={`channel-tree-row${selectedCid === null ? ' channel-tree-row-selected' : ''}`}
              onClick={() => onSelectParent?.(null)}
            >
              <span className="channel-tree-thumb channel-tree-thumb-placeholder" />
              <span className="channel-tree-name">Top-level (no parent)</span>
            </li>
          )}
          {channels.map((channel) => (
            <li
              key={channel.cid}
              className={`channel-tree-row${selectable ? ' channel-tree-row-selectable' : ''}${selectedCid === channel.cid ? ' channel-tree-row-selected' : ''}`}
              style={{ paddingLeft: 12 + channel.depth * 20 }}
              onClick={selectable ? () => onSelectParent?.(channel.cid) : undefined}
            >
              {channel.bannerGfxUrl ? (
                <img className="channel-tree-thumb" src={channel.bannerGfxUrl} alt="" />
              ) : (
                <span className="channel-tree-thumb channel-tree-thumb-placeholder" />
              )}
              <span className="channel-tree-name">{channel.name}</span>
              {channel.managed && <span className="badge badge-managed">Managed</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChannelTreePreview;
