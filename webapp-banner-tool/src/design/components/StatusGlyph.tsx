import { Icon } from "../primitives/Icon";
import "./StatusGlyph.css";

/**
 * Status in a list: a glyph of at most 16 px in the status colour next to a
 * text label in secondary label colour. Never a chip or a pill background
 * (colour budget, T-142-F1 item 3).
 */
export function StatusGlyph({ tone, label }: { tone: "positive" | "warning"; label: string }) {
  return (
    <span className="ds-status" data-tone={tone}>
      <Icon name={tone === "positive" ? "check" : "alert"} size={14} className="ds-status-glyph" />
      <span>{label}</span>
    </span>
  );
}
