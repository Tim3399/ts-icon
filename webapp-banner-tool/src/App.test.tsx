import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// App.tsx's own children (BannerCropper/ChannelGallery/BannerUrlManager)
// make real network calls on mount and aren't the point of this test --
// only the routing decision (does the route guard let them render, or
// redirect to /access-denied) is. Each is replaced with a trivial marker so
// the assertions below are about which one App chose to render, not their
// internal behavior (already covered by their own specs).
vi.mock('./components/BannerCropper', () => ({
  default: () => <div>banner-cropper-page</div>,
}));
vi.mock('./components/ChannelGallery', () => ({
  default: () => <div>channel-gallery-page</div>,
}));
vi.mock('./components/BannerUrlManager', () => ({
  default: () => <div>banner-url-manager-page</div>,
}));

const { useAuthMock, useCanUploadMock, useIsAdminMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useCanUploadMock: vi.fn(),
  useIsAdminMock: vi.fn(),
}));

vi.mock('./auth/AuthProvider', () => ({ useAuth: useAuthMock }));
vi.mock('./auth/permissions', () => ({
  useCanUpload: useCanUploadMock,
  useIsAdmin: useIsAdminMock,
}));

import App from './App';

describe('App routing', () => {
  it('renders the banner cropper at / when the user has access', () => {
    useAuthMock.mockReturnValue({ username: 'alice', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('banner-cropper-page')).toBeInTheDocument();
  });

  it('renders the channel gallery at /channels when the user has access', () => {
    useAuthMock.mockReturnValue({ username: 'alice', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/channels']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('channel-gallery-page')).toBeInTheDocument();
  });

  it('redirects / to /access-denied without rendering the banner cropper when access is missing', () => {
    useAuthMock.mockReturnValue({ username: 'bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(false);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByText('banner-cropper-page')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('redirects /channels to /access-denied without rendering the gallery when access is missing', () => {
    useAuthMock.mockReturnValue({ username: 'bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(false);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/channels']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByText('channel-gallery-page')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('always renders /access-denied directly, regardless of permission state', () => {
    useAuthMock.mockReturnValue({ username: 'alice', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/access-denied']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('renders the banner URL manager at /banner-urls for an admin', () => {
    useAuthMock.mockReturnValue({ username: 'admin-alice', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/banner-urls']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('banner-url-manager-page')).toBeInTheDocument();
  });

  it('redirects /banner-urls to /access-denied for a non-admin, even one who can upload', () => {
    useAuthMock.mockReturnValue({ username: 'editor-bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/banner-urls']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByText('banner-url-manager-page')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('only shows the Banner URLs nav link to admins', () => {
    useAuthMock.mockReturnValue({ username: 'editor-bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByText('Banner URLs')).not.toBeInTheDocument();
  });

  it('shows the Banner URLs nav link to admins', () => {
    useAuthMock.mockReturnValue({ username: 'admin-alice', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Banner URLs')).toBeInTheDocument();
  });

  it('shows the Manage channel images nav link to anyone who can upload', () => {
    useAuthMock.mockReturnValue({ username: 'editor-bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(true);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Manage channel images')).toBeInTheDocument();
  });

  it('hides the Manage channel images nav link from someone who cannot upload', () => {
    useAuthMock.mockReturnValue({ username: 'bob', logout: vi.fn() });
    useCanUploadMock.mockReturnValue(false);
    useIsAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/access-denied']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByText('Manage channel images')).not.toBeInTheDocument();
  });
});
