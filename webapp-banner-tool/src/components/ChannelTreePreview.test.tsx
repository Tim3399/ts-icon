import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChannelTreePreview from './ChannelTreePreview';

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

const CHANNELS = [
  { cid: '1', name: 'General', bannerGfxUrl: 'https://x.test/general.png', managed: true, pid: null, depth: 0 },
  { cid: '2', name: 'Music', bannerGfxUrl: null, managed: false, pid: '1', depth: 1 },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChannelTreePreview', () => {
  it('renders every channel indented by its depth', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    render(<ChannelTreePreview />);

    expect(await screen.findByText('General')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
    const musicRow = screen.getByText('Music').closest('.channel-tree-row') as HTMLElement;
    expect(musicRow.style.paddingLeft).toBe('32px');
  });

  it('shows a managed badge only for managed channels', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    render(<ChannelTreePreview />);

    await screen.findByText('General');
    const generalRow = screen.getByText('General').closest('.channel-tree-row') as HTMLElement;
    const musicRow = screen.getByText('Music').closest('.channel-tree-row') as HTMLElement;
    expect(generalRow.querySelector('.badge-managed')).not.toBeNull();
    expect(musicRow.querySelector('.badge-managed')).toBeNull();
  });

  it('is not clickable when selectable is false (the default)', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    const onSelectParent = vi.fn();
    render(<ChannelTreePreview onSelectParent={onSelectParent} />);

    const row = await screen.findByText('General');
    fireEvent.click(row);
    expect(onSelectParent).not.toHaveBeenCalled();
  });

  it('calls onSelectParent with the clicked channel cid when selectable', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    const onSelectParent = vi.fn();
    render(<ChannelTreePreview selectable onSelectParent={onSelectParent} />);

    fireEvent.click(await screen.findByText('Music'));
    expect(onSelectParent).toHaveBeenCalledWith('2');
  });

  it('renders a top-level pseudo-row that calls onSelectParent(null) when selectable', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    const onSelectParent = vi.fn();
    render(<ChannelTreePreview selectable onSelectParent={onSelectParent} />);

    fireEvent.click(await screen.findByText('Top-level (no parent)'));
    expect(onSelectParent).toHaveBeenCalledWith(null);
  });

  it('re-fetches when refreshKey changes', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    const { rerender } = render(<ChannelTreePreview refreshKey={0} />);
    await waitFor(() => expect(apiFetchJsonMock).toHaveBeenCalledTimes(1));

    rerender(<ChannelTreePreview refreshKey={1} />);
    await waitFor(() => expect(apiFetchJsonMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error toast when the fetch fails', async () => {
    apiFetchJsonMock.mockRejectedValue(new Error('boom'));
    render(<ChannelTreePreview />);

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
  });

  it('splices overlay rows right after the chosen parent, marked pending', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    render(
      <ChannelTreePreview
        overlay={{
          parentCid: '1',
          rows: [{ depth: 0, isSpacer: false, imageDataUrl: 'data:image/png;base64,abc' }],
        }}
      />,
    );

    await screen.findByText('General');
    const rows = screen.getAllByRole('listitem');
    // Order: General (real), pending (spliced right after its parent), Music (real).
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('General'),
      expect.stringContaining('New channel (pending)'),
      expect.stringContaining('Music'),
    ]);
    expect(rows[1].className).toContain('channel-tree-row-pending');
    expect(rows[1].querySelector('.badge-pending')).not.toBeNull();
  });

  it('inserts overlay rows at the very start for a null (top-level) parent', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    render(
      <ChannelTreePreview
        overlay={{
          parentCid: null,
          rows: [{ depth: 0, isSpacer: true, imageDataUrl: 'data:image/png;base64,abc' }],
        }}
      />,
    );

    await screen.findByText('General');
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Spacer (pending)');
  });

  it('does not treat a pending row as clickable even when selectable', async () => {
    apiFetchJsonMock.mockResolvedValue({ channels: CHANNELS });
    const onSelectParent = vi.fn();
    render(
      <ChannelTreePreview
        selectable
        onSelectParent={onSelectParent}
        overlay={{
          parentCid: '1',
          rows: [{ depth: 0, isSpacer: false, imageDataUrl: 'data:image/png;base64,abc' }],
        }}
      />,
    );

    fireEvent.click(await screen.findByText('New channel (pending)'));
    expect(onSelectParent).not.toHaveBeenCalled();
  });
});
