import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./PageHeader.css";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  icon?: IconName;
  lead?: ReactNode;
  actions?: ReactNode;
}

// Every page opens the same way: where you are (eyebrow), what this page is
// (h1, Large Title), what it does (lead), and the page-level actions.
export function PageHeader({ title, eyebrow, icon, lead, actions }: PageHeaderProps) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header-text">
        {eyebrow && (
          <p className="ds-page-eyebrow">
            {icon && <Icon name={icon} size={14} />}
            {eyebrow}
          </p>
        )}
        <h1 className="ds-page-title">{title}</h1>
        {lead && <p className="ds-page-lead">{lead}</p>}
      </div>
      {actions && <div className="ds-page-actions">{actions}</div>}
    </header>
  );
}
