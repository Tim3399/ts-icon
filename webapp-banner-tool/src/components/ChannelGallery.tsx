import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { useChannels } from "../hooks/useChannels";
import {
  BannerFrame,
  Button,
  Cluster,
  ConfirmDialog,
  EmptyState,
  FileButton,
  ListRow,
  ListSection,
  PageHeader,
  RequestError,
  Select,
  Skeleton,
  Stack,
  StatusGlyph,
  TextField,
  ToolbarButton,
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

function imageState(channel: Channel) {
  if (channel.hasImage) return <StatusGlyph tone="positive" label="Own image" />;
  return <span>{channel.hasFallback ? "Fallback" : "No image"}</span>;
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [removing, setRemoving] = useState<string | null>(null);
  const changeImage = async (cid: string, file?: File) => {
    if (locks.current.has(cid)) return;
    const channel = channels.find((c) => c.cid === cid);
    if (!channel) return;
    const issue = file && imageFileError(file);
    if (issue) {
      setFileErrors((prev) => ({ ...prev, [cid]: issue }));
      return;
    }
    locks.current.add(cid);
    setOperations((prev) => ({ ...prev, [cid]: file ? "Uploading…" : "Removing…" }));
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
  const pending = channels.find((c) => c.cid === removing);
  return (
    <Stack gap={7}>
      <PageHeader
        title="Manage channel images"
        subtitle="Replace a banner by dropping a file on its row, or remove it again."
        toolbar={
          <ToolbarButton
            icon="refresh"
            label="Refresh"
            onClick={() => void reload()}
            disabled={loading}
          />
        }
      />
      <SpacerBaseImageManager onChanged={reload} />

      <Stack gap={4}>
        <Cluster gap={3} align="end" className="channel-filters">
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
        </Cluster>

        <RequestError message={error} retry={() => void reload()} />

        {loading && (
          <>
            <p role="status" className="ds-visually-hidden">
              Loading channels…
            </p>
            {/* Deliberately not `.channel-row`: placeholders must never be
                counted as real channels by anything selecting on that class. */}
            <ListSection header="Loading…">
              {[0, 1, 2, 3].map((key) => (
                <ListRow
                  key={key}
                  aria-hidden="true"
                  title={<Skeleton height={14} width="40%" />}
                  subtitle={<Skeleton height={10} width="25%" />}
                />
              ))}
            </ListSection>
          </>
        )}

        {!loading && !error && visible.length === 0 && (
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
        )}

        {!loading && visible.length > 0 && (
          <ListSection
            header={`${visible.length} of ${channels.length} channel${channels.length === 1 ? "" : "s"}`}
          >
            {visible.map((channel) => {
              const busy = operations[channel.cid];
              const parent = channel.pid
                ? (channels.find((c) => c.cid === channel.pid)?.name ?? "parent channel")
                : null;
              return (
                <ListRow
                  key={channel.cid}
                  className="channel-row"
                  onDropFile={(file) => {
                    if (!locks.current.has(channel.cid)) void changeImage(channel.cid, file);
                  }}
                  title={<span title={channel.name}>{channel.name}</span>}
                  subtitle={
                    <>
                      {imageState(channel)}
                      <span>
                        {" · "}
                        {parent ? `Under ${parent} · ` : ""}
                        Channel #{channel.cid}
                        {channel.hasFallback && !channel.hasImage ? " · Spacer base image" : ""}
                      </span>
                    </>
                  }
                  trailing={
                    <>
                      <FileButton
                        id={`file-upload-${channel.cid}`}
                        aria-label={`Replace image of ${channel.name}`}
                        label={busy === "Uploading…" ? busy : "Replace…"}
                        disabled={Boolean(busy)}
                        error={fileErrors[channel.cid]}
                        onFile={(file) => void changeImage(channel.cid, file)}
                      />
                      <Button
                        variant="plain"
                        destructive
                        disabled={!channel.hasImage || Boolean(busy)}
                        onClick={() => setRemoving(channel.cid)}
                      >
                        {busy === "Removing…" ? busy : "Remove"}
                      </Button>
                    </>
                  }
                >
                  <div className="channel-banner">
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
                  </div>
                  <RequestError
                    message={errors[channel.cid] || ""}
                    retry={() => {
                      setErrors((prev) => ({ ...prev, [channel.cid]: "" }));
                      setRevisions((prev) => ({ ...prev, [channel.cid]: Date.now() }));
                      void reload();
                    }}
                  />
                </ListRow>
              );
            })}
          </ListSection>
        )}
      </Stack>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Remove image?"
        message={`Delete the image for "${pending?.name ?? ""}"?`}
        confirmLabel="Remove"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const cid = removing;
          setRemoving(null);
          if (cid) void changeImage(cid);
        }}
      />
    </Stack>
  );
}
