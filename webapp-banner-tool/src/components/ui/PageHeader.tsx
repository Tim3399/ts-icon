import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  icon?: IconName;
  lead?: ReactNode;
  actions?: ReactNode;
}

// Every page opens the same way: where you are (eyebrow), what this page is
// (h1), what it does (lead), and the page-level actions. Uniform enough that
// switching pages never costs the reader a re-orientation.
export default function PageHeader({ title, eyebrow, icon, lead, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && (
          <p className="page-eyebrow">
            {icon && <Icon name={icon} size={13} />}
            {eyebrow}
          </p>
        )}
        <h1 className="page-title">{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {actions && <div className="actions-row">{actions}</div>}
    </header>
  );
}
