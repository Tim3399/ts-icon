import React, { useEffect, useState } from 'react';
import { API_URL, VIEW_IMAGE_URL } from '../config';

type Channel = {
  name: string;
  imageUrl?: string;
};

const ChannelGallery: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    fetch(`${VIEW_IMAGE_URL}channels`)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data.channels)) throw new Error('Antwort enthält kein gültiges channels-Array');
        setChannels(data.channels);
      });
  }, []);

  const handleImageChange = (channelName: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file, 'banner.png');
    fetch(`${API_URL}${encodeURIComponent(channelName)}`, {
      method: 'POST',
      body: formData
    })
      .then(res => res.ok && alert('Bild aktualisiert!'));
  };

return (
  <div>
    <h2>Channel-Bilder verwalten</h2>
    {channels.map(channel => (
      <div key={channel.name} style={{ marginBottom: 24 }}>
        <div>
          {channel.imageUrl ? (
            <img
              src={channel.imageUrl}
              alt={channel.name}
              style={{ width: 200, height: 44, objectFit: 'contain', border: '1px solid #ccc', display: 'block' }}
            />
          ) : (
            <span>Kein Bild gesetzt</span>
          )}
        </div>
        <div style={{ margin: '4px 0', fontWeight: 'bold' }}>{channel.name}</div>
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