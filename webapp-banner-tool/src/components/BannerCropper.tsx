import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'cropperjs';
import { API_URL, GET_IMAGE_URL } from '../config';
import { useAuth } from '../auth/AuthProvider';

const TARGET_WIDTH = 500;
const TARGET_HEIGHT = 44;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

const BannerCropper: React.FC = () => {
  const previewRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [channelName, setChannelName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [channelList, setChannelList] = useState<string[]>([]);
  const cropperRef = useRef<Cropper | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const toggleZoom = () => setIsZoomed(z => !z);
  const navigate = useNavigate();
  const { getToken } = useAuth();

  useEffect(() => {
    if (previewRef.current && previewRef.current.src) {
      setTimeout(() => {
        initCropper();
      }, 0);
    }
  }, [isZoomed]);

  useEffect(() => {
    getToken().then(token => {
      fetch(`${API_URL}channels`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data.channels)) throw new Error('Antwort enthält kein gültiges channels-Array');
          setChannelList(data.channels);
        })
        .catch(err => {
          console.warn('Konnte Channel-Liste nicht laden:', err);
        });
    });
  }, []);

  const initCropper = () => {
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }

    const image = previewRef.current!;
    const options = {
      aspectRatio: TARGET_RATIO,
      viewMode: 1,
      autoCropArea: 1,
      dragMode: 'move',
      cropBoxResizable: false,
      ready() {
        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;
        let cropBoxWidth = naturalWidth;
        let cropBoxHeight = cropBoxWidth / TARGET_RATIO;

        if (cropBoxHeight > naturalHeight) {
          cropBoxHeight = naturalHeight;
          cropBoxWidth = cropBoxHeight * TARGET_RATIO;
        }

        cropperRef.current?.setCropBoxData({
          width: cropBoxWidth,
          height: cropBoxHeight,
          left: (naturalWidth - cropBoxWidth) / 2,
          top: (naturalHeight - cropBoxHeight) / 2,
        });
      }
    };

    cropperRef.current = new Cropper(image, options as any);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (previewRef.current) {
        previewRef.current.src = reader.result as string;
        previewRef.current.onload = () => initCropper();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUrlLoad = async () => {
    if (!imageUrl.trim()) return alert('Bitte eine Bild-URL eingeben.');

    try {
      const token = await getToken();
      const response = await fetch(`${GET_IMAGE_URL}?url=${encodeURIComponent(imageUrl)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Bild konnte nicht geladen werden');

      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);

      if (previewRef.current) {
        previewRef.current.src = objectURL;
        previewRef.current.onload = () => initCropper();
      }
    } catch (err: any) {
      alert('Fehler beim Laden des Bildes: ' + err.message);
    }
  };

  const handleUpload = () => {
    if (!cropperRef.current) return alert('Bitte zuerst ein Bild auswählen.');
    if (!channelName.trim()) return alert('Bitte einen Channelnamen eingeben.');

    const cropData = cropperRef.current.getData(true);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropData.width;
    tempCanvas.height = cropData.height;

    const ctx = tempCanvas.getContext('2d');
    if (!ctx || !previewRef.current) return;

    ctx.drawImage(
      previewRef.current,
      cropData.x, cropData.y, cropData.width, cropData.height,
      0, 0, cropData.width, cropData.height
    );

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;

    const finalCtx = canvas.getContext('2d');
    if (!finalCtx) return;

    finalCtx.clearRect(0, 0, canvas.width, canvas.height);
    finalCtx.drawImage(tempCanvas, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    canvas.style.display = 'block';

    tempCanvas.toBlob(async (blob) => {
      if (!blob) return;

      const token = await getToken();
      const formData = new FormData();
      formData.append('file', blob, 'banner.png');

      fetch(`${API_URL}${encodeURIComponent(channelName)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      })
        .then(res => {
          if (!res.ok) throw new Error('Fehler beim Upload');
          return res.json();
        })
        .then(() => alert('Bild erfolgreich hochgeladen!'))
        .catch(err => alert('Fehler: ' + err.message));
    }, 'image/png');
  };

  return (
    <div style={{ maxHeight: '90vh', overflowY: 'auto', paddingRight: 10 }}>
      <label htmlFor="channel">Channelname:</label>
      <input
        type="text"
        id="channel"
        list="channel-list"
        placeholder="lobby"
        value={channelName}
        onChange={(e) => setChannelName(e.target.value)}
        required
      />
      <datalist id="channel-list">
        {channelList.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div id="channel-display">
        <strong>Gefundene Channels:</strong>
        <ul id="channel-list-display">
          {channelList.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
      />

      <label htmlFor="imageUrl">Bild-URL:</label>
      <input
        type="text"
        id="imageUrl"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="https://example.com/banner.png"
      />
      <button onClick={handleUrlLoad}>Bild von URL laden</button>

      <button onClick={() => navigate('/channels')}>Channel-Bilder verwalten</button>

      <button type="button" onClick={toggleZoom} style={{ marginBottom: 8 }}>
        {isZoomed ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}
      </button>

      <div
        style={{
          width: isZoomed ? 800 : 400,
          height: isZoomed ? 400 : 200,
          overflow: 'hidden',
          border: '1px solid #ccc',
          marginBottom: 16,
        }}
      >
        <img
          ref={previewRef}
          alt="Vorschau"
          id="preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>

      <canvas ref={canvasRef} id="canvas-preview" width={TARGET_WIDTH} height={TARGET_HEIGHT} style={{ display: 'none' }} />

      <button onClick={handleUpload}>Bild zuschneiden & senden</button>
    </div>
  );
};

export default BannerCropper;