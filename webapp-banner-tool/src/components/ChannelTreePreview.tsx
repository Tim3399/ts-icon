import { useEffect, useState } from "react";
import { CHANNEL_BANNER_URLS_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson, describeApiError } from "../api/client";
import { channelImageUrl } from "../api/channels";
import { useToast } from "./ToastContext";
import type { PreviewOverlay } from "../preview/PreviewOverlayContext";
import type { Channel } from "../api/types";
import RequestError from "./RequestError";
import { EmptyState, LoadingState } from "./ui/States";

export type TreeChannel = Channel;

/** Matches the tree indent used for the row padding below. */
const INDENT_PX = 20;
const BASE_PADDING_PX = 12;

interface Props {
  selectable?: boolean;
  selectedCid?: string | null;
  onSelectParent?: (cid: string | null) => void;
  refreshKey?: number;
  overlay?: PreviewOverlay | null;
  className?: string;
}

export default function ChannelTreePreview({
  selectable = false,
  selectedCid = null,
  onSelectParent,
  refreshKey = 0,
  overlay = null,
  className,
}: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { getToken } = useAuth();
  const { showToast } = useToast();
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void apiFetchJson<{ channels: Channel[] }>(CHANNEL_BANNER_URLS_URL, {
      getToken,
      signal: controller.signal,
    })
      .then((data) => {
        if (!Array.isArray(data.channels)) throw new Error("Invalid channels");
        if (!controller.signal.aborted) setChannels(data.channels);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const message = describeApiError(err, "Channel tree could not be loaded");
          setError(message);
          showToast(message, "error");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [getToken, showToast, refreshKey, retry]);
  const rows = channels.map((c) => ({
    key: c.cid,
    cid: c.cid as string | null,
    name: c.name,
    managed: c.managed,
    depth: c.depth,
    image: c.managed ? channelImageUrl(c, c.contentHash || refreshKey) : c.bannerGfxUrl,
    pending: false,
  }));
  if (
    overlay?.rows.length &&
    (overlay.parentCid === null || channels.some((c) => c.cid === overlay.parentCid))
  ) {
    const parentDepth = channels.find((c) => c.cid === overlay.parentCid)?.depth ?? -1;
    const at =
      overlay.parentCid === null ? 0 : rows.findIndex((c) => c.cid === overlay.parentCid) + 1;
    rows.splice(
      at,
      0,
      ...overlay.rows.map((r, i) => ({
        key: `pending-${i}`,
        cid: null,
        name: r.isSpacer ? "Spacer (pending)" : "New channel (pending)",
        managed: false,
        depth: parentDepth + 1 + r.depth,
        image: r.imageDataUrl,
        pending: true,
      })),
    );
  }
  return (
    <div className={`channel-tree${className ? ` ${className}` : ""}`}>
      {error && (
        <div className="channel-tree-notice">
          <RequestError message={error} retry={() => setRetry((v) => v + 1)} />
        </div>
      )}
      {loading && <LoadingState label="Loading channel tree…" />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon="tree" title="No channels found." />
      )}
      {!loading && rows.length > 0 && (
        <div className="channel-tree-scroll scroll-area">
          <ul className="channel-tree-list">
            {selectable && (
              <li className="channel-tree-row channel-tree-row-selectable">
                <button
                  type="button"
                  className="tree-select"
                  aria-pressed={selectedCid === null}
                  onClick={() => onSelectParent?.(null)}
                >
                  Top-level (no parent)
                </button>
              </li>
            )}
            {rows.map((row) => {
              const content = (
                <>
                  {row.image ? (
                    <img className="channel-tree-thumb" src={row.image} alt="" loading="lazy" />
                  ) : (
                    <span className="channel-tree-thumb channel-tree-thumb-placeholder" />
                  )}
                  <span className="channel-tree-name" title={row.name}>
                    {row.name}
                  </span>
                  {row.managed && <span className="badge badge-managed">Managed</span>}
                  {row.pending && <span className="badge badge-pending">Pending</span>}
                </>
              );
              return (
                <li
                  key={row.key}
                  className={`channel-tree-row${row.pending ? " channel-tree-row-pending" : ""}${
                    selectable && !row.pending ? " channel-tree-row-selectable" : ""
                  }`}
                  style={{ paddingLeft: BASE_PADDING_PX + row.depth * INDENT_PX }}
                >
                  {selectable && !row.pending ? (
                    <button
                      type="button"
                      className="tree-select"
                      aria-pressed={selectedCid === row.cid}
                      onClick={() => onSelectParent?.(row.cid)}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
