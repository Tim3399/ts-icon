import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { SPACER_BASE_IMAGE_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import {
  apiFetch,
  apiFetchBlob,
  ApiError,
  describeApiError,
  UPLOAD_TIMEOUT_MS,
} from "../api/client";
import { BannerFrame, FileButton, InspectorSection, RequestError, useToast } from "../design";
import { imageFileError } from "../api/image-file";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import { uploadFieldError } from "../hooks/useFieldErrors";
import "./SpacerBaseImageManager.css";

export default function SpacerBaseImageManager({
  onChanged,
}: {
  onChanged?: () => void | Promise<void>;
}) {
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { bumpRefresh } = usePreviewOverlay();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const loadImage = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const blob = await apiFetchBlob(SPACER_BASE_IMAGE_URL, {
        getToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setImageUrl(url);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 404) {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
        setImageUrl(null);
      } else {
        const message = describeApiError(err, "Spacer base image could not be loaded");
        setError(message);
        showToast(message, "error");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getToken, showToast]);
  useEffect(() => {
    void loadImage();
    return () => {
      request.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [loadImage]);
  const upload = async (file: File) => {
    if (locked.current) return;
    locked.current = true;
    setUploading(true);
    setError("");
    setFileError("");
    const body = new FormData();
    body.append("file", file);
    try {
      await apiFetch(SPACER_BASE_IMAGE_URL, {
        method: "POST",
        body,
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      showToast("Spacer base image updated!", "success");
      await loadImage();
      await onChanged?.();
      bumpRefresh();
    } catch (err) {
      const issue = uploadFieldError(err);
      if (issue) setFileError(issue);
      else {
        const message = describeApiError(err, "Spacer base image could not be updated");
        setError(message);
        showToast(message, "error");
      }
    } finally {
      locked.current = false;
      setUploading(false);
    }
  };
  const take = (file: File) => {
    const issue = imageFileError(file);
    setFileError(issue || "");
    if (!issue) void upload(file);
  };
  const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
  // D2 inspector section (T-142-F3 item 9); the whole section is the drop target.
  return (
    <div
      className="spacer-base"
      data-drag-over={dragOver || undefined}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) take(file);
      }}
    >
      <InspectorSection
        title="Spacer base image"
        meta={loading ? "loading" : imageUrl ? "set" : "not set"}
      >
        {imageUrl ? (
          <BannerFrame src={imageUrl} alt="Spacer base" className="spacer-base-banner" />
        ) : (
          <span className="spacer-base-empty">
            {loading ? "Loading…" : "No spacer base image set"}
          </span>
        )}
        <div className="spacer-base-actions">
          <FileButton
            id="spacer-base-image-upload"
            aria-label="Replace the spacer base image"
            label={uploading ? "Uploading…" : imageUrl ? "Replace…" : "Choose image…"}
            disabled={uploading}
            error={fileError}
            onFile={take}
          />
        </div>
        <p className="spacer-base-hint">Used for spacer channels without an image of their own.</p>
        <RequestError message={error} retry={() => void loadImage()} />
      </InspectorSection>
    </div>
  );
}
