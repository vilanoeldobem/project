/**
 * The board sheet pieces (P01–P15): numbered sections, step rows, pill tabs, notices, a progress bar and the
 * closing flow strip. Presentation only: every screen keeps its own data and behaviour. Numbers, icons and the
 * decorative flow are `aria-hidden`/text so a reader hears the words, never the ornament.
 */
import type { ReactNode } from "react";

/** The state class of a step: current, already done, or neither. */
const stepClassName = (index: number, current?: number): string | undefined =>
  index === current ? "is-on" : index < (current ?? -1) ? "is-done" : undefined;

export function SheetSection({
  n,
  icon,
  title,
  aside,
  children,
}: {
  n?: number;
  icon?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sheet-section">
      <h3 className="sheet-section__title">
        {n !== undefined && (
          <span className="sheet-n" aria-hidden="true">
            {n}
          </span>
        )}
        {icon && (
          <span className="sheet-ico" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="sheet-section__label">{title}</span>
        {aside && <span className="sheet-section__aside">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

export function SheetSteps({ steps, current, label }: { steps: readonly string[]; current?: number; label: string }) {
  return (
    <ol className="sheet-steps" aria-label={label}>
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? "step" : undefined}
          className={stepClassName(i, current)}
        >
          <span className="sheet-n" aria-hidden="true">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function SheetTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="sheet-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === value}
          className={`sheet-tab${tab === value ? " is-on" : ""}`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function SheetNotice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "pending" | "done";
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className={`sheet-notice sheet-notice--${tone}`}>
      {icon && (
        <span aria-hidden="true" className="sheet-notice__ico">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}

export function SheetProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const safeMax = Math.max(1, max);
  const clamped = Math.min(Math.max(0, value), safeMax);
  return (
    <span
      className="sheet-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
    >
      <span style={{ width: `${(clamped / safeMax) * 100}%` }} />
    </span>
  );
}

export function SheetFlow({ steps, current }: { steps: readonly string[]; current?: number }) {
  return (
    <ol className="sheet-flow">
      {steps.map((step, i) => (
        <li key={step} className={stepClassName(i, current)}>
          {step}
        </li>
      ))}
    </ol>
  );
}
