import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../primitives/Button";
import { Icon, type IconName } from "../primitives/Icon";
import "./MenuButton.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Red text: a destructive action. */
  destructive?: boolean;
  /** Makes the item a radio entry; `true` marks the current choice. */
  checked?: boolean;
  /** A divider (and optional group label) before this item. */
  separatorBefore?: boolean;
  groupLabel?: string;
}

interface MenuButtonProps {
  /** Visible text of the button and accessible name. */
  label: string;
  icon?: IconName;
  items: MenuItem[];
  /** Non-interactive text at the top of the menu (for example the user name). */
  header?: string;
  /** Opens towards the leading edge when the button sits at the trailing edge. */
  align?: "start" | "end";
  /** Below 768 px only the icon stays visible; the label remains the accessible name. */
  collapseLabel?: boolean;
}

/**
 * HIG pop-up menu: a gray button that opens a menu. Enter, Space or the
 * arrow keys open it, the arrows (Home, End) move, Escape closes it and
 * returns focus to the button, Tab closes it.
 */
export function MenuButton({
  label,
  icon,
  items,
  header,
  align = "start",
  collapseLabel = false,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pending = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const openWith = (where: "first" | "last") => {
    pending.current = where;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const buttons = refs.current.filter(Boolean) as HTMLButtonElement[];
    const checked = buttons.find((b) => b.getAttribute("aria-checked") === "true");
    const target =
      pending.current === "last" ? buttons[buttons.length - 1] : (checked ?? buttons[0]);
    target?.focus();
    pending.current = null;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = refs.current.filter(Boolean) as HTMLButtonElement[];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => {
      event.preventDefault();
      buttons[(i + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(buttons.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") setOpen(false);
  };

  refs.current = [];

  return (
    <div className="ds-menu-button" ref={root} data-open={open ? "" : undefined}>
      <Button
        ref={trigger}
        variant="gray"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="ds-menu-trigger"
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openWith("first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openWith("last");
          }
        }}
      >
        {icon && <Icon name={icon} size={16} className="ds-button-glyph" />}
        <span className={collapseLabel ? "ds-menu-trigger-label ds-menu-collapse" : undefined}>
          {label}
        </span>
        <Icon name="chevronDown" size={12} className="ds-button-glyph ds-menu-chevron" />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="ds-menu"
          data-popover=""
          data-align={align}
          onKeyDown={onMenuKey}
        >
          {header && (
            <div role="presentation" className="ds-menu-header">
              {header}
            </div>
          )}
          {items.map((item, i) => (
            <div key={item.label} role="presentation">
              {item.separatorBefore && (
                <>
                  <div role="separator" className="ds-menu-separator" />
                  {item.groupLabel && (
                    <div role="presentation" className="ds-menu-group-label">
                      {item.groupLabel}
                    </div>
                  )}
                </>
              )}
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked}
                tabIndex={-1}
                className="ds-menu-item"
                data-destructive={item.destructive ? "" : undefined}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                <span className="ds-menu-item-check" aria-hidden="true">
                  {item.checked && <Icon name="check" size={14} />}
                </span>
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
