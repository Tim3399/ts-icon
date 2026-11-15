import { useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import BannerCropper from "./components/BannerCropper";
import ChannelGallery from "./components/ChannelGallery";
import BannerUrlManager from "./components/BannerUrlManager";
import ChannelWallpaperGenerator from "./components/ChannelWallpaperGenerator";
import ChannelTreePreview from "./components/ChannelTreePreview";
import RequireUpload from "./components/RequireUpload";
import RequireAdmin from "./components/RequireAdmin";
import {
  AccessDenied,
  AppShell,
  Brand,
  Button,
  LinkButton,
  Notice,
  SidebarLink,
  SidePanel,
  ThemeToggle,
  UserChip,
} from "./design";
import { useAuth } from "./auth/AuthContext";
import { useCanUpload, useIsAdmin } from "./auth/permissions";
import { usePreviewOverlay } from "./preview/PreviewOverlayContext";
import { PreviewOverlayProvider } from "./preview/PreviewOverlayProvider";

// Keeps the persistent panel reasonably fresh even when nothing in this tab
// triggers an explicit bumpRefresh() (e.g. another admin changing channels
// elsewhere) -- fetchLiveChannels() on the backend already caches for 30s,
// so polling faster than that would just re-read the same cached result.
const LIVE_TREE_POLL_MS = 30_000;

const RAIL_STORAGE_KEY = "ts-icon-rail-open";
const LIVE_PANEL_ID = "live-tree-panel";

function readRailPreference(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

const LivePreviewPanel: React.FC<{ open: boolean }> = ({ open }) => {
  const { overlay, refreshKey } = usePreviewOverlay();
  const [pollTick, setPollTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setPollTick((t) => t + 1);
    }, LIVE_TREE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Always mounted while the user is an admin, so hiding the panel never
  // loses its poll or scroll state; `open` only hides it.
  return (
    <SidePanel id={LIVE_PANEL_ID} title="Live channel tree" icon="tree" open={open}>
      <ChannelTreePreview
        className="channel-tree-live"
        refreshKey={refreshKey + pollTick}
        overlay={overlay}
      />
    </SidePanel>
  );
};

function NotFound() {
  return (
    <Notice
      icon="search"
      title="Page not found"
      actions={
        <LinkButton to="/" variant="prominent" icon="crop">
          Create a banner
        </LinkButton>
      }
    >
      <p>This address does not match a page. The banner editor is the usual place to start.</p>
    </Notice>
  );
}

export default function App() {
  const { username, logout } = useAuth();
  const canUpload = useCanUpload();
  const isAdmin = useIsAdmin();
  const [railOpen, setRailOpen] = useState(readRailPreference);

  const toggleRail = useCallback(() => {
    setRailOpen((open) => {
      try {
        localStorage.setItem(RAIL_STORAGE_KEY, open ? "closed" : "open");
      } catch {
        /* The choice still applies for this session. */
      }
      return !open;
    });
  }, []);

  const railLabel = railOpen ? "Hide the live channel tree" : "Show the live channel tree";

  return (
    <PreviewOverlayProvider>
      <AppShell
        brand={<Brand name="TS-Icon" tagline="Channel banners" logoSrc="/icon.svg" />}
        navLabel="Primary"
        nav={
          <>
            {canUpload && (
              <SidebarLink to="/" end icon="crop">
                Banner editor
              </SidebarLink>
            )}
            {canUpload && (
              <SidebarLink to="/channels" icon="image">
                Manage channel images
              </SidebarLink>
            )}
            {isAdmin && (
              <SidebarLink to="/banner-urls" icon="link">
                Banner URLs
              </SidebarLink>
            )}
            {isAdmin && (
              <SidebarLink to="/wallpaper" icon="sparkles">
                Channel Wallpaper
              </SidebarLink>
            )}
          </>
        }
        toolbar={
          <>
            {isAdmin && (
              <Button
                variant="plain"
                icon="panel"
                iconOnly
                onClick={toggleRail}
                aria-expanded={railOpen}
                aria-controls={LIVE_PANEL_ID}
                title={railLabel}
                aria-label={railLabel}
              />
            )}
            <ThemeToggle />
            <UserChip name={username} />
            <Button variant="plain" icon="logout" iconOnly onClick={logout} aria-label="Logout" />
          </>
        }
        // Gated to admin, matching the nav links above: the backend endpoint
        // this panel reads (GET channels/banner-urls) is admin-only, so an
        // editor-only account would otherwise see a constant stream of 403
        // toasts from a panel it can't use.
        panel={isAdmin ? <LivePreviewPanel open={railOpen} /> : undefined}
      >
        <Routes>
          <Route
            path="/"
            element={
              <RequireUpload>
                <BannerCropper />
              </RequireUpload>
            }
          />
          <Route
            path="/channels"
            element={
              <RequireUpload>
                <ChannelGallery />
              </RequireUpload>
            }
          />
          <Route
            path="/banner-urls"
            element={
              <RequireAdmin>
                <BannerUrlManager />
              </RequireAdmin>
            }
          />
          <Route
            path="/wallpaper"
            element={
              <RequireAdmin>
                <ChannelWallpaperGenerator />
              </RequireAdmin>
            }
          />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </PreviewOverlayProvider>
  );
}
