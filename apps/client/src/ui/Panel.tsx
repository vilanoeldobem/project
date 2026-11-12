import { useEffect, useRef, type ReactNode } from "react";

import { useVila } from "../game/store";

/** Visible, enabled descendants that can take focus (W3C APG modal dialog pattern). */
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Flat, readable modal panel over the scene (doc 17: long text never lives in 3D). Follows the APG modal
 * dialog pattern: focus moves into the dialog, Tab cycles inside it, Escape closes and focus returns to
 * the element that opened it. A panel that swaps its content in place passes a `contentKey`: when it
 * changes and the focused control is gone, focus goes back to the dialog instead of falling to `<body>`.
 */
export function Panel({
  title,
  kicker,
  children,
  wide,
  contentKey,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
  contentKey?: string;
}) {
  const close = useVila((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = ref.current;
      const focusable = [...(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = Boolean(dialog?.contains(active));
      if (e.shiftKey && (active === first || active === dialog || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [close]);
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, [contentKey]);
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`panel${wide ? " panel--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="panel__head">
          <div>
            {kicker && <p className="kicker">{kicker}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="panel__body">{children}</div>
      </div>
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}
