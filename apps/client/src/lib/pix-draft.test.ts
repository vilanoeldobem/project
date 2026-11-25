import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelDraft, discardUnsentDrafts, forgetDraft, interruptedDraft, newDraft, readDraft, resumeDraft, startDraft, type PixTarget } from "./pix-draft";

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const globalTarget: PixTarget = { kind: "global" };
const house: PixTarget = { kind: "ngo", ngoId: "ngo-a", lotId: "plaza-01" };
const prepare = (target: PixTarget = globalTarget) => newDraft(target, "Instituição escolhida", 1234)!;

describe("returning to a Pix proposal (#65)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("navigator", { locks: { request: (_key: string, cb: () => unknown) => Promise.resolve(cb()) } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("binds the original amount, beneficiary and lot only after a verified login link", async () => {
    const draft = prepare(house);
    expect(await resumeDraft("me", false)).toEqual({});
    expect(startDraft(draft.id, "me")).toBeNull();
    const { draft: review } = await resumeDraft("me", true);
    expect(review).toMatchObject({ id: draft.id, target: house, amount: 1234, owner: "me", started: false });
    expect(await resumeDraft("me", false)).toEqual({ draft: review });
    expect(await resumeDraft("other", true)).toEqual({});
    expect(startDraft(draft.id, "other")).toBeNull();
  });

  it("keeps the same idempotency key across two tabs, a lost response, closing the panel and reload", async () => {
    const draft = prepare(house);
    await resumeDraft("me", true);
    const first = startDraft(draft.id, "me");
    const second = startDraft(draft.id, "me");
    expect(second).toEqual(first);
    cancelDraft(draft.id);
    expect((await resumeDraft("me", false)).draft?.id).toBe(draft.id);
    expect(interruptedDraft("me", house, 1234)?.id).toBe(draft.id);
    expect(interruptedDraft("other", house, 1234)).toBeUndefined();
    expect(interruptedDraft("me", { kind: "ngo", ngoId: "substitute", lotId: house.lotId }, 1234)).toBeUndefined();
    expect(interruptedDraft("me", house, 200)).toBeUndefined();
    forgetDraft(draft.id);
    expect(startDraft(draft.id, "me")).toBeNull();
  });

  it("cancels before sending and clears an ambiguous pair instead of guessing which email was opened", async () => {
    const canceled = prepare();
    cancelDraft(canceled.id);
    expect(await resumeDraft("me", true)).toEqual({});
    const first = prepare();
    const second = prepare(house);
    expect(await resumeDraft("me", true)).toEqual({ ambiguous: true });
    expect(readDraft(first.id)).toBeNull();
    expect(readDraft(second.id)).toBeNull();
  });

  it("expires after thirty minutes and discards corrupt state", async () => {
    vi.useFakeTimers();
    const draft = prepare();
    vi.advanceTimersByTime(30 * 60_000);
    expect(readDraft(draft.id)).toBeNull();
    expect(await resumeDraft("me", true)).toEqual({});
    expect(localStorage.length).toBe(0);
    const corrupt = prepare();
    localStorage.setItem(localStorage.key(0)!, '{"amount":500}');
    expect(readDraft(corrupt.id)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("discards an unsent proposal if accounts or donations are turned off and preserves an uncertain POST", async () => {
    const sent = prepare();
    await resumeDraft("me", true);
    startDraft(sent.id, "me");
    const pending = prepare(house);
    expect(discardUnsentDrafts(null)).toBe(true);
    expect(readDraft(pending.id)).toBeNull();
    expect(discardUnsentDrafts()).toBe(false);
    expect(readDraft(sent.id)?.started).toBe(true);
  });

  it("leaves login available when storage or safe cross-tab binding is unavailable", async () => {
    const draft = prepare();
    vi.stubGlobal("navigator", {});
    expect(await resumeDraft("me", true)).toEqual({ unavailable: true });
    expect(readDraft(draft.id)).toBeNull();
    vi.stubGlobal("localStorage", undefined);
    expect(newDraft(globalTarget, "Nome", 200)).toBeNull();
    expect(await resumeDraft("me", true)).toEqual({});
  });
});
