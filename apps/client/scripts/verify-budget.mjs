/**
 * verify-budget.mjs — the render budget of `verify.mjs` on its own (IMPL-0024): 150 draw calls and 250 000
 * triangles a frame on the medium preset, at the spawn and on the streets with a house on every lot
 * (`?villageDemo=full`, local builds only). It reads the counters of the debug overlay, so it needs no API:
 * page errors from a missing local API are ignored here (`verify.mjs` still checks them).
 *
 * Usage: node apps/client/scripts/verify-budget.mjs [url=http://localhost:8799]
 */
import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

const url = process.argv[2] ?? "http://localhost:8799";
const BUDGET = { calls: 150, triangles: 250000 };
const CASES = [
  ["spawn, default zoom, noon, snow", "2026-12-20T12:00", "SNOW", 1],
  ["spawn, zoomed out, 06:20, clear", "2026-12-20T06:20", "CLEAR_FROST", 1.6],
  ["spawn, zoomed out, 06:20, clear, a house on every lot", "2026-12-20T06:20", "CLEAR_FROST", 1.6, null, true],
  ["second street, zoomed out, 06:20, clear, a house on every lot", "2026-12-20T06:20", "CLEAR_FROST", 1.6, [10, 53], true],
  ["outer street, zoomed out, 15:30, clear, a house on every lot", "2026-12-20T15:30", "CLEAR_FROST", 1.6, [16, 80], true],
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const over = [];
for (const [name, time, weather, zoom, at, demo] of CASES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript((zoom) => {
    localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "medium", multiplayer: false }));
    localStorage.setItem("vila.zoom.v1", String(zoom));
  }, zoom);
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}envTime=${time}&envWeather=${weather}&envDebug=1${demo ? "&villageDemo=full" : ""}`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 90000 });
  await arrive(page, [], name);
  if (at) await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), at);
  let calls = 0, triangles = 0;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    const line = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? "";
    const m = /calls (\d+) · tris (\d+)/.exec(line);
    if (m) (calls = Math.max(calls, Number(m[1]))), (triangles = Math.max(triangles, Number(m[2])));
  }
  console.log(`${String(calls).padStart(4)} calls ${String(triangles).padStart(7)} tris  ${name}`);
  if (calls === 0 || calls > BUDGET.calls || triangles > BUDGET.triangles) over.push(name);
  await page.close();
}
await browser.close();
if (over.length) {
  console.error(`over budget (${BUDGET.calls} calls, ${BUDGET.triangles} triangles) or no counters: ${over.join("; ")}`);
  process.exit(1);
}
console.log("OK render budget");
