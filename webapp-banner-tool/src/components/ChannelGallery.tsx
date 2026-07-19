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
    } catch (err) {
      showToast(describeApiError(err,'Image could not be updated'), 'error');
    } finally {
      setUploadingChannel(null);
    }
  };

  const handleImageError = (channelName: string) => {
    setMissingImages(prev => ({ ...prev, [channelName]: true }));
  };

    const allChannels = [{ name: 'spacer' }, ...channels];

  return (
    <div>
      <button onClick={() => navigate('/')}>Back</button>
      <h2>Manage channel images</h2>
      {channelsLoading && <p>Loading...</p>}
      {!channelsLoading && allChannels.map((channel, idx) => (
        <div key={channel.name || idx} style={{ marginBottom: 24 }}>
          <div>
            {!missingImages[channel.name] ? (
              <img
                src={`${VIEW_IMAGE_URL}${encodeURIComponent(channel.name)}`}
                alt={channel.name}
                style={{
                  width: 200,
                  height: 44,
                  objectFit: 'contain',
                  border: '1px solid #ccc',
                  display: 'block'
                }}
                onError={() => handleImageError(channel.name)}
              />
            ) : (
              <div style={{
                width: 200,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #ccc',
                background: '#f5f5f5',
                color: '#888'
              }}>
                No image available
              </div>
            )}
          </div>
          <div style={{ margin: '4px 0', fontWeight: 'bold', textAlign: 'center' }}>
            {channel.name}
          </div>
          <input
            type="file"
            accept="image/*"
            disabled={uploadingChannel === channel.name}
            onChange={e => {
              if (e.target.files?.[0]) handleImageChange(channel.name, e.target.files[0]);
            }}
          />
          {uploadingChannel === channel.name && <span style={{ marginLeft: 8 }}>Uploading...</span>}
        </div>
      ))}
    </div>
  );
};

export default ChannelGallery;