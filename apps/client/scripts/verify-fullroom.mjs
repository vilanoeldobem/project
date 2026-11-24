/**
 * verify-fullroom.mjs — a full plaza room in a real Chrome (audit 2026-11-14, §3.2): 39 scripted visitors around the
 * spawn plus the page itself (ROOM_CAPACITY = 40), and the render budget (IMPL-0024: 150 draw calls, 250 000
 * triangles, shadow pass included) on the medium preset. Remote avatars are one mesh (`scene/remoteAvatars.ts`), so
 * the draw calls must not depend on how many distinct looks are in the room:
 * - 39 distinct looks, then the same room after half the visitors change look and five reconnect;
 * - 39 visitors wearing one look.
 * The scripted visitors speak the presence protocol directly (`["k", …]` look, `["p", …]` pose) with the game's
 * Origin; the looks are read from the catalogue in `packages/shared/src/game/cosmetics.ts` (free items only). Local only.
 *
 * Usage: node scripts/verify-fullroom.mjs [game url] [realtime url]
 *        (defaults http://localhost:8799 and ws://localhost:8788: `pnpm --filter @vila/server dev` and `dev:worker`)
 */
import { readFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { analyticsNoise, isolateAnalytics } from "./analytics.mjs";

const url = process.argv[2] ?? "http://localhost:8799";
const realtime = process.argv[3] ?? "ws://localhost:8788";
const BUDGET = { calls: 150, triangles: 250000 };
const REMOTES = 39;
const errors = [];
const stats = {};

// Wearable looks from the catalogue in `packages/shared/src/game/cosmetics.ts`, as the presence protocol sends them:
// one base36 catalogue index per slot, in `SLOTS` order (index 0 = the slot's default). Paid items are previews,
// never worn, and the room refuses them, so they are left out. Look `i` is `i` in mixed radix over the free items.
const catalogue = readFileSync(new URL("../../../packages/shared/src/game/cosmetics.ts", import.meta.url), "utf8");
const SLOTS = JSON.parse(/export const SLOTS: Slot\[\] = (\[[^\]]*\]);/.exec(catalogue)[1]);
const items = [...catalogue.matchAll(/\{ id: "([a-z0-9-]+)", slot: "([a-zA-Z]+)",[^\n]*?unlock: ([A-Za-z]+)/g)].map(([, id, slot, unlock]) => ({ id, slot, paid: unlock === "PAID" }));
const free = SLOTS.map((slot) => items.filter((c) => c.slot === slot).map((c, index) => ({ ...c, index })).filter((c) => !c.paid));
if (free.some((list) => list.length === 0)) throw new Error(`could not read the catalogue (parsed ${items.length} items over ${SLOTS.length} slots)`);
const lookCode = (i) => {
  let n = i;
  return free.map((list) => {
    const item = list[n % list.length];
    n = Math.floor(n / list.length);
    return item.index.toString(36);
  }).join("");
};
const looks = Array.from({ length: REMOTES }, (_, i) => lookCode(i));

/** One scripted visitor: joins room 0, wears `look`, stands (or paces) at its place on a ring around the spawn. */
function visitor(i, look) {
  const angle = (i / REMOTES) * Math.PI * 2;
  const ring = 3 + (i % 3);
  const v = { x: Math.cos(angle) * ring, z: Math.sin(angle) * ring + 18, look, ws: null, closed: null };
  v.connect = () =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${realtime}/room?i=0`, { headers: { Origin: new URL(url).origin } });
      v.ws = ws;
      ws.onopen = () => {
        v.wear(v.look);
        resolve();
      };
      ws.onclose = (e) => (v.closed = e.code);
      ws.onerror = () => resolve();
    });
  v.wear = (l) => {
    v.look = l;
    if (v.ws?.readyState === 1) v.ws.send(JSON.stringify(["k", l]));
  };
  v.step = (t) => {
    if (v.ws?.readyState !== 1) return;
    const pace = i % 2 ? Math.sin(t / 5) * 0.8 : 0;
    v.ws.send(JSON.stringify(["p", +(v.x + pace).toFixed(2), +v.z.toFixed(2), +(angle % 6).toFixed(2), i % 2 ? 2 : 0]));
  };
  return v;
}

async function room(lookOf) {
  const crowd = Array.from({ length: REMOTES }, (_, i) => visitor(i, lookOf(i)));
  for (const v of crowd) await v.connect();
  let t = 0;
  const timer = setInterval(() => crowd.forEach((v) => v.step(++t)), 200);
  return {
    crowd,
    async leave() {
      clearInterval(timer);
      crowd.forEach((v) => v.ws?.close());
      // The room forgets them before the next scenario joins.
      await new Promise((r) => setTimeout(r, 1500));
    },
  };
}

/** Largest calls/triangles of a few overlay readings, and the visitor count the HUD shows. */
async function measure(page, name) {
  let calls = 0, triangles = 0;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1500);
    const line = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? "";
    const m = /calls (\d+) · tris (\d+)/.exec(line);
    if (m) (calls = Math.max(calls, +m[1])), (triangles = Math.max(triangles, +m[2]));
  }
  const chip = await page.getByRole("status", { name: /conexões nesta praça/ }).textContent().catch(() => null);
  stats[name] = { calls, triangles, chip: chip?.trim() ?? null };
  if (calls === 0) errors.push(`${name}: the debug overlay shows no render counters`);
  if (calls > BUDGET.calls || triangles > BUDGET.triangles) errors.push(`${name}: ${calls} calls and ${triangles} triangles, over ${BUDGET.calls} and ${BUDGET.triangles}`);
  if (!chip?.includes(String(REMOTES + 1))) errors.push(`${name}: visitor chip shows "${chip}", not ${REMOTES + 1}`);
  return stats[name];
}

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !analyticsNoise(m.text()) && errors.push(`${name}: ${m.text()}`));
  await isolateAnalytics(page);
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "medium", multiplayer: true })));
  await page.goto(`${url}/?envTime=2026-12-20T15:30&envWeather=CLEAR_FROST&envDebug=1`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  return page;
}

// Distinct looks, then changes of look and reconnects in the same room.
{
  const crowd = await room((i) => looks[(i * 7) % looks.length]);
  const page = await open("distinct");
  const distinct = await measure(page, "39 distinct looks");
  crowd.crowd.forEach((v, i) => i % 2 && v.wear(lookCode(REMOTES + i)));
  for (const v of crowd.crowd.slice(0, 5)) {
    v.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    await v.connect();
  }
  const changed = await measure(page, "after look changes and reconnects");
  if (changed.calls !== distinct.calls) errors.push(`changes: ${distinct.calls} → ${changed.calls} calls; remote avatars should cost the same`);
  const refused = crowd.crowd.filter((v) => v.closed && v.closed !== 1000 && v.closed !== 1005);
  if (refused.length) errors.push(`changes: ${refused.length} visitor(s) closed by the room (${[...new Set(refused.map((v) => v.closed))]})`);
  await page.close();
  await crowd.leave();
}

// One look for everyone: the same number of draw calls as distinct looks.
{
  const crowd = await room(() => looks[0]);
  const page = await open("shared");
  const shared = await measure(page, "39 shared looks");
  if (shared.calls !== stats["39 distinct looks"].calls) errors.push(`shared: ${shared.calls} calls, distinct looks ${stats["39 distinct looks"].calls}; they should match`);
  await page.close();
  await crowd.leave();
}

await browser.close();
console.log(JSON.stringify(stats, null, 2));
if (errors.length) {
  console.error(`${errors.length} error(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("ok — a full room stays within the render budget, whatever the looks");
