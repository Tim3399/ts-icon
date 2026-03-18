import React, { useEffect, useState } from 'react';
import { API_URL, GET_CHANNELS_LIST_URL } from '../config';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

type Channel = {
  name: string;
};

const ChannelGallery: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [missingImages, setMissingImages] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const { getToken } = useAuth();

  useEffect(() => {
    getToken().then(token => {
      fetch(`${GET_CHANNELS_LIST_URL}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data.channels)) throw new Error('Antwort enthält kein gültiges channels-Array');
          setChannels(data.channels.map((c: string) => ({ name: c })));
        });
    });
  }, []);

  const handleImageChange = async (channelName: string, file: File) => {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', file, 'banner.png');
    fetch(`${API_URL}${encodeURIComponent(channelName)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    })
      .then(res => res.ok && alert('Bild aktualisiert!'));
  };

  const handleImageError = (channelName: string) => {
    setMissingImages(prev => ({ ...prev, [channelName]: true }));
  };

    const allChannels = [{ name: 'spacer' }, ...channels];

  return (
    <div>
      <button onClick={() => navigate('/')}>Zurück</button>
      <h2>Channel-Bilder verwalten</h2>
      {allChannels.map((channel, idx) => (
        <div key={channel.name || idx} style={{ marginBottom: 24 }}>
          <div>
            {!missingImages[channel.name] ? (
              <img
                src={`http://localhost:3000/images/${encodeURIComponent(channel.name)}`}
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
                Kein Bild vorhanden
              </div>
            )}
          </div>
          <div style={{ margin: '4px 0', fontWeight: 'bold', textAlign: 'center' }}>
            {channel.name}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              if (e.target.files?.[0]) handleImageChange(channel.name, e.target.files[0]);
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default ChannelGallery;