import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Cropper from "cropperjs";
import { useSearchParams } from "react-router-dom";
import { GET_IMAGE_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchBlob, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { imageFileError } from "../api/image-file";
import type { Channel } from "../api/types";
import { useChannels } from "../hooks/useChannels";
import {
  Button,
  Canvas,
  FieldError,
  FileButton,
  Icon,
  InspectorSection,
  NumberField,
  Panel,
  PropertyRow,
  RequestError,
  Select,
  Spinner,
  StatusGlyph,
  StudioInspector,
  StudioToolbar,
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
  heightForWidth,
  widthForHeight,
} from "./bannerExport";
import { EditorDock } from "./EditorDock";
import { EditorLayers } from "./EditorLayers";
import "./BannerCropper.css";

const FIELD_IDS = { cid: "banner-channel", file: "file-upload", url: "imageUrl" };

/** The crop in source pixels, as the X / Y / W / H fields show it. */
type CropBox = { x: number; y: number; width: number; height: number };
type CropKey = keyof CropBox;
const CROP_FIELDS: { key: CropKey; label: string; keyLabel: string }[] = [
  { key: "x", label: "X", keyLabel: "X" },
  { key: "y", label: "Y", keyLabel: "Y" },
  { key: "width", label: "Width", keyLabel: "W" },
  { key: "height", label: "Height", keyLabel: "H" },
];

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

/** "Gaming Area / Hytale" from the channel's parents. */
function channelPath(channel: Channel, channels: Channel[]) {
  const names = [channel.name];
  let parent = channels.find((c) => c.cid === channel.pid);
  while (parent) {
    names.unshift(parent.name);
    const pid = parent.pid;
    parent = channels.find((c) => c.cid === pid);
  }
  return names.join(" / ");
}

/**
 * The Banner editor as D2's Studio editor (T-142-F3 items 4–8): the layer
 * panel, the canvas with the crop, the dock with the TeamSpeak preview,
 * before/after and the saved strip, and the inspector. Every visible control
 * acts on the cropper; tools it cannot support are left out.
 */
export default function BannerCropper() {
  const { channels, setChannels, loading, error: channelsError, reload } = useChannels();
  const [params] = useSearchParams();
  const [cid, setCid] = useState(params.get("channel") || "");
  const [imageUrl, setImageUrl] = useState("");
  const [fileResetKey, setFileResetKey] = useState(0);
  const [source, setSource] = useState("");
  const [sourceInfo, setSourceInfo] = useState<{ name: string; type: string }>({
    name: "",
    type: "",
  });
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const [ready, setReady] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [savedRevision, setSavedRevision] = useState<number>();
  const [preview, setPreview] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const [drafts, setDrafts] = useState<Partial<Record<CropKey, string>>>({});
  const [zoom, setZoom] = useState<number>();
  const [label, setLabel] = useState<{ left: number; top: number }>();
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

  // The preview, the crop numbers and the size label follow the crop within
  // one animation frame; the preview comes from the same export the upload
  // uses (T-142-F1 item 15).
  const schedulePreview = useCallback((generation: number) => {
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = requestAnimationFrame(() => {
      const current = cropper.current;
      if (!current || generation !== cropperGeneration.current) return;
      const data = current.getData(true);
      setCrop({ x: data.x, y: data.y, width: data.width, height: data.height });
      const box = current.getCropBoxData?.();
      if (box) setLabel({ left: box.left + box.width / 2, top: box.top + box.height });
      try {
        setPreview(bannerDataUrl(exportBanner(current)));
      } catch {
        setPreview(null);
      }
    });
  }, []);

  const readZoom = useCallback(() => {
    const image = cropper.current?.getImageData?.();
    if (image?.naturalWidth) setZoom(image.width / image.naturalWidth);
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
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      const generation = ++cropperGeneration.current;
      setReady(false);
      cropper.current?.destroy();
      cropper.current = null;
      cropper.current = new Cropper(image, {
        aspectRatio: TARGET_WIDTH / TARGET_HEIGHT,
        viewMode: 1,
        autoCropArea: 1,
        // One interaction on the stage: drag moves the image under the
        // fixed-ratio frame, the wheel zooms. Mode tools would be no-ops.
        dragMode: "move",
        cropBoxResizable: false,
        responsive: true,
        // No dashed guide lines: the page keeps one dashed element, the drop zone.
        guides: false,
        center: false,
        data,
        ready() {
          if (generation !== cropperGeneration.current) return;
          // The crop selection frame is one of the accent uses (T-142-F1 item 1).
          boxRef.current?.querySelector(".cropper-crop-box")?.setAttribute("data-accent", "crop");
          setReady(true);
          setLoadingImage(false);
          readZoom();
          schedulePreview(generation);
        },
        crop() {
          if (generation !== cropperGeneration.current) return;
          setUnsaved(true);
          schedulePreview(generation);
        },
        zoom(event) {
          if (generation === cropperGeneration.current) setZoom(event.detail.ratio);
        },
      });
    },
    [source, reportField, schedulePreview, readZoom],
  );
  useEffect(() => {
    setReady(false);
    setPreview(null);
    setLabel(undefined);
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

  const selectChannel = (next: string) => {
    fields.clear("cid");
    setCid(next);
    setSavedRevision(undefined);
  };

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
      if (sequence !== sourceSequence.current) return;
      setSourceInfo({ name: file.name, type: file.type });
      setSource(String(reader.result));
    };
    reader.onerror = () => {
      if (sequence === sourceSequence.current) {
        reportField("file", "This file could not be read. Choose another image.");
        setLoadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };
  /** A file that arrived outside the drop zone: dropped on the page, pasted or opened. */
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
    let url: URL;
    try {
      url = new URL(value.trim());
      if (url.protocol !== "https:") throw new Error("HTTPS required");
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
      if (sequence === sourceSequence.current) {
        setSourceInfo({ name: url.pathname.split("/").pop() || url.hostname, type: blob.type });
        setSource(URL.createObjectURL(blob));
      }
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

  // Focus after "Crop & send image" (README, "Focus after the main action"):
  // the channel select after a save, the error message after a failure.
  // Applied once the controls are enabled again, so focus never falls back
  // to <body>; a successful save does not scroll the page (R6).
  const focusAfterSave = useRef<"channel" | "error" | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (uploading || !focusAfterSave.current) return;
    const target = focusAfterSave.current;
    focusAfterSave.current = null;
    if (target === "channel")
      document.getElementById(FIELD_IDS.cid)?.focus({ preventScroll: true });
    else errorRef.current?.focus();
  }, [uploading, error]);

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
      const revision = Date.now();
      setSavedRevision(revision);
      setUnsaved(false);
      // The layer panel and "Before" show the new banner without a reload.
      setChannels((previous) =>
        previous.map((c) =>
          c.cid === cid ? { ...c, hasImage: true, contentHash: String(revision) } : c,
        ),
      );
      showToast("Image uploaded successfully!", "success");
      bumpRefresh();
      focusAfterSave.current = "channel";
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
        focusAfterSave.current = "error";
      }
    } finally {
      lock.current = false;
      setUploading(false);
    }
  };

  // Crop numbers (T-142-F3 item 5, R6): typed values set the crop in source
  // pixels; W and H keep the 500 : 44 ratio.
  const applyCrop = (key: CropKey, value: number) => {
    const current = cropper.current;
    if (!current) return;
    const data = current.getData(true);
    const next = { ...data, [key]: value };
    if (key === "width") next.height = heightForWidth(value);
    if (key === "height") next.width = widthForHeight(value);
    current.setData({ x: next.x, y: next.y, width: next.width, height: next.height });
  };
  const typeCrop = (key: CropKey, text: string) => {
    setDrafts((previous) => ({ ...previous, [key]: text }));
    const value = Number(text);
    if (text.trim() !== "" && Number.isFinite(value) && value >= 0)
      applyCrop(key, Math.round(value));
  };
  const stepCrop = (key: CropKey, event: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowUp: 1, ArrowDown: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    setDrafts((previous) => ({ ...previous, [key]: undefined }));
    applyCrop(key, Math.max(0, crop[key] + step * (event.shiftKey ? 10 : 1)));
  };
  const fit = () => {
    const current = cropper.current;
    if (!current) return;
    const data = current.getData();
    current.reset();
    current.setData(data);
    readZoom();
  };

  const currentBanner = selected?.hasImage ? channelImageUrl(selected, savedRevision) : null;
  const tools = !ready || uploading;
  const sourceMeta =
    natural && source
      ? `${(sourceInfo.type.split("/")[1] || "image").toUpperCase()} · ${natural.width} × ${natural.height}`
      : undefined;

  return (
    <div
      className="studio-editor"
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
      <h1 className="ds-visually-hidden">Create a channel banner</h1>

      <StudioToolbar>
        <Toolbar label="Canvas tools">
          <ToolbarButton icon="expand" label="Fit to screen" disabled={tools} onClick={fit} />
          <ToolbarButton
            icon="zoomOut"
            label="Zoom out"
            disabled={tools}
            onClick={() => cropper.current?.zoom(-0.1)}
          />
          <span className="editor-zoom" aria-label="Zoom level">
            {zoom !== undefined && ready ? `${Math.round(zoom * 100)} %` : "– %"}
          </span>
          <ToolbarButton
            icon="zoomIn"
            label="Zoom in"
            disabled={tools}
            onClick={() => cropper.current?.zoom(0.1)}
          />
        </Toolbar>
      </StudioToolbar>

      <EditorLayers
        channels={channels}
        loading={loading}
        error={channelsError}
        selectedCid={cid}
        onSelect={selectChannel}
        onRefresh={() => void reload()}
        disabled={uploading}
      />

      <Canvas
        label="Crop stage"
        className="editor-canvas"
        stageProps={{ "data-testid": "crop-stage" }}
        overlay={
          source && ready ? (
            <p className="editor-canvas-hint">
              Drag to move · Scroll to zoom · <kbd>Ctrl V</kbd> paste
            </p>
          ) : undefined
        }
      >
        <div className="artboard">
          {source && (
            <span className="artboard-name">
              {sourceInfo.name || "Image"}
              {natural && ` · ${natural.width} × ${natural.height}`}
            </span>
          )}
          <div ref={boxRef} className={`preview-box${source ? "" : " preview-box-empty"}`}>
            {source ? (
              <>
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
                {ready && label && (
                  <span className="crop-size" style={{ left: label.left, top: label.top }}>
                    {crop.width} × {crop.height} → {TARGET_WIDTH} × {TARGET_HEIGHT}
                  </span>
                )}
              </>
            ) : (
              <div className="editor-drop">
                <UploadInput
                  id="file-upload"
                  resetKey={fileResetKey}
                  error={fields.errors.file}
                  disabled={uploading}
                  onFile={selectFile}
                  label="Drop an image here, or click to browse"
                />
                <p className="editor-drop-hint">
                  You can also paste an image or an image URL with <kbd>Ctrl V</kbd>.
                </p>
              </div>
            )}
          </div>
        </div>
      </Canvas>

      <EditorDock
        channels={channels}
        selected={selected}
        crop={ready ? preview : null}
        current={currentBanner}
        unsaved={unsaved}
        justSaved={savedRevision !== undefined}
      />

      <StudioInspector>
        <Panel title="Inspector" className="editor-inspector">
          <InspectorSection title="Channel" meta={selected ? `#${selected.cid}` : undefined}>
            <Select
              id={FIELD_IDS.cid}
              label="Channel"
              labelHidden
              error={fields.errors.cid}
              value={cid}
              disabled={loading || uploading}
              onChange={(e) => selectChannel(e.target.value)}
            >
              <option value="">{loading ? "Loading channels…" : "Choose a channel"}</option>
              {channels.map((c) => (
                <option key={c.cid} value={c.cid}>
                  {c.name}
                  {c.pid
                    ? ` — under ${channels.find((p) => p.cid === c.pid)?.name ?? "parent"}`
                    : ""}{" "}
                  (#{c.cid})
                </option>
              ))}
            </Select>
            {selected && (
              <>
                <PropertyRow label="Path">{channelPath(selected, channels)}</PropertyRow>
                <PropertyRow label="Current">
                  {selected.hasImage ? (
                    <StatusGlyph tone="positive" label="Own image" />
                  ) : (
                    <StatusGlyph tone="warning" label="No image" />
                  )}
                </PropertyRow>
              </>
            )}
          </InspectorSection>

          <InspectorSection title="Source" meta={sourceMeta}>
            <PropertyRow label="URL">
              <TextField
                id={FIELD_IDS.url}
                label="Image URL"
                labelHidden
                error={fields.errors.url}
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  fields.clear("url");
                  setImageUrl(e.target.value);
                }}
                placeholder="https://…"
                disabled={uploading}
              />
            </PropertyRow>
            <div className="editor-actions-row">
              <FileButton id="file-open" label="Open…" onFile={acceptFile} disabled={uploading} />
              <Button
                variant="plain"
                disabled={loadingImage || uploading}
                onClick={() => void loadUrl()}
              >
                {loadingImage && <Spinner />}
                {loadingImage ? "Loading…" : "Load URL"}
              </Button>
            </div>
            {source && <FieldError id={FIELD_IDS.file} message={fields.errors.file} />}
            <p className="editor-hint">
              Drop a file on the canvas or paste with <kbd>Ctrl V</kbd>.
            </p>
          </InspectorSection>

          <InspectorSection
            title="Crop"
            meta={
              <span className="editor-lock">
                <Icon name="lock" size={11} />
                {TARGET_WIDTH} : {TARGET_HEIGHT}
              </span>
            }
          >
            <div className="crop-fields">
              {CROP_FIELDS.map(({ key, label: name, keyLabel }) => (
                <NumberField
                  key={key}
                  id={`crop-${key}`}
                  label={name}
                  keyLabel={keyLabel}
                  unit="px"
                  value={drafts[key] ?? (ready ? String(crop[key]) : "")}
                  disabled={tools}
                  onChange={(e) => typeCrop(key, e.target.value)}
                  onKeyDown={(e) => stepCrop(key, e)}
                  onBlur={() => setDrafts((previous) => ({ ...previous, [key]: undefined }))}
                />
              ))}
            </div>
          </InspectorSection>

          <InspectorSection title="Export" meta={`PNG · ${TARGET_WIDTH} × ${TARGET_HEIGHT}`}>
            <PropertyRow label="Target">
              {selected ? `${selected.name} (#${selected.cid})` : "Choose a channel"}
            </PropertyRow>
            <PropertyRow label="Replaces">
              {selected?.hasImage ? `Current banner of ${selected.name}` : "No current banner"}
            </PropertyRow>
            {error && (
              <div ref={errorRef} tabIndex={-1} className="editor-error">
                <RequestError message={error} />
              </div>
            )}
            <Button
              variant="prominent"
              className="editor-send"
              icon={uploading ? undefined : "send"}
              onClick={() => void upload()}
              disabled={uploading || !ready || !selected}
            >
              {uploading && <Spinner />}
              {uploading ? "Uploading…" : "Crop & send image"}
            </Button>
            <p className="editor-hint">
              {selected
                ? "TeamSpeak picks up the new banner on its next refresh."
                : "Choose a channel to enable saving."}
            </p>
          </InspectorSection>
        </Panel>
      </StudioInspector>
    </div>
  );
}
