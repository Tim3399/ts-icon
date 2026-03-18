import { Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';
import { useAuth } from './auth/AuthProvider';

export default function App() {
  const { username, logout } = useAuth();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '8px 16px', background: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
        <span style={{ marginRight: 12 }}>Angemeldet als: <strong>{username}</strong></span>
        <button onClick={logout} style={{ padding: '4px 12px' }}>Logout</button>
      </div>
      <Routes>
        <Route path="/" element={<BannerCropper />} />
        <Route path="/channels" element={<ChannelGallery />} />
      </Routes>
    </div>
  );
}