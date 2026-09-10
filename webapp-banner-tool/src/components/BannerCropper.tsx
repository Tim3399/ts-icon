import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import { useSearchParams } from "react-router-dom";
import { GET_IMAGE_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchBlob, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import { channelImageEndpoint, channelImageUrl } from "../api/channels";
import { useChannels } from "../hooks/useChannels";
import { useToast } from "./ToastContext";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import UploadInput from "./UploadInput";
import RequestError from "./RequestError";
import FieldError from "./FieldError";
import Icon from "./ui/Icon";
import PageHeader from "./ui/PageHeader";
import Section from "./ui/Section";
import BannerFrame from "./ui/BannerFrame";
import { EmptyState } from "./ui/States";
import { fieldAttributes, uploadFieldError, useFieldErrors } from "../hooks/useFieldErrors";

const FIELD_IDS = { cid: "banner-channel", file: "file-upload", url: "imageUrl" };
const TARGET_WIDTH = 500,
  TARGET_HEIGHT = 44;

const NUDGE = [
  ["Move left", "left", -10, 0],
  ["Move up", "up", 0, -10],
  ["Move down", "down", 0, 10],
  ["Move right", "right", 10, 0],
] as const;

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
  const imageRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const cropper = useRef<Cropper | null>(null);
  const cropperGeneration = useRef(0);
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
        // Mirrors the current selection into the true-proportion strip below
        // the stage, so what will be saved is visible without saving first.
        preview: outputRef.current ?? undefined,
        data,
        ready() {
          if (generation !== cropperGeneration.current) return;
          setReady(true);
          setLoadingImage(false);
        },
      });
    },
    [source, reportField],
  );
  useEffect(() => {
    setReady(false);
    if (imageRef.current?.complete) initialize();
    const generation = cropperGeneration;
    return () => {
      generation.current++;
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
  const loadUrl = async () => {
    if (!imageUrl.trim()) {
      reportField("url", "Enter an image URL first.");
      return;
    }
    try {
      if (new URL(imageUrl.trim()).protocol !== "https:") throw new Error("HTTPS required");
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
      const blob = await apiFetchBlob(
        `${GET_IMAGE_URL}?url=${encodeURIComponent(imageUrl.trim())}`,
        { getToken, signal: controller.signal, timeoutMs: UPLOAD_TIMEOUT_MS },
      );
      if (sequence === sourceSequence.current) setSource(URL.createObjectURL(blob));
    } catch (err) {
      if (!controller.signal.aborted) {
        if (!fields.receive(err))
          setError(describeApiError(err, "This image could not be loaded."));
        setLoadingImage(false);
      }
    }
  };
  const upload = async () => {
    if (lock.current || !cropper.current || !ready || !selected) return;
    lock.current = true;
    setUploading(true);
    fields.clear();
    setError("");
    try {
      const canvas = cropper.current.getCroppedCanvas({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        imageSmoothingQuality: "high",
      });
      if (!canvas) throw new Error("Canvas unavailable");
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Image encoding failed"))),
          "image/png",
        ),
      );
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

  return (
    <div>
      <PageHeader
        eyebrow="Banner editor"
        icon="crop"
        title="Create a channel banner"
        lead={`Pick the channel, choose artwork, frame the ${TARGET_WIDTH} × ${TARGET_HEIGHT} pixel crop and save it straight to TeamSpeak.`}
      />
      <div className="workbench">
        <div className="workbench-side">
          <Section
            title="Target channel"
            step={1}
            subtitle="The saved banner replaces this channel's current image."
          >
            <RequestError message={channelsError} retry={() => void reload()} />
            <label className="field">
              Channel
              <span className="select-wrap">
                <select
                  id={FIELD_IDS.cid}
                  {...fieldAttributes(FIELD_IDS.cid, fields.errors.cid)}
                  className="input"
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
                      {c.pid
                        ? ` — under ${channels.find((p) => p.cid === c.pid)?.name ?? "parent"}`
                        : ""}{" "}
                      (#{c.cid})
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <FieldError id={FIELD_IDS.cid} message={fields.errors.cid} />
            {selected && hasSavedArt && (
              <div className="saved-preview">
                <p className="saved-preview-label">
                  <span>{savedRevision ? "Saved banner" : "Current banner"}</span>
                  {savedRevision && (
                    <span className="badge badge-success">
                      <Icon name="check" size={11} />
                      Live
                    </span>
                  )}
                </p>
                <BannerFrame
                  src={channelImageUrl(selected, savedRevision)}
                  alt={`Saved banner for ${selected.name}`}
                  imageKey={savedRevision}
                />
              </div>
            )}
          </Section>

          <Section
            title="Image source"
            step={2}
            subtitle="Upload a file, or fetch one over HTTPS through the server."
          >
            <UploadInput
              id="file-upload"
              resetKey={fileResetKey}
              error={fields.errors.file}
              disabled={uploading}
              onFile={selectFile}
            />
            <div className="field">
              <label htmlFor="imageUrl">Or load from a URL</label>
              <div className="input-row">
                <input
                  className="input"
                  id="imageUrl"
                  {...fieldAttributes(FIELD_IDS.url, fields.errors.url)}
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    fields.clear("url");
                    setImageUrl(e.target.value);
                  }}
                  placeholder="https://example.com/banner.png"
                  disabled={uploading}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loadingImage || uploading}
                  onClick={() => void loadUrl()}
                >
                  {loadingImage ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <Icon name="link" size={15} />
                  )}
                  {loadingImage ? "Loading…" : "Load"}
                </button>
              </div>
              <FieldError id={FIELD_IDS.url} message={fields.errors.url} />
            </div>
          </Section>
        </div>

        <div className="workbench-main">
          <RequestError message={error} />
          <Section
            title="Frame the crop"
            step={3}
            className="workbench-sticky"
            subtitle={
              <span id="crop-help">
                Drag the image to choose the visible area, or nudge it with the controls. The saved
                banner is always {TARGET_WIDTH} × {TARGET_HEIGHT} pixels.
              </span>
            }
            actions={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={isZoomed}
                onClick={() => setIsZoomed((v) => !v)}
              >
                <Icon name={isZoomed ? "collapse" : "expand"} size={15} />
                {isZoomed ? "Shrink view" : "Enlarge view"}
              </button>
            }
            footer={
              <>
                <p className="hint">
                  {selected
                    ? `Saving replaces the banner of ${selected.name}.`
                    : "Choose a channel to enable saving."}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => void upload()}
                  disabled={uploading || !ready || !selected}
                >
                  {uploading ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <Icon name="send" size={15} />
                  )}
                  {uploading ? "Uploading…" : "Crop & send image"}
                </button>
              </>
            }
          >
            <div className="crop-stage">
              <div
                ref={boxRef}
                className={`preview-box checkerboard${isZoomed ? " preview-box-enlarged" : ""}`}
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
                    icon="image"
                    title="No image loaded"
                    description="Upload a file or load a URL to start cropping."
                  />
                )}
              </div>

              <div className="crop-toolbar">
                <div className="nudge-pad" aria-label="Move the crop area" role="group">
                  {NUDGE.map(([label, icon, x, y]) => (
                    <button
                      type="button"
                      className="btn"
                      key={label}
                      aria-label={label}
                      title={label}
                      disabled={!ready || uploading}
                      onClick={() => adjust(x, y)}
                    >
                      <Icon name={icon} size={15} />
                    </button>
                  ))}
                </div>
                <div className="btn-cluster" role="group" aria-label="Zoom">
                  <button
                    type="button"
                    className="btn btn-icon btn-sm"
                    aria-label="Zoom in"
                    title="Zoom in"
                    disabled={!ready || uploading}
                    onClick={() => cropper.current?.zoom(0.1)}
                  >
                    <Icon name="zoomIn" size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-sm"
                    aria-label="Zoom out"
                    title="Zoom out"
                    disabled={!ready || uploading}
                    onClick={() => cropper.current?.zoom(-0.1)}
                  >
                    <Icon name="zoomOut" size={15} />
                  </button>
                </div>
              </div>

              <div className="saved-preview">
                <p className="saved-preview-label">
                  <span>Exact output · {`${TARGET_WIDTH} × ${TARGET_HEIGHT}`}</span>
                </p>
                <div
                  ref={outputRef}
                  className="banner-frame checkerboard banner-frame-ratio crop-output"
                  aria-hidden="true"
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
