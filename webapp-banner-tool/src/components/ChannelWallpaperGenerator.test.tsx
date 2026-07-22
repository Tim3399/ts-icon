import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChannelWallpaperGenerator from './ChannelWallpaperGenerator';

const { apiFetchJsonMock, showToastMock, getTokenMock } = vi.hoisted(() => ({
  apiFetchJsonMock: vi.fn(),
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
  return { ...actual, apiFetchJson: apiFetchJsonMock };
});

// ChannelTreePreview makes its own real apiFetchJson call (mocked above) --
// stubbed out entirely here since this file's tests are about the
// generator's own form/preview/submit/undo behavior, not the tree view
// (already covered by ChannelTreePreview.test.tsx).
vi.mock('./ChannelTreePreview', () => ({
  default: () => <div>channel-tree-preview</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ChannelWallpaperGenerator />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ChannelWallpaperGenerator preview', () => {
  it('does not call the preview endpoint until a source image is provided', async () => {
    renderPage();
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiFetchJsonMock).not.toHaveBeenCalled();
  });

  it('debounces the preview call after a file is selected', async () => {
    apiFetchJsonMock.mockResolvedValue({ rows: [] });
    renderPage();

    const file = new File(['bytes'], 'wallpaper.png', { type: 'image/png' });
    const input = document.getElementById('wallpaper-file-upload') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Not yet -- still within the debounce window.
    await vi.advanceTimersByTimeAsync(200);
    expect(apiFetchJsonMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(apiFetchJsonMock).toHaveBeenCalledTimes(1);
    const [url, options] = apiFetchJsonMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/channel-wallpaper/preview');
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('file')).toBe(file);
  });

  it('renders returned preview rows, indented by depth', async () => {
    apiFetchJsonMock.mockResolvedValue({
      rows: [
        { depth: 0, isSpacer: false, imageDataUrl: 'data:image/png;base64,AAA' },
        { depth: 1, isSpacer: true, imageDataUrl: 'data:image/png;base64,BBB' },
      ],
    });
    renderPage();

    const file = new File(['bytes'], 'wallpaper.png', { type: 'image/png' });
    const input = document.getElementById('wallpaper-file-upload') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await vi.advanceTimersByTimeAsync(600);

    const images = await screen.findAllByRole('img');
    const previewImages = images.filter((img) => img.classList.contains('wallpaper-preview-row'));
    expect(previewImages).toHaveLength(2);
  });
});

describe('ChannelWallpaperGenerator generate', () => {
  it('submits the form and shows a success summary', async () => {
    apiFetchJsonMock.mockImplementation((url: string) => {
      if (url.includes('/preview')) return Promise.resolve({ rows: [] });
      return Promise.resolve({
        createdChannels: [{ cid: '10', name: 'Wall 1', kind: 'art', depth: 0 }],
        rowCount: 1,
      });
    });
    renderPage();

    const file = new File(['bytes'], 'wallpaper.png', { type: 'image/png' });
    const input = document.getElementById('wallpaper-file-upload') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await vi.advanceTimersByTimeAsync(600);

    const submitButton = screen.getByRole('button', { name: 'Generate channels' });
    fireEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText('Created 1 channel(s).')).toBeInTheDocument());
    expect(screen.getByText(/Wall 1/)).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith('Created 1 channel(s).', 'success');
  });

  it('disables the generate button until a source image is provided', () => {
    renderPage();
    const submitButton = screen.getByRole('button', { name: 'Generate channels' });
    expect(submitButton).toBeDisabled();
  });
});

describe('ChannelWallpaperGenerator undo', () => {
  async function generateOneChannel() {
    apiFetchJsonMock.mockImplementation((url: string) => {
      if (url.includes('/preview')) return Promise.resolve({ rows: [] });
      if (url.includes('/undo')) return Promise.resolve({ deleted: ['10'], failed: [] });
      return Promise.resolve({
        createdChannels: [{ cid: '10', name: 'Wall 1', kind: 'art', depth: 0 }],
        rowCount: 1,
      });
    });
    renderPage();

    const file = new File(['bytes'], 'wallpaper.png', { type: 'image/png' });
    const input = document.getElementById('wallpaper-file-upload') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(screen.getByRole('button', { name: 'Generate channels' }));
    await waitFor(() => expect(screen.getByText('Created 1 channel(s).')).toBeInTheDocument());
  }

  it('deletes the created channels after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await generateOneChannel();

    fireEvent.click(screen.getByRole('button', { name: 'Undo this generation' }));

    await waitFor(() =>
      expect(apiFetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining('/channel-wallpaper/undo'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const undoCall = apiFetchJsonMock.mock.calls.find(([url]) =>
      (url as string).includes('/undo'),
    ) as [string, RequestInit];
    expect(JSON.parse(undoCall[1].body as string)).toEqual({ cids: ['10'] });
  });

  it('does not undo when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await generateOneChannel();
    apiFetchJsonMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Undo this generation' }));

    expect(apiFetchJsonMock).not.toHaveBeenCalled();
  });
});
