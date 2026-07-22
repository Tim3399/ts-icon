import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BannerCropper from './BannerCropper';

const { apiFetchJsonMock, showToastMock, getTokenMock } = vi.hoisted(() => ({
  apiFetchJsonMock: vi.fn(),
  showToastMock: vi.fn(),
  // Must stay a single stable reference across renders -- see the identical
  // note in ChannelGallery.test.tsx for why a fresh vi.fn() per call breaks
  // the channel-list useEffect's dependency array.
  getTokenMock: vi.fn(),
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

vi.mock('./Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    apiFetchJson: apiFetchJsonMock,
  };
});

// cropperjs measures/manipulates real DOM image geometry that jsdom doesn't
// provide, and none of these tests exercise actual cropping -- only the
// dropzone drag-and-drop affordance -- so the whole module is replaced with
// a minimal stand-in that satisfies BannerCropper's usage of it (`new
// Cropper(...)`, `.destroy()`, `.setCropBoxData()`, `.getData()`).
vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy() {}
    setCropBoxData() {}
    getData() {
      return { x: 0, y: 0, width: 10, height: 10 };
    }
  },
}));

function renderCropper() {
  return render(
    <MemoryRouter>
      <BannerCropper />
    </MemoryRouter>
  );
}

describe('BannerCropper image dropzone', () => {
  beforeEach(() => {
    apiFetchJsonMock.mockResolvedValue({ channels: ['lobby'] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function getDropzone() {
    return screen.getByText(/Drag & drop an image here, or click to browse/i).closest('label') as HTMLElement;
  }

  it('loads a dropped file into the preview image', async () => {
    renderCropper();
    const dropzone = getDropzone();

    const file = new File(['banner-bytes'], 'banner.png', { type: 'image/png' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    const preview = document.getElementById('preview') as HTMLImageElement;
    await waitFor(() => expect(preview.src).toMatch(/^data:/));
  });

  it('adds the drag-over highlight while dragging over the dropzone, and clears it after drop', async () => {
    renderCropper();
    const dropzone = getDropzone();

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone).toHaveClass('dropzone-drag-over');

    const file = new File(['banner-bytes'], 'banner.png', { type: 'image/png' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(dropzone).not.toHaveClass('dropzone-drag-over'));
  });

  it('does not clear the drag-over highlight when the pointer moves onto a child element', () => {
    renderCropper();
    const dropzone = getDropzone();
    const child = dropzone.querySelector('input[type="file"]') as HTMLElement;

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone).toHaveClass('dropzone-drag-over');

    // relatedTarget is a read-only accessor in jsdom -- a plain
    // fireEvent.dragLeave(el, { relatedTarget }) silently no-ops the
    // assignment, so it must be forced via defineProperty on a manually
    // constructed event instead (same gotcha documented in
    // ChannelGallery.test.tsx).
    const dragLeaveEvent = new window.MouseEvent('dragleave', { bubbles: true });
    Object.defineProperty(dragLeaveEvent, 'relatedTarget', { value: child });

    fireEvent(dropzone, dragLeaveEvent);
    expect(dropzone).toHaveClass('dropzone-drag-over');
  });

  it('ignores a drop with no files', () => {
    renderCropper();
    const dropzone = getDropzone();

    const preview = document.getElementById('preview') as HTMLImageElement;
    const srcBefore = preview.src;

    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });

    expect(preview.src).toBe(srcBefore);
  });
});
