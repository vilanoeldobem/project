/** Small building blocks shared by the dashboard screens: flat, readable HTML (labels, live regions, no modals). */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

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

/**
 * Async region: announces loading, errors and results to assistive technology without stealing focus. What was
 * already loaded stays on screen when a later request fails (the error goes below it, with a way to retry).
 */
export function Live({ loading, error, onRetry, children }: { loading: boolean; error: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div aria-live="polite" aria-busy={loading}>
      {children}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button className="btn btn--small" onClick={onRetry}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
      {loading && !error && <p className="muted">Carregando…</p>}
    </div>
  );
}

/**
 * Table that turns into stacked cards on narrow screens (each cell carries its column name in `data-label`).
 * `caption` is read by screen readers and shown above the table. A row may carry `detail`: a full-width row
 * right below it (a confirmation, the result of an action), so what is asked stays next to what it is about.
 */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<{ key: string; cells: ReactNode[]; detail?: ReactNode }> }) {
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
        {rows.flatMap((r) => [
          <tr key={r.key} role="row" data-row={r.key}>
            {r.cells.map((cell, i) => (
              <td key={columns[i]} role="cell" data-label={columns[i]}>
                {cell}
              </td>
            ))}
          </tr>,
          r.detail ? (
            <tr key={`${r.key}-detail`} role="row" className="table__detail">
              <td role="cell" colSpan={columns.length}>
                {r.detail}
              </td>
            </tr>
          ) : null,
        ])}
      </tbody>
    </table>
  );
}

/**
 * The second step of an action that changes something for someone else: a panel that names who or what it is
 * about, says what will happen, and only then offers the button. No modal: it opens in the page, next to what
 * was clicked, and takes the focus on its heading so it is announced.
 *
 * It cannot be gone through by accident. The button stays disabled until the sentence in `understood` is ticked,
 * which neither a double click on the first button nor Enter held down can do; the tick is cleared each time the
 * button is used, so a refusal asks for it again; and `busy` disables both buttons while the request is out.
 */
export function Confirmation({
  kind,
  title,
  understood,
  confirm,
  busy,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  /** Stable English name of what is being confirmed, exposed as `data-confirm` (used by the browser checks). */
  kind: string;
  title: string;
  understood: string;
  /** The label of the button that goes ahead. */
  confirm: string;
  busy: boolean;
  /** pt-BR sentence of a refusal, empty when there is none. */
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** What will happen, and any field the action needs. */
  children: ReactNode;
}) {
  const [ticked, setTicked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => heading.current?.focus(), []);
  const go = () => {
    if (!ticked || busy) return;
    setTicked(false);
    onConfirm();
  };
  return (
    <section className="confirm" data-confirm={kind} aria-labelledby={id}>
      <h3 id={id} tabIndex={-1} ref={heading}>
        {title}
      </h3>
      {children}
      <label className="check">
        <input type="checkbox" checked={ticked} disabled={busy} onChange={(e) => setTicked(e.target.checked)} />
        {understood}
      </label>
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={busy || !ticked} title={ticked || busy ? "" : "Confirme antes de continuar"} onClick={go}>
          {busy ? "Enviando…" : confirm}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
