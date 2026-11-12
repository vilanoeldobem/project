/**
 * The room's one call to the API (PROPOSTA, IMPL-0021): what it sends through the service binding and that
 * anything short of an explicit yes is a no. Run in Node with a fake binding and fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODERATION_TICKET, MODERATION_TICKET_TTL_MS } from "@vila/shared/accounts/moderation";
import { isModerationTicket } from "@vila/shared/net/protocol";

import { devVar, wranglerConfig } from "../test/config.mjs";
import { presenceModerationEnabled } from "./env";
import { CONSUME_TIMEOUT_MS, CONSUME_URL, consumeTicket, REMOVAL_WARMUP_MS } from "./moderation";

const TICKET = "Ab3_-zZ09Ab3_-zZ09Ab3_-zZ09Ab3_-";
const REQUEST = { ticket: TICKET, room: 3, target: 7 };

interface Call {
  url: string;
  init: RequestInit;
}

/** A stand-in for the `API` binding that records every call and answers with `respond`. */
function binding(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const api = {
    fetch: async (url: string, init: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    },
  };
  return { api: api as unknown as Fetcher, calls };
}

const answer = (status: number, body: string) => new Response(body, { status, headers: { "Content-Type": "application/json" } });
const yes = () => answer(200, '{"ok":true}');

describe("consumeTicket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("posts exactly the ticket, the room and the target to the API route, as JSON", async () => {
    const { api, calls } = binding(yes);
    expect(await consumeTicket(api, REQUEST)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.internal/moderation/consume");
    expect(CONSUME_URL).toBe("https://api.internal/moderation/consume");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({ "Content-Type": "application/json" });
    expect(calls[0].init.body).toBe(JSON.stringify({ ticket: TICKET, room: 3, target: 7 }));
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(0); // the timeout is cleared once the API answered
  });

  it("takes only a 200 whose body is exactly { ok: true } as a yes", async () => {
    const no: Array<[number, string]> = [
      [404, '{"error":"not_found"}'],
      [409, '{"error":"bad_transition"}'],
      [429, '{"error":"rate_limited"}'],
      [500, '{"error":"internal"}'],
      [503, "Service Unavailable"],
      // A yes-looking body under any other status is not a yes.
      [201, '{"ok":true}'],
      [202, '{"ok":true}'],
      [404, '{"ok":true}'],
      [500, '{"ok":true}'],
      // A 200 that does not say exactly { ok: true } is not a yes.
      [200, '{"ok":false}'],
      [200, '{"ok":"true"}'],
      [200, '{"ok":1}'],
      [200, '{"ok":true,"error":"not_found"}'],
      [200, '{"ok":true,"extra":null}'],
      [200, '{"OK":true}'],
      [200, "{}"],
      [200, "[true]"],
      [200, '[{"ok":true}]'],
      [200, "true"],
      [200, "null"],
      [200, '"ok"'],
      [200, ""],
      [200, "ok"],
      [200, '{"ok":true'],
      [200, "<html>ok</html>"],
    ];
    for (const [status, body] of no) {
      const { api, calls } = binding(() => answer(status, body));
      expect(await consumeTicket(api, REQUEST), `${status} ${body}`).toBe(false);
      expect(calls).toHaveLength(1);
    }
    expect(await consumeTicket(binding(() => answer(200, ' { "ok" : true } ')).api, REQUEST)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a no when the call throws or rejects", async () => {
    const boom = () => {
      throw new Error("boom");
    };
    const throwing = { fetch: boom } as unknown as Fetcher;
    expect(await consumeTicket(throwing, REQUEST)).toBe(false);
    const rejecting = binding(() => Promise.reject(new TypeError("network")));
    expect(await consumeTicket(rejecting.api, REQUEST)).toBe(false);
    const broken = binding(() => ({ status: 200, json: () => Promise.reject(new Error("stream")) }) as unknown as Response);
    expect(await consumeTicket(broken.api, REQUEST)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a no, without calling anything, when the binding is missing", async () => {
    expect(await consumeTicket(undefined, REQUEST)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never sends a request whose parts have the wrong shape", async () => {
    const { api, calls } = binding(yes);
    for (const bad of [
      { ...REQUEST, ticket: TICKET.slice(1) },
      { ...REQUEST, ticket: `${TICKET.slice(1)}"` },
      { ...REQUEST, target: 0 },
      { ...REQUEST, target: 1.5 },
      { ...REQUEST, room: -1 },
      { ...REQUEST, room: 8 },
      { ...REQUEST, room: 0.5 },
      { ...REQUEST, room: NaN },
    ])
      expect(await consumeTicket(api, bad)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("gives up after 3 seconds, aborts the call and ignores a late yes", async () => {
    expect(CONSUME_TIMEOUT_MS).toBe(3000);
    let release!: (r: Response) => void;
    const { api, calls } = binding(() => new Promise<Response>((resolve) => (release = resolve))); // ignores the abort signal
    let settled: boolean | undefined;
    const pending = consumeTicket(api, REQUEST).then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(CONSUME_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    expect((calls[0].init.signal as AbortSignal).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    expect((calls[0].init.signal as AbortSignal).aborted).toBe(true);
    release(yes());
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a no when a slow callee honours the abort", async () => {
    const { api } = binding(
      ({ init }) => new Promise<Response>((_, reject) => (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const pending = consumeTicket(api, REQUEST);
    await vi.advanceTimersByTimeAsync(CONSUME_TIMEOUT_MS);
    expect(await pending).toBe(false);
  });

  it("is a no when the answer arrives in time but its body does not", async () => {
    const { api } = binding(() => ({ status: 200, json: () => new Promise(() => {}) }) as unknown as Response);
    const pending = consumeTicket(api, REQUEST);
    await vi.advanceTimersByTimeAsync(CONSUME_TIMEOUT_MS);
    expect(await pending).toBe(false);
  });

  it("writes nothing to the log, whatever the outcome", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    await consumeTicket(binding(yes).api, REQUEST);
    await consumeTicket(binding(() => answer(404, '{"error":"not_found"}')).api, REQUEST);
    await consumeTicket(binding(() => Promise.reject(new Error(TICKET))).api, REQUEST);
    await consumeTicket(undefined, REQUEST);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("presence moderation configuration (PROPOSTA, IMPL-0021)", () => {
  it("turns on only with the exact text \"true\"", () => {
    expect(presenceModerationEnabled({ PRESENCE_MODERATION_ENABLED: "true" })).toBe(true);
    for (const off of [undefined, "", "false", "TRUE", "True", " true", "1", "yes", "on"]) expect(presenceModerationEnabled({ PRESENCE_MODERATION_ENABLED: off })).toBe(false);
    expect(presenceModerationEnabled({ PRESENCE_MODERATION_ENABLED: true as unknown as string })).toBe(false);
  });

  it("is off in production and on in the local dev script", () => {
    const config = wranglerConfig();
    expect(config.vars.PRESENCE_MODERATION_ENABLED).toBe("false");
    expect(devVar("PRESENCE_MODERATION_ENABLED")).toBe("true");
    expect(config.env).toBeUndefined(); // no staging environment for this Worker: nothing else to keep off
  });

  it("reaches the API only through the service binding named API", () => {
    expect(wranglerConfig().services).toEqual([{ binding: "API", service: "vilanoeldobem-api" }]);
  });

  it("waits out more than one ticket lifetime (30 s) after a room starts", () => {
    expect(REMOVAL_WARMUP_MS).toBe(35_000);
    expect(REMOVAL_WARMUP_MS).toBeGreaterThan(30_000);
  });
});

describe("the two halves of the removal agree (API ticket, room protocol)", () => {
  it("keeps the room's warm-up above the lifetime of a ticket issued by the API", () => {
    expect(REMOVAL_WARMUP_MS).toBeGreaterThan(MODERATION_TICKET_TTL_MS);
  });

  it("accepts in the room exactly the ticket shape the API issues", () => {
    for (const ticket of [TICKET, "a".repeat(32), "-_".repeat(16)]) {
      expect(MODERATION_TICKET.test(ticket)).toBe(true);
      expect(isModerationTicket(ticket)).toBe(true);
    }
    for (const ticket of ["a".repeat(31), "a".repeat(33), "a".repeat(31) + "!", ""]) {
      expect(MODERATION_TICKET.test(ticket)).toBe(false);
      expect(isModerationTicket(ticket)).toBe(false);
    }
  });
});
