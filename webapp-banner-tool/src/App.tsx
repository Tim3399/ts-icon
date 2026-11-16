import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import BannerCropper from "./components/BannerCropper";
import ChannelGallery from "./components/ChannelGallery";
import BannerUrlManager from "./components/BannerUrlManager";
import ChannelWallpaperGenerator from "./components/ChannelWallpaperGenerator";
import RequireUpload from "./components/RequireUpload";
import RequireAdmin from "./components/RequireAdmin";
import {
  AccessDenied,
  LinkButton,
  MenuButton,
  ModeLink,
  ModeSwitcher,
  Notice,
  StudioPage,
  StudioShell,
  type MenuItem,
} from "./design";
import { THEME_LABELS, THEME_ORDER, useTheme } from "./theme/theme";
import { useAuth } from "./auth/AuthContext";
import { useCanUpload, useIsAdmin } from "./auth/permissions";
import { PreviewOverlayProvider } from "./preview/PreviewOverlayProvider";

function NotFound() {
  return (
    <Notice
      icon="search"
      title="Page not found"
      actions={
        <LinkButton to="/" variant="prominent" icon="crop">
          Open the banner editor
        </LinkButton>
      }
    >
      <p>This page doesn't exist.</p>
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
                {/* The editor fills the main region (canvas and dock) and brings
                    its own layer panel and inspector (T-142-F3 item 4, R4). */}
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
            // The state tile fills the main region itself (D-142F-39).
            element={<AccessDenied />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </StudioShell>
    </PreviewOverlayProvider>
  );
}
