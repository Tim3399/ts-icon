import type { HTMLAttributes, ReactNode } from "react";
import "./Layout.css";

/** A step of the spacing scale (--space-<n>). */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Space;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  children?: ReactNode;
}

function join(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

/** Vertical (default) or horizontal flow with a gap from the spacing scale. */
export function Stack({
  gap = 4,
  direction = "column",
  align,
  className,
  ...rest
}: LayoutProps & { direction?: "column" | "row" }) {
  return (
    <div
      className={join("ds-stack", direction === "row" && "ds-stack-row", className)}
      data-gap={gap}
      data-align={align}
      {...rest}
    />
  );
}

/** A wrapping row, for groups of buttons, badges or filters. */
export function Cluster({
  gap = 2,
  align = "center",
  justify,
  className,
  ...rest
}: LayoutProps & { justify?: "start" | "end" | "between" }) {
  return (
    <div
      className={join("ds-cluster", className)}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      {...rest}
    />
  );
}

/** A responsive grid: as many columns as fit at the given minimum width. */
export function Grid({
  gap = 4,
  min = "medium",
  className,
  ...rest
}: Omit<LayoutProps, "align"> & { min?: "small" | "medium" | "large" }) {
  return <div className={join("ds-grid", className)} data-gap={gap} data-min={min} {...rest} />;
}
