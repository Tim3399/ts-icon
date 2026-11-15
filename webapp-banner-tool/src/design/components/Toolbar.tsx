import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./Toolbar.css";

/** A row of ToolbarButtons (page header trailing slot, shell top bar). */
export function Toolbar({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ds-toolbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export type ToolbarButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  icon: IconName;
  /** Accessible name and tooltip; the button shows only the glyph. */
  label: string;
};

/**
 * HIG toolbar style: an icon-only, borderless button in label colour. The
 * label is its accessible name and its tooltip; the hit area is the viewport
 * hit target (44 px below 1024 px, 32 px from 1024 px).
 */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton({ icon, label, className, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={`ds-toolbar-button${className ? ` ${className}` : ""}`}
        data-variant="toolbar"
        aria-label={label}
        title={label}
        {...rest}
      >
        <Icon name={icon} size={16} />
      </button>
    );
  },
);
