import { useEffect, useState, type ReactNode } from "react";
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
  LinkButton,
  MenuButton,
  ModeLink,
  ModeSwitcher,
  Notice,
  Panel,
  StudioLayers,
  StudioPage,
  StudioShell,
  type MenuItem,
} from "./design";
import { THEME_LABELS, THEME_ORDER, useTheme } from "./theme/theme";
import { useAuth } from "./auth/AuthContext";
import { useCanUpload, useIsAdmin } from "./auth/permissions";
import { usePreviewOverlay } from "./preview/PreviewOverlayContext";
import { PreviewOverlayProvider } from "./preview/PreviewOverlayProvider";

// Keeps the live tree reasonably fresh even when nothing in this tab
// triggers an explicit bumpRefresh() (e.g. another admin changing channels
// elsewhere) -- fetchLiveChannels() on the backend already caches for 30s,
// so polling faster than that would just re-read the same cached result.
const LIVE_TREE_POLL_MS = 30_000;

// The live tree in the editor's layer panel. D-142G-3 rebuilds it as the D2
// layer list on GET channels (R4); until then it keeps the current
// ChannelTreePreview, which reads the admin-only banner-URL endpoint.
function LiveTreeLayers() {
  const { overlay, refreshKey } = usePreviewOverlay();
  const [pollTick, setPollTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setPollTick((t) => t + 1);
    }, LIVE_TREE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <StudioLayers>
      <Panel id="live-tree-panel" title="Live channel tree" footer="Live from the TeamSpeak server">
        <ChannelTreePreview
          className="channel-tree-live"
          refreshKey={refreshKey + pollTick}
          overlay={overlay}
        />
      </Panel>
    </StudioLayers>
  );
}

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
      <p>This page doesn't exist. The banner editor is a good place to start.</p>
    </Notice>
  );
}

/** A screen that has not been rebuilt in the Studio idiom yet: padded in the main region. */
function Page({ children }: { children: ReactNode }) {
  return <StudioPage>{children}</StudioPage>;
}

export default function App() {
  const { username, logout } = useAuth();
  const canUpload = useCanUpload();
  const isAdmin = useIsAdmin();
  const { preference, setPreference } = useTheme();

  // The one account menu of the top bar: the signed-in name as its header,
  // the appearance choice and the way out.
  const accountItems: MenuItem[] = [
    ...THEME_ORDER.map(
      (theme, i): MenuItem => ({
        label: THEME_LABELS[theme],
        checked: preference === theme,
        onSelect: () => setPreference(theme),
        separatorBefore: i === 0,
        groupLabel: i === 0 ? "Appearance" : undefined,
      }),
    ),
    { label: "Log out", onSelect: logout, separatorBefore: true },
  ];

  return (
    <PreviewOverlayProvider>
      <StudioShell
        modes={
          <ModeSwitcher label="Primary">
            {canUpload && (
              <ModeLink to="/" end icon="crop">
                Banner editor
              </ModeLink>
            )}
            {canUpload && (
              <ModeLink to="/channels" icon="image">
                Manage channel images
              </ModeLink>
            )}
            {isAdmin && (
              <ModeLink to="/banner-urls" icon="link">
                Banner URLs
              </ModeLink>
            )}
            {isAdmin && (
              <ModeLink to="/wallpaper" icon="sparkles">
                Channel Wallpaper
              </ModeLink>
            )}
          </ModeSwitcher>
        }
        account={
          <MenuButton
            label={username || "Account"}
            icon="user"
            header={username ? `Signed in as ${username}` : undefined}
            items={accountItems}
            align="end"
            collapseLabel
          />
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <RequireUpload>
                <Page>
                  <BannerCropper />
                </Page>
                {/* Gated to admin: the endpoint the current tree reads
                    (GET channels/banner-urls) is admin-only. */}
                {isAdmin && <LiveTreeLayers />}
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
                <Page>
                  <BannerUrlManager />
                </Page>
              </RequireAdmin>
            }
          />
          <Route
            path="/wallpaper"
            element={
              <RequireAdmin>
                <Page>
                  <ChannelWallpaperGenerator />
                </Page>
              </RequireAdmin>
            }
          />
          <Route
            path="/access-denied"
            element={
              <Page>
                <AccessDenied />
              </Page>
            }
          />
          <Route
            path="*"
            element={
              <Page>
                <NotFound />
              </Page>
            }
          />
        </Routes>
      </StudioShell>
    </PreviewOverlayProvider>
  );
}
