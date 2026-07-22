import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SpacerBaseImageManager from './SpacerBaseImageManager';
import { ApiError } from '../api/client';

const { apiFetchMock, apiFetchBlobMock, showToastMock, getTokenMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiFetchBlobMock: vi.fn(),
  showToastMock: vi.fn(),
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
    apiFetch: apiFetchMock,
    apiFetchBlob: apiFetchBlobMock,
  };
});

// jsdom does not implement createObjectURL/revokeObjectURL -- SpacerBaseImageManager
// uses both to turn the fetched blob into a displayable <img src>.
beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-object-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SpacerBaseImageManager', () => {
  it('shows a placeholder when no base image has been set yet (404)', async () => {
    apiFetchBlobMock.mockRejectedValue(new ApiError('not found', 'unknown', 404));

    render(<SpacerBaseImageManager />);

    expect(await screen.findByText('No spacer base image set')).toBeInTheDocument();
  });

  it('shows the fetched image once loaded', async () => {
    apiFetchBlobMock.mockResolvedValue(new Blob(['fake-bytes'], { type: 'image/png' }));

    render(<SpacerBaseImageManager />);

    const img = await screen.findByAltText('Spacer base');
    expect(img).toHaveAttribute('src', 'blob:mock-object-url');
  });

  it('shows an error toast for a non-404 failure', async () => {
    apiFetchBlobMock.mockRejectedValue(new Error('network down'));

    render(<SpacerBaseImageManager />);

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
  });

  it('uploads a dropped file and refreshes the preview', async () => {
    apiFetchBlobMock.mockRejectedValueOnce(new ApiError('not found', 'unknown', 404));
    apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    apiFetchBlobMock.mockResolvedValueOnce(new Blob(['new-bytes'], { type: 'image/png' }));

    render(<SpacerBaseImageManager />);
    const dropzone = (await screen.findByText(/Drag & drop an image here/i)).closest('label') as HTMLElement;

    const file = new File(['bytes'], 'base.png', { type: 'image/png' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(url).toBeTruthy();
    expect(showToastMock).toHaveBeenCalledWith('Spacer base image updated!', 'success');
  });

  it('adds the drag-over highlight while dragging, and clears it after drop', async () => {
    apiFetchBlobMock.mockRejectedValue(new ApiError('not found', 'unknown', 404));
    apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    render(<SpacerBaseImageManager />);
    const dropzone = (await screen.findByText(/Drag & drop an image here/i)).closest('label') as HTMLElement;

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone).toHaveClass('dropzone-drag-over');

    const file = new File(['bytes'], 'base.png', { type: 'image/png' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(dropzone).not.toHaveClass('dropzone-drag-over'));
  });
});
