/**
 * `VillageRoom` Durable Object (IMPL-0008, apps/server): one instance per plaza room ("plaza-0" … "plaza-7"), holding
 * only ephemeral presence in memory (nothing is stored; D1 stays the only persistent store).
 *
 * WebSocket Hibernation API: the room broadcasts on a 10 Hz timer while anyone is connected and stops it
 * when the last visitor leaves, so an empty room hibernates and costs nothing. "ping" is answered by the
 * runtime without waking the object.
 */
import { DurableObject } from "cloudflare:workers";

import { CLOSE_ABUSE, CLOSE_FULL, encodeServer, TICK_MS } from "@vila/shared/net/protocol";
import type { Env } from "./env";
import { RoomState } from "./room";

interface Attachment {
  id: number;
  room: number;
}

export class VillageRoom extends DurableObject<Env> {
  private state = new RoomState();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // After a wake-up, rebuild the roster from the sockets that survived hibernation.
    const now = Date.now();
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) this.state.join(now, a.id);
    }
    if (this.state.size > 0) this.startTicking();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const room = Number(new URL(request.url).searchParams.get("i") ?? 0);
    const { 0: client, 1: server } = new WebSocketPair();
    const id = this.state.join(Date.now());
    if (id === null) {
      // Accept then close with a code the browser can read (an HTTP error hides the reason).
      server.accept();
      server.close(CLOSE_FULL, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, room } satisfies Attachment);
    server.send(encodeServer({ t: "w", id, room }));
    server.send(encodeServer({ t: "s", tick: Date.now(), poses: this.state.flush(Date.now(), true) }));
    for (const { id: who, look } of this.state.flushLooks(true)) server.send(encodeServer({ t: "k", id: who, look }));
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || typeof message !== "string") return;
    if (this.state.accept(a.id, message, Date.now()) === "abuse") ws.close(CLOSE_ABUSE, "rate");
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
    if (this.state.size === 0) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const now = Date.now();
    const poses = this.state.flush(now);
    if (poses.length) this.broadcast(encodeServer({ t: "s", tick: now, poses }));
    for (const { id, look } of this.state.flushLooks()) this.broadcast(encodeServer({ t: "k", id, look }));
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
