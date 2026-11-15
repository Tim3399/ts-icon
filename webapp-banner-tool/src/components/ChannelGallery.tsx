import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { useChannels } from "../hooks/useChannels";
import {
  BannerFrame,
  Button,
  Cluster,
  EmptyState,
  Grid,
  PageHeader,
  RequestError,
  Select,
  Skeleton,
  Stack,
  TextField,
  UploadInput,
  useToast,
} from "../design";
import SpacerBaseImageManager from "./SpacerBaseImageManager";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import { imageFileError } from "../api/image-file";
import { uploadFieldError } from "../hooks/useFieldErrors";
import type { Channel } from "../api/types";
import "./ChannelGallery.css";

const FILTERS = [
  ["all", "All channels"],
  ["own", "Own image"],
  ["missing", "Missing image"],
  ["spacer", "Spacer channels"],
] as const;

function imageState(channel: Channel): { label: string; state: "own" | "fallback" | "none" } {
  if (channel.hasImage) return { label: "Own image", state: "own" };
  if (channel.hasFallback) return { label: "Fallback", state: "fallback" };
  return { label: "No image", state: "none" };
}

export default function ChannelGallery() {
  const { channels, setChannels, loading, error, reload } = useChannels();
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { bumpRefresh } = usePreviewOverlay();
  const locks = useRef(new Set<string>());
  const [operations, setOperations] = useState<Record<string, string>>({});
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [fileResetKeys, setFileResetKeys] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const changeImage = async (cid: string, file?: File) => {
    if (locks.current.has(cid)) return;
    const channel = channels.find((c) => c.cid === cid);
    if (!channel) return;
    if (file) setFileResetKeys((previous) => ({ ...previous, [cid]: (previous[cid] ?? 0) + 1 }));
    const issue = file && imageFileError(file);
    if (issue) {
      setFileErrors((prev) => ({ ...prev, [cid]: issue }));
      return;
    }
    if (!file && !window.confirm(`Delete the image for "${channel.name}"?`)) return;
    locks.current.add(cid);
    setOperations((prev) => ({ ...prev, [cid]: file ? "Uploading…" : "Deleting…" }));
    setErrors((prev) => ({ ...prev, [cid]: "" }));
    setFileErrors((prev) => ({ ...prev, [cid]: "" }));
    try {
      const body = new FormData();
      if (file) body.append("file", file);
      await apiFetch(channelImageEndpoint(cid), {
        method: file ? "POST" : "DELETE",
        body: file ? body : undefined,
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      setChannels((prev) =>
        prev.map((c) => (c.cid === cid ? { ...c, hasImage: Boolean(file) } : c)),
      );
      setRevisions((prev) => ({ ...prev, [cid]: Date.now() }));
      showToast(file ? "Image updated!" : "Image deleted.", "success");
      await reload();
      bumpRefresh();
    } catch (err) {
      const issue = file ? uploadFieldError(err) : "";
      if (issue) setFileErrors((prev) => ({ ...prev, [cid]: issue }));
      else {
        const message = describeApiError(err, "The image could not be changed. Try again.");
        setErrors((prev) => ({ ...prev, [cid]: message }));
        showToast(message, "error");
      }
    } finally {
      locks.current.delete(cid);
      setOperations((prev) => {
        const next = { ...prev };
        delete next[cid];
        return next;
      });
    }
  };
  const visible = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "own" && c.hasImage) ||
        (filter === "missing" && !c.hasImage && !c.hasFallback) ||
        (filter === "spacer" && c.isSpacer)),
  );
  const filtered = query.trim() !== "" || filter !== "all";
  return (
    <Stack gap={4}>
      <PageHeader
        eyebrow="Channels"
        icon="image"
        title="Manage channel images"
        lead="Review every channel's banner at its real proportions, replace one by dropping a file on its card, or clear it again."
        actions={
          <Button icon="refresh" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      <SpacerBaseImageManager onChanged={reload} />

      <Cluster gap={3} align="end" className="channel-toolbar">
        <TextField
          id="channel-search"
          type="search"
          className="channel-filter"
          label="Search channels"
          value={query}
          placeholder="Filter by name"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          id="channel-image-status"
          className="channel-filter"
          label="Image status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <p className="channel-toolbar-meta">
          {loading
            ? "Loading…"
            : `${visible.length} of ${channels.length} channel${channels.length === 1 ? "" : "s"}`}
        </p>
      </Cluster>

      <RequestError message={error} retry={() => void reload()} />

      {loading && (
        <>
          <p role="status" className="ds-visually-hidden">
            Loading channels…
          </p>
          {/* Deliberately not `.channel-card`: placeholders must never be
              counted as real channels by anything selecting on that class. */}
          <Grid gap={4} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div className="channel-placeholder" key={key}>
                <Skeleton height={40} radius="small" />
                <Skeleton height={14} width="60%" />
                <Skeleton height={10} width="40%" />
                <Skeleton height={52} radius="control" />
              </div>
            ))}
          </Grid>
        </>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="channel-empty">
          <EmptyState
            icon="inbox"
            title={channels.length ? "No channels match these filters." : "No channels found."}
            description={
              channels.length
                ? "Clear the search or choose a different image status."
                : "TeamSpeak reported no channels for this server."
            }
            action={
              filtered && channels.length ? (
                <Button
                  size="small"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!loading && visible.length > 0 && (
        <Grid gap={4}>
          {visible.map((channel) => {
            const image = imageState(channel);
            const busy = operations[channel.cid];
            return (
              <article
                key={channel.cid}
                className={`channel-card${dragOver === channel.cid ? " channel-card-drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!locks.current.has(channel.cid)) setDragOver(channel.cid);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(null);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void changeImage(channel.cid, file);
                }}
              >
                <BannerFrame
                  src={
                    channel.hasImage || channel.hasFallback
                      ? channelImageUrl(channel, revisions[channel.cid])
                      : null
                  }
                  alt={channel.name}
                  imageKey={revisions[channel.cid]}
                  lazy
                  placeholder="No image available"
                  onError={() =>
                    setErrors((prev) => ({
                      ...prev,
                      [channel.cid]:
                        "This image could not be loaded. Refresh the channel list to try again.",
                    }))
                  }
                />
                <div className="channel-head">
                  <h2 className="channel-name" title={channel.name}>
                    {channel.name}
                  </h2>
                  <span className="channel-badge" data-state={image.state}>
                    {image.label}
                  </span>
                </div>
                <p className="channel-status">
                  {channel.pid
                    ? `Under ${channels.find((c) => c.cid === channel.pid)?.name ?? "parent channel"} · `
                    : ""}
                  Channel #{channel.cid}
                  {channel.hasFallback && !channel.hasImage ? " · Spacer base image" : ""}
                </p>
                <Stack gap={2} className="channel-actions">
                  <UploadInput
                    id={`file-upload-${channel.cid}`}
                    resetKey={fileResetKeys[channel.cid]}
                    error={fileErrors[channel.cid]}
                    disabled={Boolean(busy)}
                    compact
                    hint=""
                    label={busy || "Drop or click to replace"}
                    onFile={(file) => void changeImage(channel.cid, file)}
                  />
                  <Button
                    variant="destructive"
                    size="small"
                    icon="trash"
                    disabled={!channel.hasImage || Boolean(busy)}
                    onClick={() => void changeImage(channel.cid)}
                  >
                    {busy === "Deleting…" ? "Deleting…" : "Delete image"}
                  </Button>
                </Stack>
                <RequestError
                  message={errors[channel.cid] || ""}
                  retry={() => {
                    setErrors((prev) => ({ ...prev, [channel.cid]: "" }));
                    setRevisions((prev) => ({ ...prev, [channel.cid]: Date.now() }));
                    void reload();
                  }}
                />
              </article>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
