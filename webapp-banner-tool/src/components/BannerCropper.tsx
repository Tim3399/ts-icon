import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Cropper from "cropperjs";
import { useSearchParams } from "react-router-dom";
import { GET_IMAGE_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchBlob, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { imageFileError } from "../api/image-file";
import { useChannels } from "../hooks/useChannels";
import {
  BannerFrame,
  Button,
  EmptyState,
  ListRow,
  ListSection,
  PageHeader,
  RequestError,
  Select,
  Spinner,
  StatusGlyph,
  TextField,
  Toolbar,
  ToolbarButton,
  UploadInput,
  useToast,
} from "../design";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import { uploadFieldError, useFieldErrors } from "../hooks/useFieldErrors";
import {
  BANNER_HEIGHT as TARGET_HEIGHT,
  BANNER_WIDTH as TARGET_WIDTH,
  bannerBlob,
  bannerDataUrl,
  exportBanner,
} from "./bannerExport";
import { TeamSpeakPreview } from "./TeamSpeakPreview";
import "./BannerCropper.css";

const FIELD_IDS = { cid: "banner-channel", file: "file-upload", url: "imageUrl" };

const NUDGE = [
  ["Move left", "left", -10, 0],
  ["Move up", "up", 0, -10],
  ["Move down", "down", 0, 10],
  ["Move right", "right", 10, 0],
] as const;

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** The first image file on the clipboard, if any. */
function clipboardImage(data: DataTransfer | null) {
  if (!data) return undefined;
  const files = Array.from(data.files ?? []);
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return [...files, ...fromItems].find((file) => file.type.startsWith("image/"));
}

export default function BannerCropper() {
  const { channels, loading, error: channelsError, reload } = useChannels();
  const [params] = useSearchParams();
  const [cid, setCid] = useState(params.get("channel") || "");
  const [imageUrl, setImageUrl] = useState("");
  const [fileResetKey, setFileResetKey] = useState(0);
  const [source, setSource] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [savedRevision, setSavedRevision] = useState<number>();
  const [preview, setPreview] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cropper = useRef<Cropper | null>(null);
  const cropperGeneration = useRef(0);
  const previewFrame = useRef(0);
  const readerRef = useRef<FileReader | null>(null);
  const sourceRequest = useRef<AbortController | null>(null);
  const sourceSequence = useRef(0);
  const lock = useRef(false);
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { bumpRefresh } = usePreviewOverlay();
  const selected = channels.find((c) => c.cid === cid);
  const fields = useFieldErrors(FIELD_IDS, uploading || loadingImage);
  const reportField = fields.report;
  const sourceField = useRef<"file" | "url">("file");

  // The TeamSpeak preview follows the crop within one animation frame, from
  // the same export the upload uses (T-142-F1 item 15).
  const schedulePreview = useCallback((generation: number) => {
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = requestAnimationFrame(() => {
      const current = cropper.current;
      if (!current || generation !== cropperGeneration.current) return;
      try {
        setPreview(bannerDataUrl(exportBanner(current)));
      } catch {
        setPreview(null);
      }
    });
  }, []);

  const initialize = useCallback(
    (data?: Cropper.Data) => {
      const image = imageRef.current;
      if (!image || !image.complete || !image.naturalWidth || !source) return;
      if (image.naturalWidth * image.naturalHeight > 40_000_000) {
        reportField(sourceField.current, "Choose an image with at most 40 million pixels.");
        setReady(false);
        setLoadingImage(false);
        return;
      }
      const generation = ++cropperGeneration.current;
      setReady(false);
      cropper.current?.destroy();
      cropper.current = null;
      cropper.current = new Cropper(image, {
        aspectRatio: TARGET_WIDTH / TARGET_HEIGHT,
        viewMode: 1,
        autoCropArea: 1,
        dragMode: "move",
        cropBoxResizable: false,
        responsive: true,
        // No dashed guide lines: the page keeps one dashed element, the drop zone.
        guides: false,
        center: false,
        data,
        ready() {
          if (generation !== cropperGeneration.current) return;
          // The crop selection frame is one of the five accent uses (T-142-F1 item 1).
          boxRef.current?.querySelector(".cropper-crop-box")?.setAttribute("data-accent", "crop");
          setReady(true);
          setLoadingImage(false);
          schedulePreview(generation);
        },
        crop() {
          if (generation === cropperGeneration.current) schedulePreview(generation);
        },
      });
    },
    [source, reportField, schedulePreview],
  );
  useEffect(() => {
    setReady(false);
    setPreview(null);
    if (imageRef.current?.complete) initialize();
    const generation = cropperGeneration;
    return () => {
      generation.current++;
      cancelAnimationFrame(previewFrame.current);
      cropper.current?.destroy();
      cropper.current = null;
      if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    };
  }, [source, initialize]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let width = box.clientWidth,
      height = box.clientHeight;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (width === box.clientWidth && height === box.clientHeight) return;
      width = box.clientWidth;
      height = box.clientHeight;
      const data = cropper.current?.getData();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => initialize(data));
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [initialize]);
  useEffect(
    () => () => {
      sourceSequence.current++;
      readerRef.current?.abort();
      sourceRequest.current?.abort();
    },
    [],
  );

  const selectFile = (file: File) => {
    fields.clear("file");
    fields.clear("url");
    sourceField.current = "file";
    sourceRequest.current?.abort();
    readerRef.current?.abort();
    const sequence = ++sourceSequence.current;
    const reader = new FileReader();
    readerRef.current = reader;
    setError("");
    setLoadingImage(true);
    setReady(false);
    setSource("");
    reader.onload = () => {
      if (sequence === sourceSequence.current) setSource(String(reader.result));
    };
    reader.onerror = () => {
      if (sequence === sourceSequence.current) {
        reportField("file", "This file could not be read. Choose another image.");
        setLoadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };
  /** A file that arrived outside the drop zone: dropped on the page or pasted. */
  const acceptFile = (file: File) => {
    if (uploading) return;
    setFileResetKey((previous) => previous + 1);
    const issue = imageFileError(file);
    if (issue) {
      sourceField.current = "file";
      reportField("file", issue);
      return;
    }
    selectFile(file);
  };
  const loadUrl = async (value = imageUrl) => {
    if (!value.trim()) {
      reportField("url", "Enter an image URL first.");
      return;
    }
    try {
      if (new URL(value.trim()).protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      reportField("url", "Enter a complete HTTPS image URL.");
      return;
    }
    fields.clear("url");
    fields.clear("file");
    setFileResetKey((previous) => previous + 1);
    sourceField.current = "url";
    readerRef.current?.abort();
    sourceRequest.current?.abort();
    const sequence = ++sourceSequence.current;
    const controller = new AbortController();
    sourceRequest.current = controller;
    setLoadingImage(true);
    setReady(false);
    setError("");
    try {
      const blob = await apiFetchBlob(`${GET_IMAGE_URL}?url=${encodeURIComponent(value.trim())}`, {
        getToken,
        signal: controller.signal,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      if (sequence === sourceSequence.current) setSource(URL.createObjectURL(blob));
    } catch (err) {
      if (!controller.signal.aborted) {
        if (!fields.receive(err))
          setError(describeApiError(err, "This image could not be loaded."));
        setLoadingImage(false);
      }
    }
  };

  // Ctrl/Cmd+V anywhere on the page: image data, or an image URL outside a
  // text field (T-142-F1 item 13). The listener reads the latest handlers.
  const paste = useRef<(event: ClipboardEvent) => void>(() => {});
  paste.current = (event: ClipboardEvent) => {
    if (uploading) return;
    const file = clipboardImage(event.clipboardData);
    if (file) {
      event.preventDefault();
      acceptFile(file);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const text = event.clipboardData?.getData("text/plain").trim() ?? "";
    if (!/^https?:\/\/\S+$/i.test(text)) return;
    event.preventDefault();
    setImageUrl(text);
    void loadUrl(text);
  };
  useEffect(() => {
    const listener = (event: ClipboardEvent) => paste.current(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  const upload = async () => {
    if (lock.current || !cropper.current || !ready || !selected) return;
    lock.current = true;
    setUploading(true);
    fields.clear();
    setError("");
    try {
      const blob = await bannerBlob(exportBanner(cropper.current));
      const body = new FormData();
      body.append("file", blob, "banner.png");
      await apiFetch(channelImageEndpoint(cid), {
        method: "POST",
        body,
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      setSavedRevision(Date.now());
      showToast("Image uploaded successfully!", "success");
      bumpRefresh();
    } catch (err) {
      const message = describeApiError(
        err,
        "The image could not be saved. Choose a smaller image or try again.",
      );
      const fileError = uploadFieldError(err);
      if (fileError) reportField("file", fileError);
      else if (!fields.receive(err)) {
        setError(message);
        showToast(message, "error");
      }
    } finally {
      lock.current = false;
      setUploading(false);
    }
  };
  const adjust = (x: number, y: number) => {
    const current = cropper.current;
    if (!current) return;
    const data = current.getData();
    current.setData({ x: data.x + x, y: data.y + y });
  };

  const hasSavedArt = Boolean(
    selected && (selected.hasImage || selected.hasFallback || savedRevision),
  );
  const savedBanner = selected && hasSavedArt ? channelImageUrl(selected, savedRevision) : null;

  return (
    <div
      className="banner-editor"
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) acceptFile(file);
      }}
    >
      <PageHeader
        title="Create a channel banner"
        subtitle={`Choose a channel and an image, frame it and save it as a ${TARGET_WIDTH} × ${TARGET_HEIGHT} banner.`}
      />

      <ListSection header="Channel">
        {channelsError && (
          <li className="editor-pane">
            <RequestError message={channelsError} retry={() => void reload()} />
          </li>
        )}
        <li className="editor-pane">
          <Select
            id={FIELD_IDS.cid}
            label="Channel"
            labelHidden
            error={fields.errors.cid}
            value={cid}
            disabled={loading || uploading}
            onChange={(e) => {
              fields.clear("cid");
              setCid(e.target.value);
              setSavedRevision(undefined);
            }}
          >
            <option value="">{loading ? "Loading channels…" : "Choose a channel"}</option>
            {channels.map((c) => (
              <option key={c.cid} value={c.cid}>
                {c.name}
                {c.pid ? ` — under ${channels.find((p) => p.cid === c.pid)?.name ?? "parent"}` : ""}{" "}
                (#{c.cid})
              </option>
            ))}
          </Select>
        </li>
        {selected && savedBanner && (
          <ListRow
            className="editor-current"
            leading={
              <BannerFrame
                className="editor-current-banner"
                src={savedBanner}
                alt={`Saved banner for ${selected.name}`}
                imageKey={savedRevision}
              />
            }
            title={savedRevision ? "Saved banner" : "Current banner"}
            subtitle={
              savedRevision ? <StatusGlyph tone="positive" label="Live in TeamSpeak" /> : undefined
            }
          />
        )}
      </ListSection>

      <ListSection
        header="Image"
        footer="You can also paste an image or an image URL with Ctrl+V (⌘V on a Mac)."
      >
        <li className="editor-pane">
          <UploadInput
            id="file-upload"
            resetKey={fileResetKey}
            error={fields.errors.file}
            disabled={uploading}
            onFile={selectFile}
          />
        </li>
        <ListRow
          className="editor-url"
          title={
            <TextField
              id="imageUrl"
              label="Image URL"
              labelHidden
              error={fields.errors.url}
              type="url"
              value={imageUrl}
              onChange={(e) => {
                fields.clear("url");
                setImageUrl(e.target.value);
              }}
              placeholder="https://example.com/banner.png"
              disabled={uploading}
            />
          }
          trailing={
            <Button
              disabled={loadingImage || uploading}
              icon={loadingImage ? undefined : "link"}
              onClick={() => void loadUrl()}
            >
              {loadingImage && <Spinner />}
              {loadingImage ? "Loading…" : "Load"}
            </Button>
          }
        />
      </ListSection>

      <ListSection
        header="Crop"
        footer={
          <span id="crop-help">
            Drag the image to frame it, or use the arrows. The banner is saved at {TARGET_WIDTH} ×{" "}
            {TARGET_HEIGHT} pixels.
          </span>
        }
      >
        {error && (
          <li className="editor-pane">
            <RequestError message={error} />
          </li>
        )}
        <li className="editor-pane editor-crop">
          <div
            ref={boxRef}
            data-testid="crop-stage"
            className={`preview-box crop-checker${isZoomed ? " preview-box-enlarged" : ""}`}
            aria-describedby="crop-help"
          >
            {source ? (
              <img
                key={source}
                ref={imageRef}
                src={source}
                alt="Preview"
                id="preview"
                onLoad={() => {
                  if (!cropper.current) initialize();
                }}
                onError={() => {
                  setReady(false);
                  setLoadingImage(false);
                  reportField(
                    sourceField.current,
                    "This image could not be decoded. Choose a PNG, JPEG or WebP image.",
                  );
                }}
              />
            ) : (
              <EmptyState
                className="crop-empty"
                icon="image"
                title="Add an image above, or paste one, to start framing your banner."
              />
            )}
          </div>
          <div className="crop-toolbar">
            <Toolbar label="Move the crop area">
              {NUDGE.map(([label, icon, x, y]) => (
                <ToolbarButton
                  key={label}
                  icon={icon}
                  label={label}
                  disabled={!ready || uploading}
                  onClick={() => adjust(x, y)}
                />
              ))}
            </Toolbar>
            <Toolbar label="Zoom">
              <ToolbarButton
                icon="zoomIn"
                label="Zoom in"
                disabled={!ready || uploading}
                onClick={() => cropper.current?.zoom(0.1)}
              />
              <ToolbarButton
                icon="zoomOut"
                label="Zoom out"
                disabled={!ready || uploading}
                onClick={() => cropper.current?.zoom(-0.1)}
              />
            </Toolbar>
            <Button
              variant="plain"
              size="small"
              icon={isZoomed ? "collapse" : "expand"}
              aria-expanded={isZoomed}
              onClick={() => setIsZoomed((v) => !v)}
            >
              {isZoomed ? "Shrink view" : "Enlarge view"}
            </Button>
          </div>
        </li>
      </ListSection>

      <ListSection header="TeamSpeak preview">
        <li className="editor-pane">
          <TeamSpeakPreview
            channels={channels}
            selected={selected}
            banner={ready ? preview : null}
            savedBanner={savedBanner}
          />
        </li>
      </ListSection>

      <div className="editor-actions">
        <p className="editor-hint">
          {selected
            ? `Saving replaces the banner of ${selected.name}.`
            : "Choose a channel to enable saving."}
        </p>
        <Button
          variant="prominent"
          icon={uploading ? undefined : "send"}
          onClick={() => void upload()}
          disabled={uploading || !ready || !selected}
        >
          {uploading && <Spinner />}
          {uploading ? "Uploading…" : "Crop & send image"}
        </Button>
      </div>
    </div>
  );
}
