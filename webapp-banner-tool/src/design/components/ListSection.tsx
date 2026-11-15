import { useState, type DragEvent, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "../primitives/Icon";
import "./ListSection.css";

interface ListSectionProps {
  /** Section header, at most three words: the box's header row. */
  header?: ReactNode;
  /** One sentence under the box, only where needed. */
  footer?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Primer ActionList box in HIG inset-grouped form: one rounded container with
 * a 1 px border, an optional header row and 1 px dividers between its rows.
 * It has no shadow. Children are ListRows.
 */
export function ListSection({ header, footer, id, className, children }: ListSectionProps) {
  const headingId = id && header ? `${id}-header` : undefined;
  return (
    <section id={id} className={`ds-list-section${className ? ` ${className}` : ""}`}>
      <div className="ds-list-box">
        {header && (
          <h2 id={headingId} className="ds-list-header">
            {header}
          </h2>
        )}
        <ul className="ds-list" aria-labelledby={headingId}>
          {children}
        </ul>
      </div>
      {footer && <p className="ds-list-footer">{footer}</p>}
    </section>
  );
}

interface ListRowProps extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  /** Leading icon, thumbnail or glyph. */
  leading?: ReactNode;
  title: ReactNode;
  /** Secondary text under the title. */
  subtitle?: ReactNode;
  /** Trailing value, control, action or menu. */
  trailing?: ReactNode;
  /** Shows a trailing chevron: the row opens something. */
  disclosure?: boolean;
  /**
   * The row accepts a dropped file and highlights only while a drag is over
   * it (no dashed border). Called with the first dropped file; the caller
   * validates it.
   */
  onDropFile?: (file: File) => void;
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** One row of a ListSection: leading visual, title with secondary text, trailing content. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  disclosure,
  onDropFile,
  className,
  children,
  ...rest
}: ListRowProps) {
  const [dragOver, setDragOver] = useState(false);
  const drop = onDropFile
    ? {
        onDragEnter: (event: DragEvent<HTMLLIElement>) => {
          if (hasFiles(event)) setDragOver(true);
        },
        onDragOver: (event: DragEvent<HTMLLIElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragOver(true);
        },
        onDragLeave: (event: DragEvent<HTMLLIElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
        },
        onDrop: (event: DragEvent<HTMLLIElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onDropFile(file);
        },
      }
    : {};
  return (
    <li
      className={`ds-list-row${className ? ` ${className}` : ""}`}
      data-drag-over={dragOver ? "" : undefined}
      {...drop}
      {...rest}
    >
      <div className="ds-list-row-main">
        {leading && <div className="ds-list-row-leading">{leading}</div>}
        <div className="ds-list-row-text">
          <div className="ds-list-row-title">{title}</div>
          {subtitle && <div className="ds-list-row-subtitle">{subtitle}</div>}
        </div>
        {trailing && <div className="ds-list-row-trailing">{trailing}</div>}
        {disclosure && <Icon name="chevronRight" size={14} className="ds-list-row-disclosure" />}
      </div>
      {children && <div className="ds-list-row-extra">{children}</div>}
    </li>
  );
}
