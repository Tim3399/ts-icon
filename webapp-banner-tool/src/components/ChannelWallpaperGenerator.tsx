import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CHANNEL_WALLPAPER_URL,
  CHANNEL_WALLPAPER_PREVIEW_URL,
  CHANNEL_WALLPAPER_UNDO_URL,
} from '../config';
import { useAuth } from '../auth/AuthProvider';
import { apiFetchJson, describeApiError, UPLOAD_TIMEOUT_MS } from '../api/client';
import { useToast } from './Toast';
import ChannelTreePreview from './ChannelTreePreview';

type SpacerMode = 'flat' | 'nested-spacer';

interface PreviewRow {
  depth: number;
  isSpacer: boolean;
  imageDataUrl: string;
}

interface CreatedChannel {
  cid: string;
  name: string;
  kind: 'art' | 'spacer';
  depth: number;
}

interface GenerateResult {
  createdChannels: CreatedChannel[];
  rowCount: number;
  failedAt?: { name: string; error: string };
}

// Generation does many ServerQuery round-trips plus one image encode per
// row, so it can legitimately run much longer than a single image upload.
const GENERATE_TIMEOUT_MS = 120_000;
const PREVIEW_DEBOUNCE_MS = 500;

function buildFormData(params: {
  file: File | null;
  sourceImageUrl: string;
  parentCid: string | null;
  namePrefix: string;
  spacerMode: SpacerMode;
  xOffset: string;
  yOffset: string;
  backgroundColor: string;
  coverFitMode: boolean;
}): FormData {
  const formData = new FormData();
  if (params.file) {
    formData.append('file', params.file);
  } else if (params.sourceImageUrl.trim()) {
    formData.append('sourceImageUrl', params.sourceImageUrl.trim());
  }
  if (params.parentCid) formData.append('parentCid', params.parentCid);
  formData.append('namePrefix', params.namePrefix);
  formData.append('spacerMode', params.spacerMode);
  if (params.xOffset.trim()) formData.append('xOffset', params.xOffset.trim());
  if (params.yOffset.trim()) formData.append('yOffset', params.yOffset.trim());
  if (params.backgroundColor.trim()) {
    formData.append('backgroundColor', params.backgroundColor.trim());
  }
  formData.append('coverFitMode', params.coverFitMode ? 'true' : 'false');
  return formData;
}

const ChannelWallpaperGenerator: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parentCid, setParentCid] = useState<string | null>(null);
  const [namePrefix, setNamePrefix] = useState('Wallpaper');
  const [spacerMode, setSpacerMode] = useState<SpacerMode>('flat');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [xOffset, setXOffset] = useState('');
  const [yOffset, setYOffset] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#00000000');
  const [coverFitMode, setCoverFitMode] = useState(true);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);

  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { showToast } = useToast();

  const hasSource = Boolean(file) || sourceImageUrl.trim().length > 0;

  // Debounced live preview: re-runs the real slicing endpoint (not a
  // reimplemented client-side approximation) shortly after any input that
  // affects the sliced output changes, so what's shown here can never drift
  // from what generation will actually produce.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!hasSource) {
      setPreviewRows([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewLoading(true);
      apiFetchJson<{ rows: PreviewRow[] }>(CHANNEL_WALLPAPER_PREVIEW_URL, {
        method: 'POST',
        body: buildFormData({
          file,
          sourceImageUrl,
          parentCid,
          namePrefix,
          spacerMode,
          xOffset,
          yOffset,
          backgroundColor,
          coverFitMode,
        }),
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      })
        .then((data) => setPreviewRows(data.rows))
        .catch((err) => {
          showToast(describeApiError(err, 'Preview could not be generated'), 'error');
        })
        .finally(() => setPreviewLoading(false));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, sourceImageUrl, parentCid, spacerMode, xOffset, yOffset, backgroundColor, coverFitMode, hasSource]);

  const handleDropzoneDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setSourceImageUrl('');
    }
  }, []);

  const handleSubmit = async () => {
    if (!hasSource) {
      showToast('Provide an image file or a source image URL first.', 'error');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const data = await apiFetchJson<GenerateResult>(CHANNEL_WALLPAPER_URL, {
        method: 'POST',
        body: buildFormData({
          file,
          sourceImageUrl,
          parentCid,
          namePrefix,
          spacerMode,
          xOffset,
          yOffset,
          backgroundColor,
          coverFitMode,
        }),
        getToken,
        timeoutMs: GENERATE_TIMEOUT_MS,
      });
      setResult(data);
      setTreeRefreshKey((k) => k + 1);
      if (data.failedAt) {
        showToast(
          `Created ${data.rowCount} channel(s), then stopped: ${data.failedAt.error}`,
          'error',
        );
      } else {
        showToast(`Created ${data.rowCount} channel(s).`, 'success');
      }
    } catch (err) {
      showToast(describeApiError(err, 'Channel wallpaper could not be generated'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!result || result.createdChannels.length === 0) return;
    const confirmed = window.confirm(
      `Delete the ${result.createdChannels.length} channel(s) just created?`,
    );
    if (!confirmed) return;

    setUndoing(true);
    try {
      const cids = result.createdChannels.map((c) => c.cid);
      const outcome = await apiFetchJson<{ deleted: string[]; failed: { cid: string; error: string }[] }>(
        CHANNEL_WALLPAPER_UNDO_URL,
        { method: 'POST', body: JSON.stringify({ cids }), headers: { 'Content-Type': 'application/json' }, getToken },
      );
      showToast(
        outcome.failed.length > 0
          ? `Deleted ${outcome.deleted.length}, ${outcome.failed.length} failed.`
          : `Deleted ${outcome.deleted.length} channel(s).`,
        outcome.failed.length > 0 ? 'error' : 'success',
      );
      setResult(null);
      setTreeRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(describeApiError(err, 'Undo failed'), 'error');
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div>
      <div className="gallery-header">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
        <h2>Channel wallpaper generator</h2>
      </div>

      <div className="card">
        <h2 className="card-title">1. Source image</h2>
        <label
          className={`dropzone${dragOver ? ' dropzone-drag-over' : ''}`}
          htmlFor="wallpaper-file-upload"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDragOver(false);
          }}
          onDrop={handleDropzoneDrop}
        >
          {file ? `Selected: ${file.name}` : 'Drag & drop the wallpaper image here, or click to browse'}
          <input
            type="file"
            id="wallpaper-file-upload"
            accept="image/*"
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) {
                setFile(chosen);
                setSourceImageUrl('');
              }
            }}
          />
        </label>
        <div className="field">
          <label className="label" htmlFor="wallpaper-source-url">Or load from a URL instead</label>
          <input
            className="input"
            id="wallpaper-source-url"
            type="url"
            placeholder="https://example.com/wallpaper.png"
            value={sourceImageUrl}
            onChange={(e) => {
              setSourceImageUrl(e.target.value);
              if (e.target.value) setFile(null);
            }}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">2. Parent channel</h2>
        <p style={{ marginTop: 0 }}>Click a channel below to nest the generated wallpaper under it, or leave "Top-level" selected.</p>
        <ChannelTreePreview
          selectable
          selectedCid={parentCid}
          onSelectParent={setParentCid}
          refreshKey={treeRefreshKey}
        />
      </div>

      <div className="card">
        <h2 className="card-title">3. Options</h2>
        <div className="field">
          <label className="label" htmlFor="wallpaper-name-prefix">Channel name prefix</label>
          <input
            className="input"
            id="wallpaper-name-prefix"
            type="text"
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="label">Spacer mode</span>
          <div className="actions-row">
            <button
              type="button"
              className={spacerMode === 'flat' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setSpacerMode('flat')}
            >
              Flat
            </button>
            <button
              type="button"
              className={spacerMode === 'nested-spacer' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setSpacerMode('nested-spacer')}
            >
              Nested spacer
            </button>
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? '▾ Hide advanced options' : '▸ Advanced options'}
        </button>
        {advancedOpen && (
          <>
            <div className="input-row">
              <div className="field">
                <label className="label" htmlFor="wallpaper-x-offset">X offset (px)</label>
                <input
                  className="input"
                  id="wallpaper-x-offset"
                  type="number"
                  value={xOffset}
                  onChange={(e) => setXOffset(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="wallpaper-y-offset">Y offset (px)</label>
                <input
                  className="input"
                  id="wallpaper-y-offset"
                  type="number"
                  value={yOffset}
                  onChange={(e) => setYOffset(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="wallpaper-bg-color">Background color (#RRGGBBAA)</label>
              <input
                className="input"
                id="wallpaper-bg-color"
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">
                <input
                  type="checkbox"
                  checked={coverFitMode}
                  onChange={(e) => setCoverFitMode(e.target.checked)}
                />
                {' '}Cover-fit mode (widen the source so nested rows still show real content)
              </label>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">4. Preview</h2>
        {previewLoading && <p className="loading-state">Slicing preview…</p>}
        {!previewLoading && previewRows.length === 0 && (
          <p className="empty-state">Add a source image to see a preview.</p>
        )}
        {!previewLoading && previewRows.length > 0 && (
          <div className="wallpaper-preview-stack">
            {previewRows.map((row, i) => (
              <img
                key={i}
                src={row.imageDataUrl}
                alt={row.isSpacer ? 'spacer row' : 'channel row'}
                style={{ marginLeft: row.depth * 20 }}
                className="wallpaper-preview-row"
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting || !hasSource}
        >
          {submitting ? 'Generating…' : 'Generate channels'}
        </button>
      </div>

      {result && (
        <div className="card">
          <h2 className="card-title">Result</h2>
          <p>Created {result.rowCount} channel(s).</p>
          {result.failedAt && (
            <p className="alert alert-error">
              Stopped at "{result.failedAt.name}": {result.failedAt.error}
            </p>
          )}
          <ul>
            {result.createdChannels.map((c) => (
              <li key={c.cid}>
                {c.name} ({c.kind}, depth {c.depth})
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleUndo}
            disabled={undoing}
          >
            {undoing ? 'Undoing…' : 'Undo this generation'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChannelWallpaperGenerator;
