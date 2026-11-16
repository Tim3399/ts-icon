import { useRef, useState, type CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { useChannels } from "../hooks/useChannels";
import {
  Button,
  ConfirmDialog,
  DataTable,
  FileButton,
  FilterBar,
  Icon,
  SegmentedControl,
  Spinner,
  StateTile,
  StatusGlyph,
  StudioInspector,
  StudioToolbar,
  TextField,
  ToolbarButton,
  useToast,
  type DataColumn,
} from "../design";
import SpacerBaseImageManager from "./SpacerBaseImageManager";
import ChannelInspector from "./ChannelInspector";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import { imageFileError } from "../api/image-file";
import { uploadFieldError } from "../hooks/useFieldErrors";
import { formatImageSize } from "./channelImageFormat";
import type { Channel } from "../api/types";
import "./ChannelGallery.css";

// Manage channel images as concept D2 draws it (T-142-F3 item 9): a filter
// bar, the channel table with a row action and row drop-to-replace, and an
// inspector for the selected row with the spacer base image below it.

type ImageFilter = "all" | "with" | "without";

const FILTERS: { value: ImageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "with", label: "With image" },
  { value: "without", label: "Without" },
];

function ImageState({ channel }: { channel: Channel }) {
  if (channel.hasImage) return <StatusGlyph tone="positive" label="Own image" />;
  if (channel.hasFallback) return <span className="channel-image-state">Spacer base image</span>;
  return <StatusGlyph tone="warning" label="No image" />;
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
  // Banner URLs that failed to load (404 or error): they show the quiet empty
  // tile instead of the browser's broken-image icon (T-142-F4, F-142-28).
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ImageFilter>("all");
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
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
      c.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" || (filter === "with") === Boolean(c.hasImage)),
  );
  const filtered = query.trim() !== "" || filter !== "all";
  // The selection follows the filter: a hidden row hands it to the first visible one.
  const selected = visible.find((c) => c.cid === selectedCid) ?? visible[0] ?? null;
  const pending = channels.find((c) => c.cid === removing);
  const withImage = channels.filter((c) => c.hasImage).length;
  const requestedSrc = (channel: Channel) =>
    channel.hasImage || channel.hasFallback
      ? channelImageUrl(channel, revisions[channel.cid])
      : null;
  /** The banner to draw, or null when there is none or it failed to load. */
  const imageSrc = (channel: Channel) => {
    const src = requestedSrc(channel);
    return src && !broken.has(src) ? src : null;
  };
  const failed = (channel: Channel) => {
    const src = requestedSrc(channel);
    return Boolean(src && broken.has(src));
  };
  const markBroken = (src: string) =>
    setBroken((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

  const columns: DataColumn<Channel>[] = [
    {
      key: "channel",
      header: "Channel",
      className: "channel-cell-name",
      render: (channel) => (
        <span className="channel-name" style={{ "--depth": channel.depth } as CSSProperties}>
          <Icon name={channel.isSpacer ? "sliders" : "layers"} size={14} />
          <span className="channel-name-text" title={channel.name}>
            {channel.name}
          </span>
          {channel.isSpacer && <span className="channel-tag">Spacer</span>}
          {channel.managed === false && <span className="channel-tag">Not managed</span>}
        </span>
      ),
    },
    {
      key: "banner",
      header: "Banner",
      className: "channel-cell-banner",
      render: (channel) => {
        const src = imageSrc(channel);
        return src ? (
          <img
            key={revisions[channel.cid]}
            className="channel-thumb"
            src={src}
            alt={channel.name}
            loading="lazy"
            onError={() => markBroken(src)}
          />
        ) : (
          <span className="channel-thumb channel-thumb-empty">No image</span>
        );
      },
    },
    {
      key: "image",
      header: "Image",
      className: "channel-cell-state",
      render: (channel) => (
        <span className="channel-state">
          <ImageState channel={channel} />
          {failed(channel) && (
            <span className="channel-image-note">Banner could not be loaded</span>
          )}
          {errors[channel.cid] && (
            <span className="channel-row-error" role="alert">
              {errors[channel.cid]}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "id",
      header: "ID",
      wideOnly: true,
      className: "channel-cell-number",
      render: (channel) => `#${channel.cid}`,
    },
    {
      key: "size",
      header: "Size",
      wideOnly: true,
      className: "channel-cell-number",
      render: (channel) => (channel.hasImage && formatImageSize(channel.size)) || "—",
    },
    {
      key: "action",
      header: <span className="ds-visually-hidden">Action</span>,
      align: "end",
      className: "channel-cell-action",
      render: (channel) => {
        const busy = operations[channel.cid];
        const verb = channel.hasImage ? "Replace" : "Upload";
        return (
          <span className="channel-action">
            {busy && <Spinner />}
            <FileButton
              id={`file-upload-${channel.cid}`}
              aria-label={`${verb} image of ${channel.name}`}
              label={busy ?? `${verb}…`}
              disabled={Boolean(busy)}
              error={fileErrors[channel.cid]}
              onFile={(file) => void changeImage(channel.cid, file)}
            />
          </span>
        );
      },
    },
  ];

  return (
    <div className="channel-images">
      <h1 className="ds-visually-hidden">Manage channel images</h1>
      <StudioToolbar>
        <ToolbarButton
          icon="refresh"
          label="Refresh channels"
          onClick={() => void reload()}
          disabled={loading}
        />
      </StudioToolbar>

      <FilterBar
        search={
          <TextField
            id="channel-search"
            type="search"
            label="Search channels"
            labelHidden
            value={query}
            placeholder="Filter channels"
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        filter={
          <SegmentedControl
            label="Image status"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
        }
        count={
          loading || error
            ? undefined
            : `${visible.length} of ${channels.length} channel${channels.length === 1 ? "" : "s"} · ${withImage} with an image`
        }
      />

      {loading && <StateTile icon="refresh" title="Loading channels…" role="status" />}

      {!loading && error && (
        <StateTile
          icon="alert"
          title="Couldn't load the channels."
          role="alert"
          action={<Button onClick={() => void reload()}>Try again</Button>}
        >
          {error}
        </StateTile>
      )}

      {!loading && !error && visible.length === 0 && (
        <StateTile
          icon="inbox"
          title={channels.length ? "No channels match these filters." : "No channels found."}
          action={
            filtered && channels.length ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Reset filters
              </Button>
            ) : (
              <Button onClick={() => void reload()}>Refresh</Button>
            )
          }
        >
          {channels.length
            ? "Clear the search or choose a different image status."
            : "TeamSpeak reported no channels for this server."}
        </StateTile>
      )}

      {!loading && !error && visible.length > 0 && (
        <DataTable
          label="Channels"
          columns={columns}
          rows={visible}
          rowKey={(channel) => channel.cid}
          selectedKey={selected?.cid ?? null}
          onSelect={(channel) => setSelectedCid(channel.cid)}
          onDropFile={(channel, file) => {
            if (!locks.current.has(channel.cid)) void changeImage(channel.cid, file);
          }}
          rowLabel={(channel) => `${channel.name}, #${channel.cid}`}
          rowProps={(channel) => ({ className: "channel-row", "data-cid": channel.cid })}
          footer="Drop an image on a row to replace that channel's banner. Spacer channels without their own image use the spacer base image."
        />
      )}

      <StudioInspector>
        <div className="channel-inspector">
          <div className="channel-inspector-head" aria-hidden="true">
            Inspector
          </div>
          {selected && (
            <ChannelInspector
              channel={selected}
              channels={channels}
              imageSrc={imageSrc(selected)}
              imageFailed={failed(selected)}
              busy={operations[selected.cid]}
              fileError={fileErrors[selected.cid]}
              onFile={(file) => void changeImage(selected.cid, file)}
              onRemove={() => setRemoving(selected.cid)}
            />
          )}
          <SpacerBaseImageManager onChanged={reload} />
        </div>
      </StudioInspector>

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
    </div>
  );
}
