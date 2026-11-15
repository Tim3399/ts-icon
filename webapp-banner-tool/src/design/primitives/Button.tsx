import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./Button.css";

/**
 * HIG button styles (T-142-F1 item 8): prominent (accent fill), gray (neutral
 * fill) and plain (borderless text). Toolbar icons use ToolbarButton.
 * `"bordered"` and `"destructive"` are deprecated aliases for stage-B screens.
 */
export type ButtonVariant = "prominent" | "gray" | "plain" | "bordered" | "destructive";
export type ButtonSize = "regular" | "small";

interface ButtonLook {
  /**
   * At most one prominent button per view. `"bordered"` is a deprecated alias
   * of `"gray"`; `"destructive"` is a deprecated alias of
   * `variant="plain" destructive`. Both aliases go away in stage B.
   */
  variant?: ButtonVariant;
  /** Red text and glyph (never a red fill); only with `gray` or `plain`. */
  destructive?: boolean;
  /** Both sizes keep the viewport hit target; small only tightens type and padding. */
  size?: ButtonSize;
  icon?: IconName;
}

/** Icon-only buttons have no visible text, so an accessible name is required. */
type IconOnly = { iconOnly: true; icon: IconName; "aria-label": string };
type WithText = { iconOnly?: false };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonLook &
  (IconOnly | WithText);

export type LinkButtonProps = LinkProps &
  AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonLook &
  (IconOnly | WithText);

type Resolved = { variant: "prominent" | "gray" | "plain"; destructive: boolean };

function resolve(variant: ButtonVariant, destructive: boolean | undefined): Resolved {
  if (variant === "destructive") return { variant: "plain", destructive: true };
  const base = variant === "bordered" ? "gray" : variant;
  // A red fill exists only inside ConfirmDialog; prominent is never destructive.
  return { variant: base, destructive: Boolean(destructive) && base !== "prominent" };
}

function classes(
  { variant, destructive }: Resolved,
  size: ButtonSize,
  iconOnly: boolean | undefined,
  extra?: string,
) {
  return [
    "ds-button",
    `ds-button-${variant}`,
    destructive ? "ds-button-destructive" : "",
    size === "small" ? "ds-button-small" : "",
    iconOnly ? "ds-button-icon-only" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The accent a button renders: prominent fill, or link-coloured plain text. */
function accentOf({ variant, destructive }: Resolved) {
  if (variant === "prominent") return "primary";
  if (variant === "plain" && !destructive) return "link";
  return undefined;
}

function content(
  icon: IconName | undefined,
  size: ButtonSize,
  iconOnly?: boolean,
  children?: ReactNode,
) {
  return (
    <>
      {icon && <Icon name={icon} size={size === "small" ? 14 : 16} className="ds-button-glyph" />}
      {!iconOnly && children}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "gray",
    destructive,
    size = "regular",
    icon,
    iconOnly,
    className,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  const look = resolve(variant, destructive);
  return (
    <button
      ref={ref}
      type={type}
      className={classes(look, size, iconOnly, className)}
      data-variant={look.variant}
      data-accent={accentOf(look)}
      data-destructive={look.destructive ? "" : undefined}
      title={iconOnly ? (rest.title ?? rest["aria-label"]) : rest.title}
      {...rest}
    >
      {content(icon, size, iconOnly, children)}
    </button>
  );
});

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = "gray", destructive, size = "regular", icon, iconOnly, className, children, ...rest },
  ref,
) {
  const look = resolve(variant, destructive);
  return (
    <Link
      ref={ref}
      className={classes(look, size, iconOnly, className)}
      data-variant={look.variant}
      data-accent={accentOf(look)}
      data-destructive={look.destructive ? "" : undefined}
      {...rest}
    >
      {content(icon, size, iconOnly, children)}
    </Link>
  );
});
