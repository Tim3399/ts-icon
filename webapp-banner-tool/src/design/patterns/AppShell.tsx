import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "../primitives/Button";
import { Icon, type IconName } from "../primitives/Icon";
import "./AppShell.css";

/** From this width the sidebar is a column; below it, a drawer (HIG, D-3). */
const WIDE_SIDEBAR_QUERY = "(min-width: 1024px)";
const SIDEBAR_ID = "app-sidebar";

function subscribeWide(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE_SIDEBAR_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

// Without matchMedia (jsdom) the sidebar counts as wide: always shown.
function readWide() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(WIDE_SIDEBAR_QUERY).matches
    : true;
}

interface AppShellProps {
  /** Brand block at the top of the sidebar. */
  brand: ReactNode;
  /** Accessible name of the sidebar navigation. */
  navLabel: string;
  /** SidebarLink entries; one level only (HIG allows at most two). */
  nav: ReactNode;
  /** Trailing toolbar controls (panel toggle, appearance, account). */
  toolbar: ReactNode;
  /** Optional SidePanel, placed beside (from 1200 px) or below the content. */
  panel?: ReactNode;
  children: ReactNode;
}

// HIG sidebar layout: sidebar on the leading side, a toolbar over the
// content, and an optional panel. Below 1024 px the sidebar collapses into a
// drawer behind a toggle; while collapsed its links are inert.
export function AppShell({ brand, navLabel, nav, toolbar, panel, children }: AppShellProps) {
  const wide = useSyncExternalStore(subscribeWide, readWide, () => true);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const location = useLocation();
  const collapsed = !wide && !open;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggle.current?.focus();
  }, []);

  // A navigation on a narrow viewport closes the drawer.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Opening moves focus into the drawer, so Tab continues inside it.
  useEffect(() => {
    if (open && !wide) sidebar.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open, wide]);

  useEffect(() => {
    if (!open || wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, wide, close]);

  return (
    <div className="ds-shell" data-sidebar={wide ? "column" : open ? "open" : "collapsed"}>
      <a className="ds-skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        ref={sidebar}
        id={SIDEBAR_ID}
        className="ds-shell-sidebar"
        aria-label="Sidebar"
        inert={collapsed}
      >
        <div className="ds-shell-sidebar-inner">
          <div className="ds-shell-brand">{brand}</div>
          <nav className="ds-shell-nav" aria-label={navLabel}>
            <ul className="ds-shell-nav-list">{nav}</ul>
          </nav>
        </div>
      </aside>
      {!wide && open && (
        <div className="ds-shell-scrim" aria-hidden="true" onClick={() => close(false)} />
      )}
      <div className="ds-shell-content">
        <header className="ds-shell-toolbar">
          <Button
            ref={toggle}
            variant="plain"
            icon="sidebar"
            iconOnly
            className="ds-shell-sidebar-toggle"
            aria-label={open ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={wide || open}
            aria-controls={SIDEBAR_ID}
            onClick={() => (open ? close(false) : setOpen(true))}
          />
          <div className="ds-shell-toolbar-brand">{brand}</div>
          <div className="ds-shell-toolbar-actions">{toolbar}</div>
        </header>
        <div className={`ds-shell-body${panel ? " ds-shell-body-with-panel" : ""}`}>
          <main className="ds-shell-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
          {panel}
        </div>
      </div>
    </div>
  );
}

/** One sidebar destination; the current one gets aria-current="page". */
export function SidebarLink({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <li>
      <NavLink to={to} end={end} className="ds-sidebar-link">
        <Icon name={icon} size={18} className="ds-sidebar-link-icon" />
        <span>{children}</span>
      </NavLink>
    </li>
  );
}

/** The live panel container: a titled column that can be hidden. */
export function SidePanel({
  id,
  title,
  icon,
  open,
  children,
}: {
  id: string;
  title: string;
  icon?: IconName;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <aside className="ds-side-panel" id={id} aria-label={title} hidden={!open}>
      <div className="ds-side-panel-inner">
        <h2 className="ds-side-panel-title">
          {icon && <Icon name={icon} size={15} />}
          {title}
        </h2>
        <div className="ds-side-panel-body">{children}</div>
      </div>
    </aside>
  );
}

/** Account chip for the toolbar: initials and the signed-in name. */
export function UserChip({ name }: { name?: string }) {
  const source = (name ?? "").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials = !source
    ? "?"
    : (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
  return (
    <span className="ds-user-chip" title={name}>
      <span className="ds-user-avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="ds-user-name">
        <span className="ds-visually-hidden">Signed in as </span>
        {name}
      </span>
    </span>
  );
}

/** App name, tagline and mark, for the sidebar and the narrow toolbar. */
export function Brand({
  name,
  tagline,
  logoSrc,
}: {
  name: string;
  tagline?: string;
  logoSrc: string;
}) {
  return (
    <span className="ds-brand">
      <img className="ds-brand-mark" src={logoSrc} alt="" width={30} height={30} />
      <span>
        <span className="ds-brand-name">{name}</span>
        {tagline && <span className="ds-brand-tagline">{tagline}</span>}
      </span>
    </span>
  );
}
