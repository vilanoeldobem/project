import { MAX_DONATION_CENTS, MIN_DONATION_CENTS } from "@vila/shared/donations/contract";

const PREFIX = "vila.pix.draft.v1:";
const LIFETIME_MS = 30 * 60 * 1000;

export type PixTarget = { kind: "global" } | { kind: "ngo"; ngoId: string; lotId: string };

export interface PixDraft {
  /** Generated once, before login. Every confirmation of this draft uses this same API idempotency key. */
  id: string;
  target: PixTarget;
  name: string;
  amount: number;
  expires: number;
  owner: string | null;
  started: boolean;
}

function save(draft: PixDraft): PixDraft | null {
  try {
    localStorage.setItem(PREFIX + draft.id, JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function forgetDraft(id: string) {
  try { localStorage.removeItem(PREFIX + id); } catch { /* Unavailable storage has no resumable draft. */ }
}

export function readDraft(id: string): PixDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(PREFIX + id) ?? "null");
    if (d?.id === id && typeof d.name === "string" && Number.isSafeInteger(d.amount)
      && d.amount >= MIN_DONATION_CENTS && d.amount <= MAX_DONATION_CENTS
      && Number.isSafeInteger(d.expires) && d.expires > Date.now() && typeof d.started === "boolean"
      && (typeof d.owner === "string" || (d.owner === null && !d.started))
      && (d.target?.kind === "global" || (d.target?.kind === "ngo" && typeof d.target.ngoId === "string" && typeof d.target.lotId === "string"))) return d;
  } catch { /* Stale, corrupt or unavailable storage. */ }
  forgetDraft(id);
  return null;
}

export function newDraft(target: PixTarget, name: string, amount: number) {
  return save({ id: crypto.randomUUID(), target, name, amount, expires: Date.now() + LIFETIME_MS, owner: null, started: false });
}

/** Closing an unpaid review cancels it. An uncertain POST keeps its key for this account on reload. */
export function cancelDraft(id: string) {
  if (!readDraft(id)?.started) forgetDraft(id);
}

function drafts(): PixDraft[] {
  try {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) ids.push(key.slice(PREFIX.length));
    }
    return ids.map(readDraft).filter((d): d is PixDraft => d !== null);
  } catch { return []; }
}

/** Signed-in visitors reopening the original panel can retry an interrupted confirmation with its original key. */
export function interruptedDraft(owner: string, target: PixTarget, amount: number) {
  return drafts().find(d => d.started && d.owner === owner && d.amount === amount && d.target.kind === target.kind
    && (target.kind === "global" || (d.target.kind === "ngo" && d.target.ngoId === target.ngoId && d.target.lotId === target.lotId)));
}

type ResumeResult = { draft?: PixDraft; ambiguous?: boolean; unavailable?: boolean };

/** A plain session reload may resume a bound review. Only a verified login link can claim a visitor's draft. */
export async function resumeDraft(owner: string, fromLink: boolean): Promise<ResumeResult> {
  function select(canClaim: boolean): ResumeResult {
    const candidates = drafts().filter(d => d.owner === owner || (fromLink && d.owner === null));
    if (candidates.length > 1) {
      for (const d of candidates) cancelDraft(d.id);
      return { ambiguous: true };
    }
    const draft = candidates[0];
    if (!draft) return {};
    if (draft.owner === owner) return { draft };
    if (!canClaim) {
      cancelDraft(draft.id);
      return { unavailable: true };
    }
    const bound = save({ ...draft, owner });
    return bound ? { draft: bound } : { unavailable: true };
  }
  // Two login links for different accounts can finish in different tabs at the same time.
  if (fromLink && typeof navigator !== "undefined" && navigator.locks) {
    try { return await navigator.locks.request(PREFIX, () => select(true)); }
    catch { return { unavailable: true }; }
  }
  return select(false);
}

export function discardUnsentDrafts(owner?: string | null) {
  const unsent = drafts().filter(draft => !draft.started && (owner === undefined || draft.owner === owner));
  for (const draft of unsent) forgetDraft(draft.id);
  return unsent.length > 0;
}

/** Re-read shared state on the confirmation gesture. A canceled, expired, finished or foreign draft cannot start. */
export function startDraft(id: string, owner: string) {
  const draft = readDraft(id);
  if (!draft || draft.owner !== owner) return null;
  return draft.started ? draft : save({ ...draft, started: true });
}
