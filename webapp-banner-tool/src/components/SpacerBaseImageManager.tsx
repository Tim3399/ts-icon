import { useCallback, useEffect, useRef, useState } from "react";
import { SPACER_BASE_IMAGE_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import {
  apiFetch,
  apiFetchBlob,
  ApiError,
  describeApiError,
  UPLOAD_TIMEOUT_MS,
} from "../api/client";
import { useToast } from "./ToastContext";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import UploadInput from "./UploadInput";
import RequestError from "./RequestError";
import Section from "./ui/Section";
import BannerFrame from "./ui/BannerFrame";
import { uploadFieldError } from "../hooks/useFieldErrors";

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
  return (
    <Section
      title="Spacer base image"
      icon="layers"
      subtitle="Used for every spacer channel that has no image of its own."
    >
      <div className="spacer-base">
        <BannerFrame
          src={imageUrl}
          alt="Spacer base"
          placeholder={loading ? "Loading…" : "No spacer base image set"}
        />
        <div className="spacer-base-upload">
          <UploadInput
            id="spacer-base-image-upload"
            error={fileError}
            disabled={uploading}
            label={uploading ? "Uploading…" : undefined}
            onFile={(file) => void upload(file)}
          />
        </div>
      </div>
      <RequestError message={error} retry={() => void loadImage()} />
    </Section>
  );
}
