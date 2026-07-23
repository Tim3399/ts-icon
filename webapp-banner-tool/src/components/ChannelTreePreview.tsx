import React, { useCallback, useEffect, useState } from 'react';
import { CHANNEL_BANNER_URLS_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';
import { apiFetchJson, describeApiError } from '../api/client';
import { useToast } from './Toast';
import type { PreviewOverlay } from '../preview/PreviewOverlayContext';

export interface TreeChannel {
  cid: string;
  name: string;
  bannerGfxUrl: string | null;
  managed: boolean;
  pid: string | null;
  depth: number;
}

interface RenderRow {
  key: string;
  cid: string | null;
  name: string;
  bannerGfxUrl: string | null;
  managed: boolean;
  depth: number;
  pending: boolean;
}

interface ChannelTreePreviewProps {
  /** When set, rows (and the top-level pseudo-row) become clickable, calling onSelectParent. */
  selectable?: boolean;
  selectedCid?: string | null;
  onSelectParent?: (cid: string | null) => void;
  /** Bump this to force a re-fetch, e.g. right after a generate/undo action. */
  refreshKey?: number;
  /** Not-yet-created rows to splice into the real tree at the position they'd actually land in. */
  overlay?: PreviewOverlay | null;
  className?: string;
}

/**
 * Inserts overlay.rows right after overlay.parentCid's own row (or at index 0
 * for a null/top-level parent) -- matching how createChannelWallpaper()
 * actually orders freshly created channels: the first row at a given depth
 * is created with no `orderAfterCid`, which ServerQuery sorts first among
 * that parent's existing children, not last.
 */
function buildRenderRows(channels: TreeChannel[], overlay?: PreviewOverlay | null): RenderRow[] {
  const base: RenderRow[] = channels.map((c) => ({
    key: c.cid,
    cid: c.cid,
    name: c.name,
    bannerGfxUrl: c.bannerGfxUrl,
    managed: c.managed,
    depth: c.depth,
    pending: false,
  }));
  if (!overlay || overlay.rows.length === 0) return base;

  const parentDepth =
    overlay.parentCid === null
      ? -1
      : (channels.find((c) => c.cid === overlay.parentCid)?.depth ?? -1);
  const insertionIndex =
    overlay.parentCid === null ? 0 : base.findIndex((r) => r.cid === overlay.parentCid) + 1;

  const pendingRows: RenderRow[] = overlay.rows.map((row, i) => ({
    key: `pending-${i}`,
    cid: null,
    name: row.isSpacer ? 'Spacer (pending)' : 'New channel (pending)',
    bannerGfxUrl: row.imageDataUrl,
    managed: false,
    depth: parentDepth + 1 + row.depth,
    pending: true,
  }));

  return [...base.slice(0, insertionIndex), ...pendingRows, ...base.slice(insertionIndex)];
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
  overlay = null,
  className,
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

  const renderRows = buildRenderRows(channels, overlay);

  return (
    <div className={`channel-tree${className ? ` ${className}` : ''}`}>
      {loading && <p className="loading-state">Loading channel tree…</p>}
      {!loading && renderRows.length === 0 && (
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
          {renderRows.map((row) => (
            <li
              key={row.key}
              className={`channel-tree-row${selectable && !row.pending ? ' channel-tree-row-selectable' : ''}${selectedCid === row.cid ? ' channel-tree-row-selected' : ''}${row.pending ? ' channel-tree-row-pending' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 20 }}
              onClick={selectable && !row.pending ? () => onSelectParent?.(row.cid) : undefined}
            >
              {row.bannerGfxUrl ? (
                <img className="channel-tree-thumb" src={row.bannerGfxUrl} alt="" />
              ) : (
                <span className="channel-tree-thumb channel-tree-thumb-placeholder" />
              )}
              <span className="channel-tree-name">{row.name}</span>
              {row.managed && <span className="badge badge-managed">Managed</span>}
              {row.pending && <span className="badge badge-pending">Pending</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChannelTreePreview;
