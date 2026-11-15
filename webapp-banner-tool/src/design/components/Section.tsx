import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./Section.css";

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
export function Section({
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
    <section className={`ds-section${className ? ` ${className}` : ""}`}>
      <div className="ds-section-head">
        <div className="ds-section-head-text">
          <h2 className="ds-section-title">
            {step !== undefined && <span className="ds-section-step">{step}</span>}
            {icon && <Icon name={icon} size={17} />}
            {title}
          </h2>
          {subtitle && <p className="ds-section-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ds-section-actions">{actions}</div>}
      </div>
      <div className="ds-section-body">{children}</div>
      {footer && <div className="ds-section-footer">{footer}</div>}
    </section>
  );
}
