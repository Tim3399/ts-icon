import { Routes, Route } from 'react-router-dom';
import BannerCropper from './components/BannerCropper';
import ChannelGallery from './components/ChannelGallery';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BannerCropper />} />
      <Route path="/channels" element={<ChannelGallery />} />
    </Routes>
  );
}