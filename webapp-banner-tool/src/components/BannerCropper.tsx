import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import { API_URL, GET_IMAGE_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch, apiFetchBlob, apiFetchJson, describeApiError, UPLOAD_TIMEOUT_MS } from '../api/client';
import { useToast } from './Toast';
import ChannelAutocomplete from './ChannelAutocomplete';
import { usePreviewOverlay } from '../preview/PreviewOverlayContext';

const TARGET_WIDTH = 500;
const TARGET_HEIGHT = 44;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

const BannerCropper: React.FC = () => {
  const previewRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [channelName, setChannelName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [channelList, setChannelList] = useState<string[]>([]);
  const cropperRef = useRef<Cropper | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const toggleZoom = () => setIsZoomed(z => !z);
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { bumpRefresh } = usePreviewOverlay();
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (previewRef.current && previewRef.current.src) {
      setTimeout(() => {
        initCropper();
      }, 0);
    }
  }, [isZoomed]);

  useEffect(() => {
    let cancelled = false;

    apiFetchJson<{ channels: string[] }>(`${API_URL}channels`, { getToken })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data.channels)) throw new Error('Response does not contain a valid channels array');
        setChannelList(data.channels);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Could not load channel list:', err);
        showToast(describeApiError(err, 'Channel list could not be loaded'), 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, showToast]);

  const initCropper = () => {
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }

    const image = previewRef.current!;
    const options: Cropper.Options = {
      aspectRatio: TARGET_RATIO,
      viewMode: 1,
      autoCropArea: 1,
      dragMode: 'move',
      cropBoxResizable: false,
      ready() {
        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;
        let cropBoxWidth = naturalWidth;
        let cropBoxHeight = cropBoxWidth / TARGET_RATIO;

        if (cropBoxHeight > naturalHeight) {
          cropBoxHeight = naturalHeight;
          cropBoxWidth = cropBoxHeight * TARGET_RATIO;
        }

        cropperRef.current?.setCropBoxData({
          width: cropBoxWidth,
          height: cropBoxHeight,
          left: (naturalWidth - cropBoxWidth) / 2,
          top: (naturalHeight - cropBoxHeight) / 2,
        });
      }
    };

    cropperRef.current = new Cropper(image, options);
  };

  // Shared by both the click-to-browse file input and drag-and-drop --
  // either path ends up with a File object, this is what turns it into a
  // loaded preview ready for cropping.
  const loadFileIntoPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (previewRef.current) {
        previewRef.current.src = reader.result as string;
        previewRef.current.onload = () => initCropper();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadFileIntoPreview(file);
  };

  const handleDropzoneDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDropzoneDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };

  const handleDropzoneDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFileIntoPreview(file);
  };

  const handleUrlLoad = async () => {
    if (!imageUrl.trim()) {
      showToast('Please enter an image URL.', 'error');
      return;
    }

    setIsLoadingUrl(true);
    try {
      const blob = await apiFetchBlob(`${GET_IMAGE_URL}?url=${encodeURIComponent(imageUrl)}`, {
        getToken,
      });
      const objectURL = URL.createObjectURL(blob);

      if (previewRef.current) {
        previewRef.current.src = objectURL;
        previewRef.current.onload = () => initCropper();
      }
    } catch (err) {
      showToast(describeApiError(err, 'Error loading the image'), 'error');
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleUpload = () => {
    if (!cropperRef.current) {
      showToast('Please select an image first.', 'error');
      return;
    }
    if (!channelName.trim()) {
      showToast('Please enter a channel name.', 'error');
      return;
    }

    const cropData = cropperRef.current.getData(true);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropData.width;
    tempCanvas.height = cropData.height;

    const ctx = tempCanvas.getContext('2d');
    if (!ctx || !previewRef.current) return;

    ctx.drawImage(
      previewRef.current,
      cropData.x, cropData.y, cropData.width, cropData.height,
      0, 0, cropData.width, cropData.height
    );

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;

    const finalCtx = canvas.getContext('2d');
    if (!finalCtx) return;

    finalCtx.clearRect(0, 0, canvas.width, canvas.height);
    finalCtx.drawImage(tempCanvas, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    canvas.style.display = 'block';

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const formData = new FormData();
      formData.append('file', blob, 'banner.png');

      setIsUploading(true);
      try {
        // apiFetch throws on non-2xx responses, so reaching here means success.
        await apiFetch(`${API_URL}${encodeURIComponent(channelName)}`, {
          method: 'POST',
          body: formData,
          getToken,
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });
        showToast('Image uploaded successfully!', 'success');
        bumpRefresh();
      } catch (err) {
        showToast(describeApiError(err, 'Upload error'), 'error');
      } finally {
        setIsUploading(false);
      }
    }, 'image/png');
  };

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Channel</h2>
        <div className="field">
          <label className="label" htmlFor="channel">Channel name</label>
          <ChannelAutocomplete
            id="channel"
            value={channelName}
            onChange={setChannelName}
            channels={channelList}
            placeholder="lobby"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Image source</h2>
        <div className="field">
          <span className="label">Upload an image</span>
          <label
            className={`dropzone${isDragOver ? ' dropzone-drag-over' : ''}`}
            htmlFor="file-upload"
            onDragOver={handleDropzoneDragOver}
            onDragLeave={handleDropzoneDragLeave}
            onDrop={handleDropzoneDrop}
          >
            Drag &amp; drop an image here, or click to browse
            <input
              type="file"
              id="file-upload"
              onChange={handleFileChange}
              accept="image/*"
            />
          </label>
        </div>
        <div className="field">
          <label className="label" htmlFor="imageUrl">Or load from a URL</label>
          <div className="input-row">
            <input
              className="input"
              type="text"
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/banner.png"
              disabled={isLoadingUrl}
            />
            <button type="button" className="btn btn-secondary" onClick={handleUrlLoad} disabled={isLoadingUrl}>
              {isLoadingUrl ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="preview-toolbar">
          <h2 className="card-title" style={{ margin: 0 }}>Preview &amp; crop</h2>
          <button type="button" className="btn btn-ghost" onClick={toggleZoom}>
            {isZoomed ? 'Shrink view' : 'Enlarge view'}
          </button>
        </div>

        <div
          className="preview-box"
          style={{
            width: isZoomed ? 800 : 400,
            height: isZoomed ? 400 : 200,
          }}
        >
          <img ref={previewRef} alt="Preview" id="preview" />
        </div>

        <canvas ref={canvasRef} id="canvas-preview" width={TARGET_WIDTH} height={TARGET_HEIGHT} style={{ display: 'none' }} />
      </div>

      <div className="actions-row">
        <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Crop & send image'}
        </button>
      </div>
    </div>
  );
};

export default BannerCropper;
