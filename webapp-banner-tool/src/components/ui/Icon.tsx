// One inline icon set instead of an icon dependency: the app needs about two
// dozen glyphs, they all share a single 24px stroke grid, and inlining them
// keeps them recolorable with `currentColor` and free of an extra request.
//
// Every icon is decorative. Meaning always lives in adjacent text or in the
// control's own accessible name, so each renders `aria-hidden` and stays out
// of the accessibility tree entirely.

export type IconName =
  | "image"
  | "layers"
  | "sparkles"
  | "link"
  | "upload"
  | "trash"
  | "search"
  | "check"
  | "alert"
  | "info"
  | "close"
  | "left"
  | "right"
  | "up"
  | "down"
  | "back"
  | "zoomIn"
  | "zoomOut"
  | "expand"
  | "collapse"
  | "refresh"
  | "sun"
  | "moon"
  | "monitor"
  | "lock"
  | "panel"
  | "logout"
  | "crop"
  | "tree"
  | "sliders"
  | "inbox"
  | "send"
  | "undo";

const PATHS: Record<IconName, React.ReactNode> = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M3 16.5l4.5-4.5 3.5 3.5 3-3L21 15" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17.5l9 4.5 9-4.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.6 6.7" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9l.8-12.1" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  right: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  up: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  down: (
    <>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
      <path d="M8.5 11h5M11 8.5v5" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
      <path d="M8.5 11h5" />
    </>
  ),
  expand: (
    <>
      <path d="M9 4H4v5" />
      <path d="M15 20h5v-5" />
      <path d="M4 4l6 6" />
      <path d="M20 20l-6-6" />
    </>
  ),
  collapse: (
    <>
      <path d="M4 9h5V4" />
      <path d="M20 15h-5v5" />
      <path d="M4 4l5 5" />
      <path d="M20 20l-5-5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 5v6h-6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4.5h3A2.5 2.5 0 0 1 20.5 7v10a2.5 2.5 0 0 1-2.5 2.5h-3" />
      <path d="M11 8l-4 4 4 4" />
      <path d="M7 12h9" />
    </>
  ),
  crop: (
    <>
      <path d="M6.5 2.5v15h15" />
      <path d="M2.5 6.5h15v15" />
    </>
  ),
  tree: (
    <>
      <path d="M5 4v13a2 2 0 0 0 2 2h3" />
      <path d="M5 11h5" />
      <rect x="12" y="3" width="8" height="4" rx="1.5" />
      <rect x="12" y="9" width="8" height="4" rx="1.5" />
      <rect x="12" y="17" width="8" height="4" rx="1.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13h4l1.5 3h6l1.5-3h4" />
      <path d="M5.7 5.3l-2.2 7.4V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5.3l-2.2-7.4A2 2 0 0 0 16.4 4H7.6a2 2 0 0 0-1.9 1.3z" />
    </>
  ),
  send: (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4L21 3z" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H8" />
      <path d="M8 5L4 9l4 4" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 16, className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
