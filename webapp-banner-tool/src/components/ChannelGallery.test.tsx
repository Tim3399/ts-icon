import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChannelGallery from './ChannelGallery';

const { apiFetchMock, apiFetchJsonMock, apiFetchBlobMock, showToastMock, getTokenMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiFetchJsonMock: vi.fn(),
  // ChannelGallery renders SpacerBaseImageManager, which fetches the spacer
  // base image via apiFetchBlob on mount -- mocked here (rejecting, like a
  // real "not set yet" 404 would) so these tests don't attempt a real
  // network fetch just from rendering the gallery.
  apiFetchBlobMock: vi.fn().mockRejectedValue(new Error('not set in this test')),
  showToastMock: vi.fn(),
  // Must be a single stable reference across renders, matching the real
  // AuthProvider's useCallback(..., [])-wrapped getToken -- a fresh
  // vi.fn() returned per call (as a naive `() => ({ getToken: vi.fn() })`
  // mock would) changes identity every render, and ChannelGallery's
  // channel-list useEffect depends on it, causing an infinite render loop
  // in the test that a real, stable getToken never triggers.
  getTokenMock: vi.fn(),
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

vi.mock('./Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../preview/PreviewOverlayContext', () => ({
  usePreviewOverlay: () => ({ overlay: null, setOverlay: vi.fn(), refreshKey: 0, bumpRefresh: vi.fn() }),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    apiFetch: apiFetchMock,
    apiFetchJson: apiFetchJsonMock,
    apiFetchBlob: apiFetchBlobMock,
  };
});

function renderGallery() {
  return render(
    <MemoryRouter>
      <ChannelGallery />
    </MemoryRouter>
  );
}

// Only the drag-and-drop path is covered here -- everything else about this
// component (the file-input upload path, missing-image handling, the
// channel list fetch itself) has no dedicated test today either, matching
// this codebase's existing precedent of testing auth/permission logic and
// timer-driven behavior directly, but not every interactive component. Drag
// events specifically are worth locking in: fixed a real flicker bug in the
// dragleave handling (triggered by moving over a card's own children)
// during review, which only reasoning about the DOM event model caught, not
// a browser check.
describe('ChannelGallery drag-and-drop', () => {
  beforeEach(() => {
    apiFetchJsonMock.mockResolvedValue({ channels: ['general'] });
    apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a dropped file for the channel it was dropped on', async () => {
    renderGallery();
    const card = (await screen.findByText('general')).closest('.channel-card');
    expect(card).not.toBeNull();

    const file = new File(['banner-bytes'], 'banner.png', { type: 'image/png' });
    fireEvent.drop(card!, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('general');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    const submittedFile = (options.body as FormData).get('file') as File;
    expect(submittedFile.name).toBe(file.name);
    expect(submittedFile.type).toBe(file.type);
    expect(submittedFile.size).toBe(file.size);
  });

  it('adds the drag-over highlight class while dragging over a card, and clears it after drop', async () => {
    renderGallery();
    const card = (await screen.findByText('general')).closest('.channel-card');
    expect(card).not.toBeNull();

    fireEvent.dragOver(card!, { dataTransfer: { files: [] } });
    expect(card).toHaveClass('channel-card-drag-over');

    const file = new File(['banner-bytes'], 'banner.png', { type: 'image/png' });
    fireEvent.drop(card!, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(card).not.toHaveClass('channel-card-drag-over'));
  });

  it('does not clear the drag-over highlight when the pointer moves onto a child element', async () => {
    renderGallery();
    const card = (await screen.findByText('general')).closest('.channel-card') as HTMLElement;
    const child = card.querySelector('.channel-card-image') as HTMLElement;

    fireEvent.dragOver(card, { dataTransfer: { files: [] } });
    expect(card).toHaveClass('channel-card-drag-over');

    // relatedTarget is a read-only accessor in jsdom -- plain
    // fireEvent.dragLeave(el, { relatedTarget }) silently no-ops the
    // assignment, so it has to be forced via defineProperty on a manually
    // constructed event instead.
    const dragLeaveEvent = new window.MouseEvent('dragleave', { bubbles: true });
    Object.defineProperty(dragLeaveEvent, 'relatedTarget', { value: child });

    // Leaving the card *into* one of its own children should not clear the
    // highlight -- only leaving the card entirely should.
    fireEvent(card, dragLeaveEvent);
    expect(card).toHaveClass('channel-card-drag-over');
  });

  it('ignores a drop with no files', async () => {
    renderGallery();
    const card = (await screen.findByText('general')).closest('.channel-card');

    fireEvent.drop(card!, { dataTransfer: { files: [] } });

    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('ChannelGallery delete image', () => {
  beforeEach(() => {
    apiFetchJsonMock.mockResolvedValue({ channels: ['general'] });
    apiFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('deletes the image after the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGallery();
    const button = await screen.findByRole('button', { name: 'Delete image' });

    fireEvent.click(button);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('general');
    expect(options.method).toBe('DELETE');
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGallery();
    const button = await screen.findByRole('button', { name: 'Delete image' });

    fireEvent.click(button);

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when deletion fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiFetchMock.mockRejectedValue(new Error('boom'));
    renderGallery();
    const button = await screen.findByRole('button', { name: 'Delete image' });

    fireEvent.click(button);

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
  });
});
