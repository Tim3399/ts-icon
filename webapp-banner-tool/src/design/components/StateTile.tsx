import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./StateTile.css";

export interface StateTileProps {
  /** The glyph in the round badge. */
  icon?: IconName;
  /** A custom glyph instead of an icon (the loading spinner). */
  glyph?: ReactNode;
  /** The short sentence of the state; a heading of the given level, or a paragraph. */
  title: string;
  level?: 1 | 2 | 3 | "p";
  children?: ReactNode;
  /** The one action. */
  action?: ReactNode;
  /** role="alert" for an error state, role="status" for loading. */
  role?: "alert" | "status";
  /**
   * "page" fills the main region under the top bar (Access denied, Not
   * found); "region" (default) fills the panel or table area it sits in.
   */
  size?: "page" | "region";
  className?: string;
}

/**
 * The D2 state tile (T-142-F3 item 11, mockup D2/state.html): a centred, quiet
 * card on the dotted canvas background with a glyph in a round badge, one
 * short sentence, an optional line of text and one action. Not found, Access
 * denied and the empty, loading and error states all use it.
 */
export function StateTile({
  icon,
  glyph,
  title,
  level = 2,
  children,
  action,
  role,
  size = "region",
  className,
}: StateTileProps) {
  const Title = level === "p" ? "p" : (`h${level}` as const);
  return (
    <div
      className={`ds-state-tile${className ? ` ${className}` : ""}`}
      data-size={size}
      role={role}
    >
      <div className="ds-state-tile-card">
        {(glyph || icon) && (
          <span className="ds-state-tile-glyph" aria-hidden="true">
            {glyph ?? (icon && <Icon name={icon} size={20} strokeWidth={1.6} />)}
          </span>
        )}
        <Title className="ds-state-tile-title">{title}</Title>
        {children && <div className="ds-state-tile-text">{children}</div>}
        {action && <div className="ds-state-tile-action">{action}</div>}
      </div>
    </div>
  );
}
