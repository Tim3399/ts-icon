import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import { ToolbarButton } from "../components/Toolbar";
import { Icon, type IconName } from "../primitives/Icon";
import { STUDIO_LAYERS_ID, useStudioLayout } from "./studioLayout";
import "./StudioShell.css";

type SlotName = "toolbar" | "layers" | "inspector";

interface SlotContextValue {
  targets: Record<SlotName, HTMLElement | null>;
  register: (name: SlotName) => () => void;
}

const SlotContext = createContext<SlotContextValue | null>(null);

function useSlot(name: SlotName, children: ReactNode) {
  const context = useContext(SlotContext);
  if (!context) throw new Error("Studio slots must be rendered inside StudioShell");
  const { register, targets } = context;
  useLayoutEffect(() => register(name), [register, name]);
  const target = targets[name];
  return target ? createPortal(children, target) : null;
}

/** Screen controls for the top bar (the editor puts its canvas tools and zoom here). */
export function StudioToolbar({ children }: { children: ReactNode }) {
  return useSlot("toolbar", children);
}

/** The left layer panel. A screen without layers does not render it. */
export function StudioLayers({ children }: { children: ReactNode }) {
  return useSlot("layers", children);
}

/** The right inspector panel. */
export function StudioInspector({ children }: { children: ReactNode }) {
  return useSlot("inspector", children);
}

interface StudioShellProps {
  /** The ModeSwitcher with the routes the user may open. */
  modes: ReactNode;
  /** The account MenuButton (user, theme, "Log out"). */
  account: ReactNode;
  /** The routed screen: rendered in the main region. */
  children: ReactNode;
}

/**
 * The D2 Studio shell (T-142-F3 items 1 and 3, R2, R7): a top bar with the
 * "ts-icon Studio" mark, the mode switcher, a screen toolbar slot and the
 * account menu, over three workspace regions (layers, main, inspector).
 */
export function StudioShell({ modes, account, children }: StudioShellProps) {
  const layout = useStudioLayout();
  const [targets, setTargets] = useState<Record<SlotName, HTMLElement | null>>({
    toolbar: null,
    layers: null,
    inspector: null,
  });
  const [present, setPresent] = useState<Record<SlotName, number>>({
    toolbar: 0,
    layers: 0,
    inspector: 0,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const layersPanel = useRef<HTMLElement | null>(null);
  const location = useLocation();

  const register = useCallback((name: SlotName) => {
    setPresent((p) => ({ ...p, [name]: p[name] + 1 }));
    return () => setPresent((p) => ({ ...p, [name]: p[name] - 1 }));
  }, []);

  const slotRef = useCallback(
    (name: SlotName) => (node: HTMLElement | null) => {
      if (name === "layers") layersPanel.current = node;
      setTargets((t) => (t[name] === node ? t : { ...t, [name]: node }));
    },
    [],
  );
  const refs = useMemo(
    () => ({
      toolbar: slotRef("toolbar"),
      layers: slotRef("layers"),
      inspector: slotRef("inspector"),
    }),
    [slotRef],
  );

  const hasLayers = present.layers > 0;
  const hasInspector = present.inspector > 0;
  const drawer = layout === "drawer" && hasLayers;
  const drawerClosed = drawer && !drawerOpen;

  const closeDrawer = useCallback((returnFocus: boolean) => {
    setDrawerOpen(false);
    if (returnFocus) toggle.current?.focus();
  }, []);

  // A navigation or a layout change closes the drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, layout]);

  // Opening moves focus into the drawer, so Tab continues inside it.
  useEffect(() => {
    if (drawer && drawerOpen)
      layersPanel.current
        ?.querySelector<HTMLElement>("a, button, input, select, [tabindex]")
        ?.focus();
  }, [drawer, drawerOpen]);

  useEffect(() => {
    if (!drawer || !drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, drawerOpen, closeDrawer]);

  const context = useMemo(() => ({ targets, register }), [targets, register]);

  return (
    <SlotContext.Provider value={context}>
      <div
        className="ds-studio"
        data-layout={layout}
        data-layers={hasLayers ? (drawer ? (drawerOpen ? "open" : "closed") : "panel") : "none"}
        data-inspector={hasInspector ? "panel" : "none"}
      >
        <a className="ds-skip-link" data-accent="primary" href="#main-content">
          Skip to content
        </a>
        <header className="ds-studio-bar">
          {drawer && (
            <ToolbarButton
              ref={toggle}
              icon="layers"
              className="ds-studio-layers-toggle"
              label={drawerOpen ? "Hide layers" : "Show layers"}
              aria-expanded={drawerOpen}
              aria-controls={STUDIO_LAYERS_ID}
              onClick={() => (drawerOpen ? closeDrawer(false) : setDrawerOpen(true))}
            />
          )}
          <StudioMark />
          {modes}
          <div className="ds-studio-bar-spacer" />
          <div className="ds-studio-bar-tools" ref={refs.toolbar} />
          <div className="ds-studio-bar-account">{account}</div>
        </header>
        {drawer && drawerOpen && (
          <div className="ds-studio-scrim" aria-hidden="true" onClick={() => closeDrawer(false)} />
        )}
        <div className="ds-studio-workspace">
          <aside
            ref={refs.layers}
            id={STUDIO_LAYERS_ID}
            className="ds-studio-layers"
            aria-label="Layers"
            hidden={!hasLayers}
            inert={drawerClosed}
          />
          <main className="ds-studio-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
          <aside
            ref={refs.inspector}
            className="ds-studio-inspector"
            aria-label="Inspector"
            hidden={!hasInspector}
          />
        </div>
      </div>
    </SlotContext.Provider>
  );
}

/** The "ts-icon Studio" mark at the leading edge of the top bar. */
export function StudioMark() {
  return (
    <span className="ds-studio-mark">
      <span className="ds-studio-mark-glyph" aria-hidden="true">
        <Icon name="crop" size={15} />
      </span>
      <span className="ds-studio-mark-name">ts-icon</span>
      <span className="ds-studio-mark-sub">Studio</span>
    </span>
  );
}

/** The workspace switcher of the top bar (it replaces the sidebar, item 1). */
export function ModeSwitcher({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="ds-mode-switcher" aria-label={label}>
      <ul className="ds-mode-list">{children}</ul>
    </nav>
  );
}

/**
 * One workspace in the mode switcher; the current one gets
 * aria-current="page". Below 1240 px only the icon shows: the label stays the
 * accessible name and becomes the tooltip (R7).
 */
export function ModeLink({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: IconName;
  children: string;
}) {
  return (
    <li>
      <NavLink to={to} end={end} className="ds-mode-link" title={children}>
        {({ isActive }) => (
          <>
            <span className="ds-mode-icon" data-accent={isActive ? "selection" : undefined}>
              <Icon name={icon} size={16} />
            </span>
            <span className="ds-mode-label">{children}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
