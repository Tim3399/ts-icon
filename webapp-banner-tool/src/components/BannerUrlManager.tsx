import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, CHANNEL_BANNER_URLS_URL, APPLY_BANNER_URLS_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';
import { useCanUpload } from '../auth/permissions';
import { apiFetch, apiFetchJson, describeApiError } from '../api/client';
import { useToast } from './Toast';
import SpacerBaseImageManager from './SpacerBaseImageManager';
import { usePreviewOverlay } from '../preview/PreviewOverlayContext';

interface ChannelBannerStatus {
  name: string;
  bannerGfxUrl: string | null;
  managed: boolean;
}

const BannerUrlManager: React.FC = () => {
  const [channels, setChannels] = useState<ChannelBannerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingChannel, setSettingChannel] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const canUpload = useCanUpload();
  const { bumpRefresh } = usePreviewOverlay();

  const loadChannels = useCallback(() => {
    setLoading(true);
    return apiFetchJson<{ channels: ChannelBannerStatus[] }>(
      CHANNEL_BANNER_URLS_URL,
      { getToken },
    )
      .then((data) => {
        if (!Array.isArray(data.channels)) {
          throw new Error('Response does not contain a valid channels array');
        }
        setChannels(data.channels);
      })
      .catch((err) => {
        showToast(describeApiError(err, 'Channel banner status could not be loaded'), 'error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [getToken, showToast]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleSetBannerUrl = async (channelName: string) => {
    if (!canUpload) {
      showToast("You don't have permission to do this.", 'error');
      return;
    }
    setSettingChannel(channelName);
    try {
      await apiFetch(`${API_URL}${encodeURIComponent(channelName)}/banner-url`, {
        method: 'PATCH',
        getToken,
      });
      showToast(`Banner URL set for ${channelName}.`, 'success');
      await loadChannels();
      bumpRefresh();
    } catch (err) {
      showToast(describeApiError(err, 'Banner URL could not be set'), 'error');
    } finally {
      setSettingChannel(null);
    }
  };

  const handleApplyAll = async () => {
    if (!canUpload) {
      showToast("You don't have permission to do this.", 'error');
      return;
    }
    const unmanagedCount = channels.filter((c) => !c.managed).length;
    const confirmed = window.confirm(
      unmanagedCount > 0
        ? `This will set the banner URL on ${unmanagedCount} channel(s) that aren't already managed by this server. Continue?`
        : 'Every channel already appears to be managed by this server. Re-apply anyway?',
    );
    if (!confirmed) return;

    setApplyingAll(true);
    try {
      const result = await apiFetchJson<{ updated: string[]; alreadyManaged: string[] }>(
        APPLY_BANNER_URLS_URL,
        { method: 'POST', getToken },
      );
      showToast(
        `Updated ${result.updated.length} channel(s), ${result.alreadyManaged.length} already correct.`,
        'success',
      );
      await loadChannels();
      bumpRefresh();
    } catch (err) {
      showToast(describeApiError(err, 'Banner URLs could not be applied'), 'error');
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <div>
      <div className="gallery-header">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
        <h2>Channel banner URLs</h2>
      </div>

      <div className="card">
        <h2 className="card-title">Bulk action</h2>
        <p style={{ marginTop: 0 }}>
          Sets every channel's TeamSpeak banner URL to point at this server's managed image, skipping any channel already correctly set.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleApplyAll}
          disabled={applyingAll || loading || !canUpload}
        >
          {applyingAll ? 'Applying…' : 'Set for all channels'}
        </button>
      </div>

      <SpacerBaseImageManager />

      {loading && <p className="loading-state">Loading channels…</p>}
      {!loading && channels.length === 0 && (
        <p className="empty-state">No channels found.</p>
      )}

      {!loading && channels.length > 0 && (
        <div className="channel-grid">
          {channels.map((channel) => (
            <div className="channel-card" key={channel.name}>
              <div className="channel-card-name">{channel.name}</div>
              <div style={{ textAlign: 'center' }}>
                {channel.managed ? (
                  <span className="badge badge-managed">Managed</span>
                ) : (
                  <span className="badge badge-unmanaged">Not managed</span>
                )}
              </div>
              <div
                className="channel-card-status"
                style={{ wordBreak: 'break-all' }}
                title="The channel's current TeamSpeak banner URL"
              >
                {channel.bannerGfxUrl ?? 'No banner URL set'}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={settingChannel === channel.name || !canUpload}
                onClick={() => handleSetBannerUrl(channel.name)}
              >
                {settingChannel === channel.name ? 'Setting…' : 'Set banner URL'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BannerUrlManager;
