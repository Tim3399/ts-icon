import type { ReactNode } from "react";
import "./PageHeader.css";

interface PageHeaderProps {
  title: string;
  /** One sentence in secondary label colour. */
  subtitle?: string;
  /** Trailing slot for page-level actions: ToolbarButtons in a Toolbar. */
  toolbar?: ReactNode;
}

// Every page opens the same way: the Large Title (h1), an optional one-line
// subtitle and the page-level toolbar actions at the trailing edge.
export function PageHeader({ title, subtitle, toolbar }: PageHeaderProps) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header-text">
        <h1 className="ds-page-title">{title}</h1>
        {subtitle && <p className="ds-page-subtitle">{subtitle}</p>}
      </div>
      {toolbar && <div className="ds-page-toolbar">{toolbar}</div>}
    </header>
  );
}
