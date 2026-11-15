import type { ReactNode } from "react";
import { Icon, type IconName } from "../primitives/Icon";
import "./Section.css";

interface SectionProps {
  title: string;
  /** @deprecated Renders the number as plain secondary text; stage B removes it. */
  step?: number;
  /** @deprecated Stage B removes it. */
  icon?: IconName;
  subtitle?: ReactNode;
  /** Controls or status shown at the trailing edge of the section header. */
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * @deprecated Content card with its own heading. Only stage-B screens still
 * use it until they move to ListSection; no stage-A screen may. It renders as
 * a quiet bordered box without a shadow.
 */
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
            {step !== undefined && <span className="ds-section-step">{step}.</span>}
            {icon && <Icon name={icon} size={16} />}
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
