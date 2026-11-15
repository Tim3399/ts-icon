import { useEffect, useState } from "react";
import { CHANNEL_BANNER_URLS_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson, describeApiError } from "../api/client";
import { channelImageUrl } from "../api/channels";
import { EmptyState, LoadingState, RequestError, useToast } from "../design";
import type { PreviewOverlay } from "../preview/PreviewOverlayContext";
import type { Channel } from "../api/types";
import { ChannelTreeRow } from "./ChannelTreeRow";
import "./ChannelTreePreview.css";

export type TreeChannel = Channel;

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
    depth: c.depth,
    image: c.managed ? channelImageUrl(c, c.contentHash || refreshKey) : c.bannerGfxUrl,
    pending: false,
    isSpacer: Boolean(c.isSpacer),
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
        depth: parentDepth + 1 + r.depth,
        image: r.imageDataUrl,
        pending: true,
        isSpacer: r.isSpacer,
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
        <div className="channel-tree-scroll">
          <ul className="channel-tree-list">
            {selectable && (
              <ChannelTreeRow
                name="Top-level (no parent)"
                depth={0}
                selected={selectedCid === null}
                onSelect={() => onSelectParent?.(null)}
              />
            )}
            {rows.map((row, index) => (
              <ChannelTreeRow
                key={row.key}
                name={row.name}
                depth={row.depth}
                image={row.image}
                isSpacer={row.isSpacer}
                hasChildren={(rows[index + 1]?.depth ?? 0) > row.depth}
                pending={row.pending}
                selected={selectable && !row.pending && selectedCid === row.cid}
                onSelect={selectable && !row.pending ? () => onSelectParent?.(row.cid) : undefined}
                lazy
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
