import { Link, Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';
import BannerUrlManager from './components/BannerUrlManager';
import ChannelWallpaperGenerator from './components/ChannelWallpaperGenerator';
import AccessDenied from './components/AccessDenied';
import RequireUpload from './components/RequireUpload';
import RequireAdmin from './components/RequireAdmin';
import { useAuth } from './auth/AuthProvider';
import { useCanUpload, useIsAdmin } from './auth/permissions';

export default function App() {
  const { username, logout } = useAuth();
  const canUpload = useCanUpload();
  const isAdmin = useIsAdmin();

  return (
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
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RequireUpload><BannerCropper /></RequireUpload>} />
          <Route path="/channels" element={<RequireUpload><ChannelGallery /></RequireUpload>} />
          <Route path="/banner-urls" element={<RequireAdmin><BannerUrlManager /></RequireAdmin>} />
          <Route path="/wallpaper" element={<RequireAdmin><ChannelWallpaperGenerator /></RequireAdmin>} />
          <Route path="/access-denied" element={<AccessDenied />} />
        </Routes>
      </main>
    </div>
  );
}
