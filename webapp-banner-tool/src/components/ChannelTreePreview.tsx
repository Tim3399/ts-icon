import { useEffect, useState } from "react";
import { CHANNEL_BANNER_URLS_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson, describeApiError } from "../api/client";
import { channelImageUrl } from "../api/channels";
import { Button, EmptyState, Icon, LoadingState, RequestError, useToast } from "../design";
import type { PreviewOverlay } from "../preview/PreviewOverlayContext";
import type { Channel } from "../api/types";
import "./ChannelTreePreview.css";

export type TreeChannel = Channel;

/** Match --size-channel-indent and --space-3: the row's own left padding carries the tree indent. */
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
        managed: false,
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
              <li
                className="channel-tree-row channel-tree-row-selectable"
                style={{ paddingLeft: BASE_PADDING_PX }}
              >
                <div
                  className="channel-tree-pill"
                  data-kind="channel"
                  data-selected={selectedCid === null}
                >
                  <Button
                    variant="plain"
                    className="channel-tree-button"
                    aria-pressed={selectedCid === null}
                    onClick={() => onSelectParent?.(null)}
                  >
                    <span className="channel-tree-name">Top-level (no parent)</span>
                  </Button>
                </div>
              </li>
            )}
            {rows.map((row, index) => {
              // A group is a channel with a banner that has sub-channels right below it.
              const isGroup =
                !row.isSpacer && Boolean(row.image) && (rows[index + 1]?.depth ?? 0) > row.depth;
              const kind = row.isSpacer ? "spacer" : isGroup ? "group" : "channel";
              const selected = selectable && !row.pending && selectedCid === row.cid;
              const content = (
                <>
                  {kind === "channel" && (
                    <span className="channel-tree-icon">
                      <Icon name="layers" size={17} />
                    </span>
                  )}
                  <span
                    className={`channel-tree-name${kind === "spacer" ? " channel-tree-name-hidden" : ""}`}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  {kind !== "spacer" && row.managed && (
                    <span className="channel-tree-badge" data-badge="managed">
                      Managed
                    </span>
                  )}
                  {kind !== "spacer" && row.pending && (
                    <span className="channel-tree-badge" data-badge="pending">
                      Pending
                    </span>
                  )}
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
                  <div
                    className="channel-tree-pill"
                    data-kind={kind}
                    data-pending={row.pending}
                    data-selected={selected}
                  >
                    {row.image && (
                      <img
                        className="channel-tree-banner"
                        src={row.image}
                        alt=""
                        loading="lazy"
                        onLoad={(event) => {
                          event.currentTarget.style.display = "";
                        }}
                        onError={(event) => {
                          // A channel without a banner image answers 404: show no broken-image box.
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    {selectable && !row.pending ? (
                      <Button
                        variant="plain"
                        className="channel-tree-button"
                        aria-pressed={selectedCid === row.cid}
                        onClick={() => onSelectParent?.(row.cid)}
                      >
                        {content}
                      </Button>
                    ) : (
                      <div className="channel-tree-content">{content}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
