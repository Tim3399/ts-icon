import { useEffect, useState } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';
import BannerUrlManager from './components/BannerUrlManager';
import ChannelWallpaperGenerator from './components/ChannelWallpaperGenerator';
import ChannelTreePreview from './components/ChannelTreePreview';
import AccessDenied from './components/AccessDenied';
import RequireUpload from './components/RequireUpload';
import RequireAdmin from './components/RequireAdmin';
import { useAuth } from './auth/AuthProvider';
import { useCanUpload, useIsAdmin } from './auth/permissions';
import { PreviewOverlayProvider, usePreviewOverlay } from './preview/PreviewOverlayContext';

// Keeps the persistent panel reasonably fresh even when nothing in this tab
// triggers an explicit bumpRefresh() (e.g. another admin changing channels
// elsewhere) -- fetchLiveChannels() on the backend already caches for 30s,
// so polling faster than that would just re-read the same cached result.
const LIVE_TREE_POLL_MS = 20_000;

const LivePreviewPanel: React.FC = () => {
  const { overlay, refreshKey } = usePreviewOverlay();
  const [pollTick, setPollTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPollTick((t) => t + 1), LIVE_TREE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="app-preview-panel">
      <h2 className="app-preview-panel-title">Live channel tree</h2>
      <ChannelTreePreview
        refreshKey={refreshKey + pollTick}
        overlay={overlay}
        className="channel-tree-panel"
      />
    </aside>
  );
};

export default function App() {
  const { username, logout } = useAuth();
  const canUpload = useCanUpload();
  const isAdmin = useIsAdmin();

  return (
    <PreviewOverlayProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <img src="/icon.svg" alt="" width={24} height={24} />
            <strong>TS-Icon</strong>
          </div>
          <div className="user-info">
            {canUpload && (
              <Link to="/channels" className="btn btn-ghost">Manage channel images</Link>
            )}
            {isAdmin && (
              <Link to="/banner-urls" className="btn btn-ghost">Banner URLs</Link>
            )}
            {isAdmin && (
              <Link to="/wallpaper" className="btn btn-ghost">Channel Wallpaper</Link>
            )}
            <span>Angemeldet als: <strong>{username}</strong></span>
            <button className="btn btn-ghost" onClick={logout}>Logout</button>
          </div>
        </header>
        <div className="app-body">
          <main className="app-main">
            <Routes>
              <Route path="/" element={<RequireUpload><BannerCropper /></RequireUpload>} />
              <Route path="/channels" element={<RequireUpload><ChannelGallery /></RequireUpload>} />
              <Route path="/banner-urls" element={<RequireAdmin><BannerUrlManager /></RequireAdmin>} />
              <Route path="/wallpaper" element={<RequireAdmin><ChannelWallpaperGenerator /></RequireAdmin>} />
              <Route path="/access-denied" element={<AccessDenied />} />
            </Routes>
          </main>
          {/* Gated to admin, matching the nav links above: the backend
              endpoint this panel reads (GET channels/banner-urls) is
              admin-only, so an editor-only account would otherwise see a
              constant stream of 403 toasts from a panel it can't use. */}
          {isAdmin && <LivePreviewPanel />}
        </div>
      </div>
    </PreviewOverlayProvider>
  );
}
