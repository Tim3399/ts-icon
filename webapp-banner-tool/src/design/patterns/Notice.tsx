import type { ReactNode } from "react";
import type { IconName } from "../primitives/Icon";
import { Spinner } from "../components/States";
import { StateTile } from "../components/StateTile";
import "./Notice.css";

interface NoticeProps {
  title: string;
  icon?: IconName;
  /** Large brand mark instead of an icon, for the sign-in splash. */
  brand?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Fill the whole window (sign-in splash) instead of the main region. */
  fullscreen?: boolean;
  /** Heading level: h1 on a page, a plain paragraph on the splash. */
  as?: "h1" | "p";
}

// Whole-page states: Access denied, Not found and the sign-in splash. One look
// for "this page cannot show its content": the D2 state tile filling the main
// region (T-142-F3 item 11).
export function Notice({
  title,
  icon,
  brand,
  children,
  actions,
  fullscreen = false,
  as = "h1",
}: NoticeProps) {
  return (
    <StateTile
      icon={brand ? undefined : icon}
      glyph={brand}
      title={title}
      level={as === "h1" ? 1 : "p"}
      action={actions}
      size="page"
      className={fullscreen ? "ds-notice-fullscreen" : undefined}
    >
      {children}
    </StateTile>
  );
}

/** Full-window splash while signing in, or when sign-in failed. */
export function Splash({
  name,
  logoSrc,
  busy = false,
  children,
  actions,
}: {
  name: string;
  logoSrc: string;
  busy?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Notice
      fullscreen
      as="p"
      title={name}
      brand={<img src={logoSrc} alt="" width={28} height={28} />}
      actions={actions}
    >
      {busy && <Spinner large />}
      {children}
    </Notice>
  );
}
