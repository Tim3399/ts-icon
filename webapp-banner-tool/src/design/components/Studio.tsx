import {
  forwardRef,
  useId,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./Studio.css";

// The Studio building blocks of concept D2 (T-142-F3, D-142G-1). The editor
// (D-142G-3) and Channel images (D-142G-4) are built from these; README,
// "Studio building blocks", has an example of each.

const join = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Panel */

interface PanelProps {
  title: string;
  /** Quiet text after the title (a count, a channel name). */
  meta?: ReactNode;
  /** Trailing header controls (icon buttons). */
  actions?: ReactNode;
  footer?: ReactNode;
  id?: string;
  className?: string;
  /** Heading level of the title; h2 by default. */
  level?: 1 | 2 | 3;
  children?: ReactNode;
}

/** A panel with a 40 px header (title, meta, trailing actions), a body and an optional footer. */
export function Panel({
  title,
  meta,
  actions,
  footer,
  id,
  className,
  level = 2,
  children,
}: PanelProps) {
  const Heading = `h${level}` as const;
  return (
    <section className={join("ds-panel", className)} id={id} aria-label={title}>
      <header className="ds-panel-head">
        <Heading className="ds-panel-title">{title}</Heading>
        {meta !== undefined && <span className="ds-panel-meta">{meta}</span>}
        {actions && <div className="ds-panel-actions">{actions}</div>}
      </header>
      <div className="ds-panel-body">{children}</div>
      {footer && <footer className="ds-panel-foot">{footer}</footer>}
    </section>
  );
}

/* --------------------------------------------------------- InspectorSection */

/** One group of the inspector: a title with optional meta, then property rows. */
export function InspectorSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="ds-inspector-section" aria-labelledby={id}>
      <div className="ds-inspector-section-head">
        <h3 className="ds-inspector-section-title" id={id}>
          {title}
        </h3>
        {meta !== undefined && <span className="ds-inspector-section-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ PropertyRow */

interface PropertyRowProps {
  label: string;
  /** Id of the control in the value cell; the label then becomes its <label>. */
  htmlFor?: string;
  children: ReactNode;
}

/** Label on the left, value (text or a control) on the right. */
export function PropertyRow({ label, htmlFor, children }: PropertyRowProps) {
  return (
    <div className="ds-property-row">
      {htmlFor ? (
        <label className="ds-property-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="ds-property-label">{label}</span>
      )}
      <div className="ds-property-value">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ NumberField */

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Accessible name of the field ("X", "Width"). */
  label: string;
  /** Short visible key in front of the value ("X", "W"); defaults to the label. */
  keyLabel?: string;
  /** Unit suffix ("px", "%"). */
  unit?: string;
}

/** A right-aligned number field with a short key and a unit suffix. */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { label, keyLabel, unit, id, className, ...rest },
  ref,
) {
  const fallback = useId();
  const inputId = id ?? fallback;
  return (
    <div className={join("ds-number-field", className)}>
      <label className="ds-number-key" htmlFor={inputId} title={label}>
        {keyLabel ?? label}
        {keyLabel && keyLabel !== label && <span className="ds-visually-hidden"> ({label})</span>}
      </label>
      <input ref={ref} id={inputId} type="text" inputMode="numeric" {...rest} />
      {unit && (
        <span className="ds-number-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </div>
  );
});

/* -------------------------------------------------------- SegmentedControl */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the radio group. */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A segmented control with radio-group semantics: arrow keys move the choice. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const edge = { Home: 0, End: options.length - 1 }[event.key];
    if (step === undefined && edge === undefined) return;
    event.preventDefault();
    const current = options.findIndex((o) => o.value === value);
    const next =
      edge !== undefined ? edge : (current + (step ?? 0) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      className={join("ds-segmented", className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="ds-segment"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- FilterBar */

interface FilterBarProps {
  /** The search field (a TextField or a plain input) on the leading edge. */
  search?: ReactNode;
  /** The segmented filter. */
  filter?: ReactNode;
  /** Count text, for example "4 of 7 have an image". */
  count?: ReactNode;
  /** Trailing slot for the page's one prominent action. */
  trailing?: ReactNode;
}

/** Search, segmented filter, count and the page's prominent action above a table. */
export function FilterBar({ search, filter, count, trailing }: FilterBarProps) {
  return (
    <div className="ds-filter-bar">
      {search && <div className="ds-filter-bar-search">{search}</div>}
      {filter}
      {count !== undefined && (
        <span className="ds-filter-bar-count" role="status">
          {count}
        </span>
      )}
      {trailing && <div className="ds-filter-bar-trailing">{trailing}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- DataTable */

export interface DataColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** Numbers and actions are right-aligned. */
  align?: "start" | "end";
  /** Hidden below 1024 px, where the table becomes a list of rows. */
  wideOnly?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  /** Accessible name of the table. */
  label: string;
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** The selected row gets aria-selected="true". */
  selectedKey?: string | null;
  onSelect?: (row: Row) => void;
  /** Per-row drop target; the row highlights only while a file is dragged over it. */
  onDropFile?: (row: Row, file: File) => void;
  /** Extra attributes per row (for example a data-* marker). */
  rowProps?: (row: Row) => Record<string, string | undefined>;
  footer?: ReactNode;
  /** Shown instead of the body when there are no rows. */
  empty?: ReactNode;
}

/** A dense table with a header row, selectable rows and optional row drop targets. */
export function DataTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  onDropFile,
  rowProps,
  footer,
  empty,
}: DataTableProps<Row>) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

  return (
    <div className="ds-data-table">
      <table aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-align={column.align}
                data-wide-only={column.wideOnly || undefined}
                className={column.className}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                {...rowProps?.(row)}
                aria-selected={onSelect ? selected : undefined}
                data-drag-over={dragOver === key || undefined}
                onClick={
                  onSelect
                    ? (event) => {
                        // Controls inside the row keep their own click.
                        if ((event.target as Element).closest("button, a, input, select, label"))
                          return;
                        onSelect(row);
                      }
                    : undefined
                }
                onDragOver={
                  onDropFile
                    ? (event) => {
                        if (!isFileDrag(event)) return;
                        event.preventDefault();
                        setDragOver(key);
                      }
                    : undefined
                }
                onDragLeave={onDropFile ? () => setDragOver(null) : undefined}
                onDrop={
                  onDropFile
                    ? (event) => {
                        event.preventDefault();
                        setDragOver(null);
                        const file = event.dataTransfer.files[0];
                        if (file) onDropFile(row, file);
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-align={column.align}
                    data-wide-only={column.wideOnly || undefined}
                    data-column={column.key}
                    className={column.className}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty}
      {footer && <div className="ds-data-table-foot">{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Canvas */

interface CanvasProps {
  /** Accessible name of the stage. */
  label: string;
  /** The artboard, centred on the dot grid. */
  children?: ReactNode;
  /** Absolutely positioned layer over the whole canvas (hints, drop highlight). */
  overlay?: ReactNode;
  className?: string;
  /** Extra attributes (data-testid, drop handlers) for the stage element. */
  stageProps?: Record<string, unknown>;
}

/** The dot-grid canvas with a centred artboard slot and an overlay slot. */
export function Canvas({ label, children, overlay, className, stageProps }: CanvasProps) {
  return (
    <section className={join("ds-canvas", className)} aria-label={label} {...stageProps}>
      <div className="ds-canvas-artboard">{children}</div>
      {overlay && <div className="ds-canvas-overlay">{overlay}</div>}
    </section>
  );
}

/* -------------------------------------------------------------------- Dock */

/** The titled area under the canvas (the TeamSpeak preview lives here). */
export function Dock({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="ds-dock" aria-labelledby={id}>
      <div className="ds-dock-head">
        <h2 className="ds-dock-title" id={id}>
          {title}
        </h2>
        {meta !== undefined && <span className="ds-dock-meta">{meta}</span>}
      </div>
      <div className="ds-dock-body">{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- StudioPage */

/** A padded page in the main region, for screens without a canvas. */
export function StudioPage({ children }: { children: ReactNode }) {
  return <div className="ds-studio-page">{children}</div>;
}
