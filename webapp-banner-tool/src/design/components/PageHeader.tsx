import type { ReactNode } from "react";
import type { IconName } from "../primitives/Icon";
import "./PageHeader.css";

interface PageHeaderProps {
  title: string;
  /** One sentence in secondary label colour. */
  subtitle?: string;
  /** Trailing slot for page-level actions: ToolbarButtons in a Toolbar. */
  toolbar?: ReactNode;
  /** @deprecated Renders nothing; stage B removes it. */
  eyebrow?: string;
  /** @deprecated Ignored; stage B removes it. */
  icon?: IconName;
  /** @deprecated Use `subtitle`; stage B removes it. */
  lead?: ReactNode;
  /** @deprecated Use `toolbar`; stage B removes it. */
  actions?: ReactNode;
}

// Every page opens the same way: the Large Title (h1), an optional one-line
// subtitle and the page-level toolbar actions at the trailing edge.
export function PageHeader({ title, subtitle, toolbar, lead, actions }: PageHeaderProps) {
  const sub = subtitle ?? lead;
  const trailing = toolbar ?? actions;
  return (
    <header className="ds-page-header">
      <div className="ds-page-header-text">
        <h1 className="ds-page-title">{title}</h1>
        {sub && <p className="ds-page-subtitle">{sub}</p>}
      </div>
      {trailing && <div className="ds-page-toolbar">{trailing}</div>}
    </header>
  );
}
