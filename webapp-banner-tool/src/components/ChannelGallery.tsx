import React, { useEffect, useState } from 'react';
import { API_URL, GET_CHANNELS_LIST_URL, VIEW_IMAGE_URL } from '../config';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch, apiFetchJson, describeApiError, UPLOAD_TIMEOUT_MS } from '../api/client';
import { useToast } from './Toast';

type Channel = {
  name: string;
};

const ChannelGallery: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [missingImages, setMissingImages] = useState<Record<string, boolean>>({});
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [uploadingChannel, setUploadingChannel] = useState<string | null>(null);
  const [dragOverChannel, setDragOverChannel] = useState<string | null>(null);
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    setChannelsLoading(true);
    apiFetchJson<{ channels: string[] }>(GET_CHANNELS_LIST_URL, { getToken })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data.channels)) throw new Error('Response does not contain a valid channels array');
        setChannels(data.channels.map((c: string) => ({ name: c })));
      })
      .catch((err) => {
        if (cancelled) return;
        showToast(describeApiError(err,'Channel list could not be loaded'), 'error');
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, showToast]);

  const handleImageChange = async (channelName: string, file: File) => {
    setUploadingChannel(channelName);
    const formData = new FormData();
    formData.append('file', file, 'banner.png');
    try {
      // apiFetch throws on non-2xx responses, so reaching here means success.
      await apiFetch(`${API_URL}${encodeURIComponent(channelName)}`, {
        method: 'POST',
        body: formData,
        getToken,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      showToast('Image updated!', 'success');
      setMissingImages(prev => ({ ...prev, [channelName]: false }));
    } catch (err) {
      showToast(describeApiError(err,'Image could not be updated'), 'error');
    } finally {
      setUploadingChannel(null);
    }
  };

  const handleImageError = (channelName: string) => {
    setMissingImages(prev => ({ ...prev, [channelName]: true }));
  };

  // Lets a channel's banner be replaced by dragging an image file straight
  // onto its card, as an alternative to the file input below it. Both
  // paths end up at the same handleImageChange -- drag-and-drop is just
  // another way to supply the File object.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, channelName: string) => {
    e.preventDefault();
    if (dragOverChannel !== channelName) setDragOverChannel(channelName);
  };

  // dragleave fires when moving over any child element within the card too
  // (the image, the file input), not just when actually leaving the card --
  // ignoring those keeps the highlight from flickering while dragging over
  // a card's contents.
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, channelName: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOverChannel(prev => (prev === channelName ? null : prev));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, channelName: string) => {
    e.preventDefault();
    setDragOverChannel(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageChange(channelName, file);
  };

  return (
    <div>
      <div className="gallery-header">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
        <h2>Manage channel images</h2>
      </div>

      {channelsLoading && <p className="loading-state">Loading channels…</p>}
      {!channelsLoading && channels.length === 0 && (
        <p className="empty-state">No channels found.</p>
      )}

      {!channelsLoading && channels.length > 0 && (
        <div className="channel-grid">
          {channels.map((channel) => (
            <div
              className={`channel-card${dragOverChannel === channel.name ? ' channel-card-drag-over' : ''}`}
              key={channel.name}
              onDragOver={(e) => handleDragOver(e, channel.name)}
              onDragLeave={(e) => handleDragLeave(e, channel.name)}
              onDrop={(e) => handleDrop(e, channel.name)}
            >
              <div className="channel-card-image">
                {!missingImages[channel.name] ? (
                  <img
                    src={`${VIEW_IMAGE_URL}${encodeURIComponent(channel.name)}`}
                    alt={channel.name}
                    onError={() => handleImageError(channel.name)}
                  />
                ) : (
                  <span className="placeholder">No image available</span>
                )}
              </div>
              <div className="channel-card-name">{channel.name}</div>
              <label
                className={`dropzone dropzone-compact${dragOverChannel === channel.name ? ' dropzone-drag-over' : ''}`}
                htmlFor={`file-upload-${channel.name}`}
              >
                {uploadingChannel === channel.name ? 'Uploading…' : 'Drag & drop or click to upload'}
                <input
                  type="file"
                  id={`file-upload-${channel.name}`}
                  accept="image/*"
                  disabled={uploadingChannel === channel.name}
                  onChange={e => {
                    if (e.target.files?.[0]) handleImageChange(channel.name, e.target.files[0]);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChannelGallery;
