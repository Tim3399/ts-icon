import { Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';
import { useAuth } from './auth/AuthProvider';

export default function App() {
  const { username, logout } = useAuth();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icon.svg" alt="" width={24} height={24} />
          <strong>TS-Icon</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: 12 }}>Angemeldet als: <strong>{username}</strong></span>
          <button onClick={logout} style={{ padding: '4px 12px' }}>Logout</button>
        </div>
      </div>
      <Routes>
        <Route path="/" element={<BannerCropper />} />
        <Route path="/channels" element={<ChannelGallery />} />
      </Routes>
    </div>
  );
}