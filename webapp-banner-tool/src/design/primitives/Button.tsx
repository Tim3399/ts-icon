import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./Button.css";

export type ButtonVariant = "prominent" | "bordered" | "plain" | "destructive";
export type ButtonSize = "regular" | "small";

interface ButtonLook {
  /** HIG roles: at most one prominent button per screen; destructive never prominent. */
  variant?: ButtonVariant;
  /** Both sizes keep the 44 x 44 px hit area; small only tightens type and padding. */
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

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  iconOnly: boolean | undefined,
  extra?: string,
) {
  return [
    "ds-button",
    `ds-button-${variant}`,
    size === "small" ? "ds-button-small" : "",
    iconOnly ? "ds-button-icon-only" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function content(
  icon: IconName | undefined,
  size: ButtonSize,
  iconOnly?: boolean,
  children?: ReactNode,
) {
  return (
    <>
      {icon && <Icon name={icon} size={size === "small" ? 15 : 17} className="ds-button-glyph" />}
      {!iconOnly && children}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "bordered",
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
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, iconOnly, className)}
      data-variant={variant}
      title={iconOnly ? (rest.title ?? rest["aria-label"]) : rest.title}
      {...rest}
    >
      {content(icon, size, iconOnly, children)}
    </button>
  );
});

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = "bordered", size = "regular", icon, iconOnly, className, children, ...rest },
  ref,
) {
  return (
    <Link
      ref={ref}
      className={classes(variant, size, iconOnly, className)}
      data-variant={variant}
      {...rest}
    >
      {content(icon, size, iconOnly, children)}
    </Link>
  );
});
