/**
 * `VillageRoom` Durable Object (IMPL-0008, apps/server): one instance per plaza room ("plaza-0" … "plaza-7"), holding
 * only ephemeral presence in memory (nothing is stored; D1 stays the only persistent store).
 *
 * WebSocket Hibernation API: the room broadcasts on a 10 Hz timer while anyone is connected and stops it
 * when the last visitor leaves, so an empty room hibernates and costs nothing. "ping" is answered by the
 * runtime without waking the object.
 *
 * Idle timeout (IMPL-0014): the same timer closes connections with no real activity for the idle limit
 * (`IDLE_TIMEOUT_SECONDS`), so a forgotten tab cannot keep the timer, and the billed duration, running. No
 * alarm is used: an alarm is a storage write. The activity time lives in memory, with a coarse copy in the
 * socket attachment (kept by the runtime with the connection, not in the object's storage) so it survives
 * an eviction of the object.
 */
import { DurableObject } from "cloudflare:workers";

import { CLOSE_ABUSE, CLOSE_FULL, CLOSE_IDLE, encodeServer, TICK_MS } from "@vila/shared/net/protocol";
import { type Env, idleTimeoutMs } from "./env";
import { RoomState } from "./room";

interface Attachment {
  id: number;
  room: number;
  /** Last real activity, refreshed at most every `STAMP_MS` (absent on sockets accepted by an older deploy). */
  seen?: number;
}

/** How stale the attachment's copy of the activity time may get; it is only read after a wake-up. */
const STAMP_MS = 30_000;

export class VillageRoom extends DurableObject<Env> {
  private state = new RoomState();
  private timer: ReturnType<typeof setInterval> | null = null;
  private idleMs: number;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.idleMs = idleTimeoutMs(env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // After a wake-up, rebuild the roster from the sockets that survived hibernation (the first tick then
    // closes the ones that had already been idle for too long).
    const now = Date.now();
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) this.state.join(now, a.id, a.seen ?? now);
    }
    if (this.state.size > 0) this.startTicking();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const room = Number(new URL(request.url).searchParams.get("i") ?? 0);
    const { 0: client, 1: server } = new WebSocketPair();
    const now = Date.now();
    const id = this.state.join(now);
    if (id === null) {
      // Accept then close with a code the browser can read (an HTTP error hides the reason).
      server.accept();
      server.close(CLOSE_FULL, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, room, seen: now } satisfies Attachment);
    server.send(encodeServer({ t: "w", id, room }));
    server.send(encodeServer({ t: "s", tick: now, poses: this.state.flush(now, true) }));
    for (const { id: who, look } of this.state.flushLooks(true)) server.send(encodeServer({ t: "k", id: who, look }));
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || typeof message !== "string") return;
    if (this.state.accept(a.id, message, Date.now()) === "abuse") {
      ws.close(CLOSE_ABUSE, "rate");
      return;
    }
    const seen = this.state.activeAt(a.id);
    if (seen !== undefined && seen - (a.seen ?? 0) >= STAMP_MS) ws.serializeAttachment({ ...a, seen } satisfies Attachment);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.drop(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    this.drop(ws);
  }

  private drop(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || !this.state.leave(a.id)) return;
    this.broadcast(encodeServer({ t: "l", id: a.id }), ws);
  }

  private startTicking() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    const now = Date.now();
    this.closeIdle(now);
    if (this.state.size === 0) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const poses = this.state.flush(now);
    if (poses.length) this.broadcast(encodeServer({ t: "s", tick: now, poses }));
    for (const { id, look } of this.state.flushLooks()) this.broadcast(encodeServer({ t: "k", id, look }));
  }

  /**
   * Closes whoever stayed idle for longer than the limit. They leave the roster right away (not when the
   * close handshake ends: a dead connection never answers and would keep the timer running), and the
   * others are told exactly as on any disconnect.
   */
  private closeIdle(now: number) {
    const idle = this.state.reapIdle(now, this.idleMs);
    if (idle.length === 0) return;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a || !idle.includes(a.id)) continue;
      try {
        ws.close(CLOSE_IDLE, "idle");
      } catch {
        /* already closing */
      }
    }
    for (const id of idle) this.broadcast(encodeServer({ t: "l", id }));
  }

  private broadcast(msg: string, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(msg);
      } catch {
        /* closing socket: its close handler cleans up */
      }
    }
  }
}
