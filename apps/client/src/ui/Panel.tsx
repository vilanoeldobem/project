import { useEffect, useRef, type ReactNode } from "react";

import { useVila } from "../game/store";
import { trapFocus } from "../lib/dialog-focus";
import { veilClick, veilPointerDown } from "../lib/veil";

/**
 * Flat, readable modal panel over the scene (doc 17: long text never lives in 3D). Follows the APG modal
 * dialog pattern (`lib/dialog-focus.ts`): focus moves into the dialog, Tab cycles inside it and focus returns
 * to the element that opened it. Escape is not handled here: one listener decides what a press closes
 * (`lib/escape.ts`: a confirmation first, then the panel, then the game menu). A panel that swaps its content
 * in place passes a `contentKey`: when it changes and the focused control is gone, focus goes back to the
 * dialog instead of falling to `<body>`. `mark` is a small image shown before the title (the logo of an NGO,
 * IMPL-0017). The game menu (IMPL-0022) is this same dialog with `variant="menu"` (smaller, lighter backdrop:
 * the village stays visible) and its own `onClose`. A press on the veil around the dialog closes it (`Veil`).
 */
export function Panel({
  title,
  kicker,
  mark,
  children,
  wide,
  contentKey,
  variant,
  onClose,
  icon,
  subtitle,
  sheet,
  footer,
  board,
}: {
  title: string;
  kicker?: string;
  mark?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  contentKey?: string;
  variant?: "menu";
  /** What the close button and a press on the veil do; by default they close the open panel. */
  onClose?: () => void;
  /** Symbol shown on a gold tile at the head (never with a `mark`). */
  icon?: string;
  /** One line under the title. */
  subtitle?: string;
  /** The board sheet: wider, tan rim, bottom-anchored on a phone. */
  sheet?: boolean;
  /** A strip under the body that does not scroll (a flow of steps, a closing note). */
  footer?: ReactNode;
  /** Board id of the design (P01…P15) for the browser checks; not drawn. */
  board?: string;
}) {
  const closePanel = useVila((s) => s.close);
  const close = onClose ?? closePanel;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? trapFocus(ref.current, document, window) : undefined), []);
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, [contentKey]);
  return (
    <Veil variant={variant} onClose={close}>
      <div
        className={`panel${wide ? " panel--wide" : ""}${sheet ? " panel--sheet" : ""}${variant ? ` panel--${variant}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        data-board={board}
      >
        <header className="panel__head">
          {mark ?? (icon ? <span className="panel__icon" aria-hidden="true">{icon}</span> : null)}
          <div>
            {kicker && <p className="kicker">{kicker}</p>}
            <h2>{title}</h2>
            {subtitle && <p className="panel__sub">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={close} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="panel__body">{children}</div>
        {footer && <div className="panel__foot">{footer}</div>}
      </div>
    </Veil>
  );
}

/**
 * The veil around a dialog. A press on it closes the dialog on the `click`, and only when the press also
 * started on the veil (`lib/veil.ts`): nothing of a tap is left for the HUD button under it. No hooks, so the
 * test reaches its handlers through the element it returns.
 */
export function Veil({ variant, onClose, children }: { variant?: "menu"; onClose: () => void; children?: ReactNode }) {
  return (
    <div className={`backdrop${variant ? ` backdrop--${variant}` : ""}`} onPointerDown={veilPointerDown} onClick={(e) => veilClick(e, onClose)}>
      {children}
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}
