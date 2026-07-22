import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SPACER_BASE_IMAGE_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch, apiFetchBlob, ApiError, describeApiError, UPLOAD_TIMEOUT_MS } from '../api/client';
import { useToast } from './Toast';

// Shown on both the banner-URLs admin page and the channel gallery, since
// spacer channels (and the image they fall back to) are relevant in both
// places -- rather than duplicating this whole block of state/handlers, it's
// factored out into its own self-contained component with no props.
const SpacerBaseImageManager: React.FC = () => {
  const { getToken } = useAuth();
  const { showToast } = useToast();

  // Fetched through apiFetchBlob rather than a plain <img src>, since
  // /images-local is JWT-gated and a plain <img> tag can't attach an
  // Authorization header.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const loadImage = useCallback(async () => {
    setLoading(true);
    try {
      const blob = await apiFetchBlob(SPACER_BASE_IMAGE_URL, { getToken });
      const objectUrl = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = objectUrl;
      setImageUrl(objectUrl);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setImageUrl(null);
      } else {
        showToast(describeApiError(err, 'Spacer base image could not be loaded'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, showToast]);

  useEffect(() => {
    loadImage();
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [loadImage]);

  const handleImageChange = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file, 'spacer-base.png');
    try {
      await apiFetch(SPACER_BASE_IMAGE_URL, {
        method: 'POST',
        body: formData,
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      showToast('Spacer base image updated!', 'success');
      await loadImage();
    } catch (err) {
      showToast(describeApiError(err, 'Spacer base image could not be updated'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageChange(file);
  };

  return (
    <div className="card">
      <h2 className="card-title">Spacer base image</h2>
      <p style={{ marginTop: 0 }}>
        Shown for any channel whose name contains "spacer", unless that channel has its own image set.
      </p>
      <div className="field">
        <div className="channel-card-image" style={{ maxWidth: 220 }}>
          {loading ? (
            <span className="placeholder">Loading…</span>
          ) : imageUrl ? (
            <img src={imageUrl} alt="Spacer base" />
          ) : (
            <span className="placeholder">No spacer base image set</span>
          )}
        </div>
      </div>
      <div className="field">
        <label
          className={`dropzone${dragOver ? ' dropzone-drag-over' : ''}`}
          htmlFor="spacer-base-image-upload"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploading ? 'Uploading…' : 'Drag & drop an image here, or click to browse'}
          <input
            type="file"
            id="spacer-base-image-upload"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files?.[0]) handleImageChange(e.target.files[0]);
            }}
          />
        </label>
      </div>
    </div>
  );
};

export default SpacerBaseImageManager;
