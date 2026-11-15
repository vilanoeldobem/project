/**
 * load-rooms.mjs — presence load test across rooms (IMPL-0008): full room and "next room" hand-off, several rooms at
 * once, a mass reconnect and a slow receiver. Bots walk in circles at 10 Hz, below the avatar's top speed, like the
 * game. Run against local `wrangler dev` only: bots in production would be visible to real people.
 *
 * Usage: node apps/server/scripts/load-rooms.mjs [ws://localhost:8788] [origin=http://localhost:8799]
 *
 * Scenarios:
 *   a  40 bots fill room 0; a 41st is closed with 4001 and moves on to room 1, as the protocol says
 *   b  rooms 2, 3 and 4 partly full (30, 12 and 5 bots)
 *   c  40 bots in room 0 drop and reconnect at the same instant
 *   d  39 bots walk in room 5 while a 40th connection reads nothing for 10 s
 *
 * Each scenario reports bots welcomed, closes by code, messages received per bot per second, and the largest gap
 * between two snapshots one bot received while everyone walked. Exits non-zero on a 1008 or 1011 close, or when a
 * room never answers (no welcome within 5 s).
 */
import { randomBytes } from "node:crypto";
import net from "node:net";

const [base = "ws://localhost:8788", origin = "http://localhost:8799"] = process.argv.slice(2);
if (/vilanoeldobem\.com\.br/.test(base)) {
  console.error("refusing to load-test production");
  process.exit(1);
}

const MAX_ROOMS = 8;
const CLOSE_FULL = 4001;
const UNEXPECTED = new Set([1008, 1011]);
const WELCOME_MS = 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

/** One visitor, built on Node's WebSocket. On 4001 it tries the next room, as the game does. */
class Bot {
  constructor(n, room) {
    this.n = n;
    this.closes = [];
    this.msgs = 0;
    this.lastSnap = 0;
    this.maxGap = 0;
    this.measuring = false;
    this.connect(room);
  }

  connect(room) {
    this.room = room;
    this.id = null;
    this.welcomed = false;
    this.asked = Date.now();
    const ws = (this.ws = new WebSocket(`${base}/room?i=${room}`, { headers: { Origin: origin } }));
    ws.onmessage = (e) => {
      if (typeof e.data !== "string" || ws !== this.ws) return;
      this.msgs++;
      if (e.data.startsWith('["w"')) {
        const [, id, r] = JSON.parse(e.data);
        this.id = id;
        this.room = r;
        this.welcomed = true;
      } else if (e.data.startsWith('["s"')) {
        const now = Date.now();
        if (this.measuring && this.lastSnap) this.maxGap = Math.max(this.maxGap, now - this.lastSnap);
        this.lastSnap = now;
      }
    };
    ws.onclose = (e) => {
      if (ws !== this.ws) return;
      this.closes.push(e.code);
      this.open = false;
      if (e.code === CLOSE_FULL && !this.leaving) this.connect((room + 1) % MAX_ROOMS);
    };
    ws.onopen = () => (this.open = true);
  }

  measure(on) {
    this.measuring = on;
    this.lastSnap = 0;
    if (on) (this.msgs = 0), (this.maxGap = 0);
  }

  move(t) {
    if (!this.welcomed || this.ws.readyState !== WebSocket.OPEN) return;
    const a = (this.n / 40) * Math.PI * 2 + t * 0.4;
    const r = 6 + (this.n % 5) * 3; // up to 18 u at 0.4 rad/s = 7.2 u/s, under the top speed of 8.5
    this.ws.send(JSON.stringify(["p", +(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2), +(a + Math.PI / 2).toFixed(2), 4]));
  }

  close() {
    this.leaving = true;
    try {
      this.ws.close(1000);
    } catch {
      /* already closed */
    }
  }
}

/**
 * A connection that stops reading: raw TCP, so the socket can really be paused (Node's WebSocket always reads).
 * Frames are parsed only after it resumes.
 */
class SlowReader {
  constructor(room) {
    const u = new URL(base);
    this.buf = Buffer.alloc(0);
    this.handshook = false;
    this.texts = 0;
    this.closeCode = null;
    this.bytes = 0;
    this.sock = net.connect(Number(u.port || 80), u.hostname);
    this.sock.on("error", () => {});
    this.sock.on("close", () => (this.ended = true));
    this.sock.on("data", (d) => this.onData(d));
    const key = randomBytes(16).toString("base64");
    this.sock.write(
      `GET /room?i=${room} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`,
    );
  }

  onData(d) {
    this.bytes += d.length;
    this.buf = Buffer.concat([this.buf, d]);
    if (!this.handshook) {
      const end = this.buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      this.status = Number(this.buf.subarray(0, end).toString().split(" ")[1]);
      this.handshook = true;
      this.buf = this.buf.subarray(end + 4);
    }
    for (;;) {
      if (this.buf.length < 2) return;
      const op = this.buf[0] & 0x0f;
      let len = this.buf[1] & 0x7f, at = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        at = 10;
      }
      if (this.buf.length < at + len) return;
      const payload = this.buf.subarray(at, at + len);
      this.buf = this.buf.subarray(at + len);
      if (op === 1) {
        this.texts++;
        if (!this.welcomed && payload.toString().startsWith('["w"')) this.welcomed = true;
      } else if (op === 8) this.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
    }
  }

  pause() {
    this.sock.pause();
  }

  resume() {
    this.sock.resume();
  }

  close() {
    const mask = randomBytes(4);
    const body = Buffer.from([0x03, 0xe8]).map((b, i) => b ^ mask[i]);
    try {
      this.sock.write(Buffer.concat([Buffer.from([0x88, 0x82]), mask, body]));
    } catch {
      /* gone */
    }
    setTimeout(() => this.sock.destroy(), 200);
  }
}

const results = [];
let failed = false;

/** Walks `bots` for `ms`, measuring messages and snapshot gaps; returns the window in seconds. */
async function walk(bots, ms) {
  const t0 = Date.now();
  bots.forEach((b) => b.measure(true));
  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    for (const b of bots) b.move(t);
  }, 100);
  await sleep(ms);
  clearInterval(timer);
  bots.forEach((b) => b.measure(false));
  return (Date.now() - t0) / 1000;
}

function report(name, bots, secs, extra = {}) {
  const closes = {};
  for (const b of bots) for (const c of b.closes) closes[c] = (closes[c] ?? 0) + 1;
  const silent = bots.filter((b) => !b.welcomed).length;
  const unexpected = Object.keys(closes).filter((c) => UNEXPECTED.has(Number(c)));
  const rate = bots.filter((b) => b.welcomed).map((b) => b.msgs / secs);
  const rooms = {};
  for (const b of bots) if (b.welcomed) rooms[b.room] = (rooms[b.room] ?? 0) + 1;
  const r = {
    scenario: name,
    bots: bots.length,
    connected: bots.filter((b) => b.welcomed).length,
    rooms,
    closesByCode: closes,
    msgsPerBotPerSec: { avg: +(rate.reduce((a, x) => a + x, 0) / Math.max(1, rate.length)).toFixed(1), min: +Math.min(...rate).toFixed(1) },
    maxSnapshotGapMs: Math.max(0, ...bots.map((b) => b.maxGap)),
    ...extra,
  };
  const problems = [];
  if (unexpected.length) problems.push(`unexpected close ${unexpected.join(", ")}`);
  if (silent) problems.push(`${silent} bot(s) never welcomed`);
  if (problems.length) {
    r.fail = problems.join("; ");
    failed = true;
  }
  results.push(r);
  console.log(JSON.stringify(r));
}

async function settle(bots) {
  bots.forEach((b) => b.close());
  await waitFor(() => bots.every((b) => b.ws.readyState === WebSocket.CLOSED), 3000);
  await sleep(500);
}

async function welcomed(bots) {
  return waitFor(() => bots.every((b) => b.welcomed), WELCOME_MS);
}

// a — a full room turns the 41st away with 4001, and the 41st lands in room 1.
{
  const bots = Array.from({ length: 40 }, (_, n) => new Bot(n, 0));
  await welcomed(bots);
  const extra = new Bot(40, 0);
  bots.push(extra);
  await welcomed(bots);
  const secs = await walk(bots, 3000);
  const ok = extra.closes[0] === CLOSE_FULL && extra.room === 1 && extra.welcomed;
  report("a: room 0 full, 41st moves on", bots, secs, { fortyFirst: { closes: extra.closes, room: extra.room, ok } });
  if (!ok) failed = true;
  await settle(bots);
}

// b — three rooms partly full at once.
{
  const bots = [
    ...Array.from({ length: 30 }, (_, n) => new Bot(n, 2)),
    ...Array.from({ length: 12 }, (_, n) => new Bot(n, 3)),
    ...Array.from({ length: 5 }, (_, n) => new Bot(n, 4)),
  ];
  await welcomed(bots);
  const secs = await walk(bots, 5000);
  report("b: rooms 2/3/4 with 30/12/5", bots, secs);
  await settle(bots);
}

// c — 40 visitors drop and reconnect at the same instant (a deploy, a network blip).
{
  const first = Array.from({ length: 40 }, (_, n) => new Bot(n, 0));
  await welcomed(first);
  await walk(first, 1500);
  const t0 = Date.now();
  first.forEach((b) => b.close());
  const again = Array.from({ length: 40 }, (_, n) => new Bot(n, 0));
  await welcomed(again);
  const reconnectMs = Date.now() - t0;
  const secs = await walk(again, 3000);
  report("c: 40 reconnect at once", again, secs, { allWelcomedMs: reconnectMs });
  await settle([...first, ...again]);
}

// d — one connection reads nothing for 10 s while 39 others walk in its room.
{
  const slow = new SlowReader(5);
  await waitFor(() => slow.welcomed, WELCOME_MS);
  const bots = Array.from({ length: 39 }, (_, n) => new Bot(n, 5));
  await welcomed(bots);
  slow.pause();
  const before = slow.bytes;
  const secs = await walk(bots, 10_000);
  const paused = slow.bytes - before;
  slow.resume();
  await sleep(1500);
  const extra = {
    slowReader: {
      status: slow.status,
      welcomed: Boolean(slow.welcomed),
      bytesReadWhilePaused: paused,
      bytesAfterResume: slow.bytes - before - paused,
      messagesAfterResume: slow.texts,
      closedWith: slow.closeCode,
      stillOpen: !slow.ended && slow.closeCode === null,
    },
  };
  if (!slow.welcomed) failed = true;
  if (slow.closeCode !== null && UNEXPECTED.has(slow.closeCode)) failed = true;
  report("d: slow receiver in room 5", bots, secs, extra);
  slow.close();
  await settle(bots);
}

console.log(failed ? "FAIL" : "OK");
process.exit(failed ? 1 : 0);
