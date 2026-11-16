import type { ReactNode } from "react";
import type { IconName } from "../primitives/Icon";
import { StateTile } from "./StateTile";
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
// into one blank list. These components keep the difference visible, each as
// the D2 state tile (T-142-F3 item 11).
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <StateTile icon={icon ?? "inbox"} title={title} level="p" action={action} className={className}>
      {description}
    </StateTile>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`ds-spinner${large ? " ds-spinner-large" : ""}`} aria-hidden="true" />;
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <StateTile glyph={<Spinner />} title={label} level="p" role="status" className={className} />
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
