import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import { Spinner } from "../components/States";
import "./Notice.css";

interface NoticeProps {
  title: string;
  icon?: IconName;
  /** Large brand mark instead of an icon, for the sign-in splash. */
  brand?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Fill the whole window (sign-in splash) instead of the content column. */
  fullscreen?: boolean;
  /** Heading level: h1 on a page, a plain paragraph on the splash. */
  as?: "h1" | "p";
}

// A centred card for whole-page states: Access denied, Not found and the
// sign-in splash. One look for "this page cannot show its content".
export function Notice({
  title,
  icon,
  brand,
  children,
  actions,
  fullscreen = false,
  as: Title = "h1",
}: NoticeProps) {
  return (
    <div className={`ds-notice${fullscreen ? " ds-notice-fullscreen" : ""}`}>
      <div className="ds-notice-card">
        {brand}
        {icon && (
          <div className="ds-notice-icon" aria-hidden="true">
            <Icon name={icon} size={22} />
          </div>
        )}
        <Title className="ds-notice-title">{title}</Title>
        {children && <div className="ds-notice-text">{children}</div>}
        {actions && <div className="ds-notice-actions">{actions}</div>}
      </div>
    </div>
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
      brand={<img src={logoSrc} alt="" width={44} height={44} />}
      actions={actions}
    >
      {busy && <Spinner large />}
      {children}
    </Notice>
  );
}
