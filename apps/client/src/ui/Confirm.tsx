import { type RefObject, useEffect, useRef, type ReactNode } from "react";

import { confirmAllowed, registerConfirmation } from "../lib/confirm";

/**
 * When a step closes, the button that had the focus goes with it: focus moves to `ref` (a heading or a section
 * with `tabIndex={-1}`) instead of falling to `<body>`. `key` changes whenever the controls on screen change.
 */
export function useFocusReturn(ref: RefObject<HTMLElement | null>, key: string) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && document.activeElement === document.body) ref.current?.focus();
    mounted.current = true;
  }, [key, ref]);
}

/**
 * The explicit confirmation step of a moderation action (IMPL-0021). `title` is the question and names what is
 * acted on. The step cannot be answered by the gesture that opened it: focus goes to the question, never to
 * the confirm button; the second click of a double click, a key held down and anything in the first instants
 * after it appeared (`shownAt`, see `confirmAllowed`) are ignored. Cancel is always the first button, and Escape
 * is that button (IMPL-0022): it cancels the question and leaves the panel under it open; while the action is
 * being sent ("Cancelar" disabled) Escape does nothing.
 */
export function Confirm({
  title,
  children,
  confirmLabel,
  busyLabel = "Aguarde…",
  busy = false,
  blocked = false,
  shownAt,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  /** The confirm button is disabled until something else on the step is filled in. */
  blocked?: boolean;
  shownAt: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // A step asked again (the application changed) is a new question: `shownAt` moves and focus returns to it.
  useEffect(() => ref.current?.focus(), [shownAt]);
  const step = useRef({ busy, onCancel });
  useEffect(() => void (step.current = { busy, onCancel }));
  useEffect(() => registerConfirmation(step), []);
  return (
    <div className="confirm" role="group" aria-label={title} tabIndex={-1} ref={ref} data-confirm>
      <p className="confirm__title">
        <strong>{title}</strong>
      </p>
      {children}
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || blocked}
          // Enter held down repeats `keydown`, and each one would click: only the first press counts.
          onKeyDown={(e) => e.repeat && e.preventDefault()}
          onClick={(e) => confirmAllowed({ detail: e.detail }, shownAt, Date.now()) && onConfirm()}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
