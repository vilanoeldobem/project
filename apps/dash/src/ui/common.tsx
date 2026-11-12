/** Small building blocks shared by the dashboard screens: flat, readable HTML (labels, live regions, no modals). */
import type { ReactNode } from "react";

export function PageHead({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className="page-head">
      <h1 tabIndex={-1}>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`field${error ? " field--error" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/** Status pill. `code` is the stable English state, exposed as `data-status` (used by the browser checks). */
export function Status({ code, children }: { code?: string; children: ReactNode }) {
  return (
    <span className="status" data-status={code}>
      {children}
    </span>
  );
}

/**
 * A boxed message. `state` names what it stands for (`accounts-off`, `pending`, `empty`, `unavailable`) so the
 * browser checks can tell an honest empty state from a broken screen.
 */
export function Notice({ state, title, tone = "info", children }: { state: string; title: string; tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} data-state={state}>
      <strong className="notice__title">{title}</strong>
      <div className="notice__body">{children}</div>
    </div>
  );
}

/** What a section that needs an admin session shows while accounts are turned off in the API. */
export function AccountsOff({ what }: { what: string }) {
  return (
    <Notice state="accounts-off" title="Contas desligadas" tone="warn">
      <p>
        As contas estão desligadas nesta API (<code>ACCOUNTS_ENABLED</code>), então ninguém consegue entrar e {what}. Nada aqui é dado de
        exemplo: a área aparece quando as contas forem ligadas.
      </p>
    </Notice>
  );
}

/** Async region: announces loading, errors and results to assistive technology without stealing focus. */
export function Live({ loading, error, onRetry, children }: { loading: boolean; error: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div aria-live="polite" aria-busy={loading}>
      {error ? (
        <div className="error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button className="btn btn--small" onClick={onRetry}>
              Tentar de novo
            </button>
          )}
        </div>
      ) : (
        children
      )}
      {loading && !error && <p className="muted">Carregando…</p>}
    </div>
  );
}

/**
 * Table that turns into stacked cards on narrow screens (each cell carries its column name in `data-label`).
 * `caption` is read by screen readers and shown above the table.
 */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<{ key: string; cells: ReactNode[] }> }) {
  return (
    // Explicit roles: the narrow layout sets `display: block`, which makes some browsers drop table semantics.
    <table className="table" role="table">
      <caption>{caption}</caption>
      <thead role="rowgroup">
        <tr role="row">
          {columns.map((c) => (
            <th key={c} scope="col" role="columnheader">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((r) => (
          <tr key={r.key} role="row">
            {r.cells.map((cell, i) => (
              <td key={columns[i]} role="cell" data-label={columns[i]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
