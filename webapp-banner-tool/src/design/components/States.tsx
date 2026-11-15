import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./States.css";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

// "Nothing here" is a distinct state from "still loading" and from "the
// request failed" -- the audit called out that the app used to blur all three
// into one blank list. These components keep the difference visible.
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={`ds-empty-state${className ? ` ${className}` : ""}`}>
      {icon && (
        <span className="ds-empty-state-icon">
          <Icon name={icon} size={28} strokeWidth={1.5} />
        </span>
      )}
      <p className="ds-empty-state-title">{title}</p>
      {description && <p className="ds-empty-state-text">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`ds-spinner${large ? " ds-spinner-large" : ""}`} aria-hidden="true" />;
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={`ds-loading-state${className ? ` ${className}` : ""}`}>
      <Spinner />
      {label}
    </p>
  );
}

/** Placeholder block; `height` in px. `radius` picks a radius role. */
export function Skeleton({
  height,
  width,
  radius,
}: {
  height: number;
  width?: string;
  radius?: "small" | "control" | "card" | number;
}) {
  return (
    <span
      aria-hidden="true"
      className="ds-skeleton"
      data-radius={typeof radius === "string" ? radius : undefined}
      style={{
        height,
        width: width ?? "100%",
        borderRadius: typeof radius === "number" ? radius : undefined,
      }}
    />
  );
}
