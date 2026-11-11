import { useEffect, useRef, type ReactNode } from "react";

import { useVila } from "../game/store";

/** Flat, readable modal panel over the scene (doc 17: long text never lives in 3D). */
export function Panel({ title, kicker, children, wide }: { title: string; kicker?: string; children: ReactNode; wide?: boolean }) {
  const close = useVila((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
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
