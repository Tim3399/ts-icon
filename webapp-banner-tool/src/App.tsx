import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Routes, Route } from "react-router-dom";
import BannerCropper from "./components/BannerCropper";
import ChannelGallery from "./components/ChannelGallery";
import BannerUrlManager from "./components/BannerUrlManager";
import ChannelWallpaperGenerator from "./components/ChannelWallpaperGenerator";
import ChannelTreePreview from "./components/ChannelTreePreview";
import AccessDenied from "./components/AccessDenied";
import RequireUpload from "./components/RequireUpload";
import RequireAdmin from "./components/RequireAdmin";
import Icon from "./components/ui/Icon";
import ThemeToggle from "./components/ui/ThemeToggle";
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

function readRailPreference(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

function initials(name?: string): string {
  const source = (name ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
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

  return (
    <aside
      className={`app-rail${open ? "" : " app-rail-hidden"}`}
      aria-label="Live channel tree"
      id="live-tree-panel"
    >
      <div className="app-rail-head">
        <h2 className="app-rail-title">
          <Icon name="tree" size={13} />
          Live channel tree
        </h2>
      </div>
      <div className="app-rail-body">
        <ChannelTreePreview refreshKey={refreshKey + pollTick} overlay={overlay} />
      </div>
    </aside>
  );
};

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

  return (
    <PreviewOverlayProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="app-header">
          <div className="app-header-inner">
            <Link to="/" className="brand" aria-label="TS-Icon home">
              <span className="brand-mark">
                <img src="/icon.svg" alt="" width={30} height={30} />
              </span>
              <span>
                <span className="brand-name">TS-Icon</span>
                <span className="brand-tagline">Channel banners</span>
              </span>
            </Link>
            {/* Never collapsed behind a disclosure: with four destinations a
                wrapping bar keeps every page reachable with Tab alone at any
                width, which a hidden menu would not. */}
            <nav className="app-nav" aria-label="Primary">
              {canUpload && (
                <NavLink to="/" end className="app-nav-link">
                  <Icon name="crop" size={15} />
                  Banner editor
                </NavLink>
              )}
              {canUpload && (
                <NavLink to="/channels" className="app-nav-link">
                  <Icon name="image" size={15} />
                  Manage channel images
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/banner-urls" className="app-nav-link">
                  <Icon name="link" size={15} />
                  Banner URLs
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/wallpaper" className="app-nav-link">
                  <Icon name="sparkles" size={15} />
                  Channel Wallpaper
                </NavLink>
              )}
            </nav>
            <div className="app-header-actions">
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={toggleRail}
                  aria-expanded={railOpen}
                  aria-controls="live-tree-panel"
                  title={railOpen ? "Hide the live channel tree" : "Show the live channel tree"}
                  aria-label={
                    railOpen ? "Hide the live channel tree" : "Show the live channel tree"
                  }
                >
                  <Icon name="panel" size={17} />
                </button>
              )}
              <ThemeToggle />
              <span className="user-chip" title={username}>
                <span className="user-avatar" aria-hidden="true">
                  {initials(username)}
                </span>
                <span className="user-name truncate">
                  <span className="sr-only">Signed in as </span>
                  {username}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={logout}
                aria-label="Logout"
                title="Logout"
              >
                <Icon name="logout" size={16} />
                <span className="hide-sm">Logout</span>
              </button>
            </div>
          </div>
        </header>
        <div className={`app-body${isAdmin && railOpen ? " app-body-with-rail" : ""}`}>
          <main className="app-main" id="main-content">
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
              <Route
                path="*"
                element={
                  <section className="card">
                    <h1 className="page-title">Page not found</h1>
                    <p className="page-lead">
                      This address does not match a page. The banner editor is the usual place to
                      start.
                    </p>
                    <div className="actions-row" style={{ marginTop: "var(--space-5)" }}>
                      <Link to="/" className="btn btn-primary">
                        <Icon name="crop" size={15} />
                        Create a banner
                      </Link>
                    </div>
                  </section>
                }
              />
            </Routes>
          </main>
          {/* Gated to admin, matching the nav links above: the backend
              endpoint this panel reads (GET channels/banner-urls) is
              admin-only, so an editor-only account would otherwise see a
              constant stream of 403 toasts from a panel it can't use. */}
          {isAdmin && <LivePreviewPanel open={railOpen} />}
        </div>
      </div>
    </PreviewOverlayProvider>
  );
}
