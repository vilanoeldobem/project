/**
 * load.mjs — presence load test (IMPL-0008): N bot visitors walk in circles in one room, sending poses at
 * 10 Hz, and report what each receives (messages/s, bytes/s, tick-to-receive latency) and connection
 * failures. Run against local `wrangler dev` only: bots in production would be visible to real people.
 *
 * Usage: node scripts/load.mjs [ws://localhost:8788] [bots=40] [seconds=20] [origin=http://localhost:8799]
 */
const [base = "ws://localhost:8788", n = "40", secs = "20", origin = "http://localhost:8799"] = process.argv.slice(2);
const BOTS = Number(n), SECONDS = Number(secs);
if (/vilanoeldobem\.com\.br/.test(base)) {
  console.error("refusing to load-test production");
  process.exit(1);
}

const stats = Array.from({ length: BOTS }, () => ({ msgs: 0, bytes: 0, lat: [], open: false, closed: null, poses: 0 }));
const sockets = [];
const t0 = Date.now();
for (let i = 0; i < BOTS; i++) {
  const s = stats[i];
  const ws = new WebSocket(`${base}/room?i=0`, { headers: { Origin: origin } });
  sockets.push(ws);
  ws.onopen = () => (s.open = true);
  ws.onclose = (e) => (s.closed = e.code);
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    s.msgs++;
    s.bytes += e.data.length;
    if (e.data.startsWith('["s"')) {
      const m = JSON.parse(e.data);
      s.lat.push(Date.now() - m[1]);
      s.poses += m[2].length;
    }
  };
}
await new Promise((r) => setTimeout(r, 1500));
const phase = Array.from({ length: BOTS }, (_, i) => (i / BOTS) * Math.PI * 2);
const timer = setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  sockets.forEach((ws, i) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const a = phase[i] + t * 0.4;
    const r = 6 + (i % 5) * 3;
    ws.send(JSON.stringify(["p", +(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2), +(a + Math.PI / 2).toFixed(2), 4]));
  });
}, 100);
const start = Date.now();
stats.forEach((s) => ((s.msgs = 0), (s.bytes = 0), (s.lat = []), (s.poses = 0)));
await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(timer);
const elapsed = (Date.now() - start) / 1000;
sockets.forEach((ws) => ws.close(1000));
await new Promise((r) => setTimeout(r, 500));

const lat = stats.flatMap((s) => s.lat).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? null;
// "Full" rooms accept then close with 4001 (so the browser can read why): count those as rejected.
const full = stats.filter((s) => s.closed === 4001).length;
const open = stats.filter((s) => s.open && s.closed !== 4001).length;
const perBot = stats.map((s) => s.msgs / elapsed);
const result = {
  bots: BOTS,
  connected: open,
  rejectedFull: full,
  failed: stats.filter((s) => !s.open).length,
  seconds: +elapsed.toFixed(1),
  msgsPerBotPerSec: +(perBot.reduce((a, b) => a + b, 0) / Math.max(1, open)).toFixed(1),
  kBPerBotPerSec: +(stats.reduce((a, s) => a + s.bytes, 0) / Math.max(1, open) / elapsed / 1024).toFixed(2),
  posesPerSnapshot: +(stats.reduce((a, s) => a + s.poses, 0) / Math.max(1, stats.reduce((a, s) => a + s.lat.length, 0))).toFixed(1),
  latencyMs: { p50: pct(0.5), p95: pct(0.95), max: lat.at(-1) ?? null },
};
console.log(JSON.stringify(result, null, 2));
// Expected: everyone up to capacity connects, the rest are turned away as "full", nothing else fails.
process.exit(open + full === BOTS && stats.every((s) => s.open) ? 0 : 1);
