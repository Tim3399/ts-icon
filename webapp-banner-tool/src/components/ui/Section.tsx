import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface SectionProps {
  title: string;
  /** Renders a numbered chip before the title, for ordered workflows. */
  step?: number;
  icon?: IconName;
  subtitle?: ReactNode;
  /** Controls or status shown at the trailing edge of the section header. */
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

// The card shell every page section shares: consistent heading level, spacing
// and header/footer structure, so pages describe *what* is in a section
// instead of restating how a section looks.
export default function Section({
  title,
  step,
  icon,
  subtitle,
  actions,
  footer,
  className,
  children,
}: SectionProps) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      <div className="card-head">
        <div className="card-head-text">
          <h2 className="card-title">
            {step !== undefined && <span className="card-step">{step}</span>}
            {icon && <Icon name={icon} size={16} />}
            {title}
          </h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="actions-row">{actions}</div>}
      </div>
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}
