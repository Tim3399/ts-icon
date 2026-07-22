import { Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';
import AccessDenied from './components/AccessDenied';
import RequireUpload from './components/RequireUpload';
import { useAuth } from './auth/AuthProvider';

export default function App() {
  const { username, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <strong>TS-Icon</strong>
        </div>
        <div className="user-info">
          <span>Angemeldet als: <strong>{username}</strong></span>
          <button className="btn btn-ghost" onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RequireUpload><BannerCropper /></RequireUpload>} />
          <Route path="/channels" element={<RequireUpload><ChannelGallery /></RequireUpload>} />
          <Route path="/access-denied" element={<AccessDenied />} />
        </Routes>
      </main>
    </div>
  );
}
