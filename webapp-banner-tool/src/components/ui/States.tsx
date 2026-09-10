import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

// "Nothing here" is a distinct state from "still loading" and from "the
// request failed" -- the audit called out that the app used to blur all three
// into one blank list. These two components keep the difference visible.
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ""}`}>
      {icon && (
        <span className="empty-state-icon">
          <Icon name={icon} size={19} />
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={`loading-state${className ? ` ${className}` : ""}`}>
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

export function Skeleton({
  height,
  width,
  radius,
}: {
  height: number;
  width?: string;
  radius?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="skeleton"
      style={{
        display: "block",
        height,
        width: width ?? "100%",
        borderRadius: radius,
      }}
    />
  );
}
