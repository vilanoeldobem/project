/**
 * verify-collisions.mjs — real-browser check of click-to-move and the colliders (IMPL-0016), against a
 * LOCAL client only (the `window.__vila` hooks exist only on localhost). Opens the village in a real Chrome
 * (playwright-core + system Chrome), sends the avatar with `window.__vila.walkTo` to far targets all around
 * the village, chained from the spawn, and checks with `window.__vila.pose()` that every one is reached
 * within a tolerance and a time limit. Then it clicks on obstacles and outside the world and checks that the
 * walk ends right beside them. Saves screenshots to verify-output/. Fails on any console or page error.
 *
 * Runs with quests off (the default URL): the first three targets are the clicks that used to leave the
 * avatar 10 to 20 u short. Lots are "available" unless the local D1 has a published NGO.
 *
 * Usage: node apps/client/scripts/verify-collisions.mjs [url]   (default http://localhost:8799, i.e.
 *        `pnpm --filter @vila/client dev:worker` with the API on :8787 and the server on :8788)
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

const url = process.argv[2] ?? "http://localhost:8799";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("local only (the dev hooks are not exposed on a real hostname)");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

/** The avatar stops within 0.15 u of its destination; the rest is slack for the render interpolation. */
const TOLERANCE = 0.3;
/** Per walk. Software GL runs the simulation several times slower than real time (the longest leg is 17 s). */
const TIME_LIMIT = 90000;

/** Open ground, chained from the spawn (0, 9): each must be reached exactly. */
const LEGS = [
  ["sleigh keeper's spot (was 18.5 u short)", -6, 21.8],
  ["market keeper's spot (was 10.7 u short)", -18.6, 0],
  ["pond keeper's spot (was 20 u short)", 16.3, -10.4],
  ["postmaster's spot", 4.5, 11.8],
  ["storyteller's spot", 5, 4],
  ["lectern's spot", 4.6, 6.4],
  ["across the tree", 0, -15],
  ["behind the market stalls, between the fences", -23, 0],
  ["by the lake lantern, east of the square", 22.5, 5.5],
  ["south-west avenue, between two lots of the frontage", -28, -14],
  ["behind the sleigh and the reindeer", 2, 22.8],
  ["north-east avenue, past the pond", 26, -12],
  // The expanded village (IMPL-0024): streets, a plot front of each tier, the wood yard, and all the way back.
  ["premium street, behind the frontage", 37.5, 6],
  ["front of premium-01", 38.75, -7.5],
  ["front of standard-10, on the far side", 6.25, 54.25],
  ["front of economy-01, the farthest plot", 67.75, -22.5],
  ["end of the northern lane, by the wood yard", 0, -78],
  ["just behind the lamp post south of the spawn", 0, 13.8],
  ["back to the spawn", 0, 9],
];

/**
 * Clicks that land on something solid or outside the world: the walk must end beside it. `from` is where
 * the avatar is sent first, `at` the obstacle's centre and `[min, max]` the allowed distance from it:
 * collider edge + avatar radius (0.45) as the floor, + planning clearance (0.25) and tolerance as the ceiling.
 */
const BLOCKED = [
  { name: "tree", from: [0, 9], click: [0, 0], at: [0, 0], range: [4.95, 5.55] },
  { name: "pine", from: [-4, -4], click: [-10, -10], at: [-10, -10], range: [2.65, 3.25] },
  { name: "market-stall", from: [15, 0], click: [20.5, 0], at: [20.5, 0], range: [1.5, 2.1] },
  { name: "snowman", from: [6, 9], click: [9.5, 4], at: [9.5, 4], range: [1.3, 1.9] },
  { name: "sleigh", from: [-2.2, 16], click: [-2.2, 20.2], at: [-2.2, 20.2], range: [1.7, 2.3] },
  // The expanded village (IMPL-0024): a shop's wall, the firewood between two cottages, the log pile.
  { name: "shop", from: [5, 24], click: [5, 30.5], at: [5, 30.5], range: [3.95, 4.55] },
  { name: "firewood", from: [66.5, -19.5], click: [72.5, -19.5], at: [72.5, -19.5], range: [2.95, 3.55] },
  { name: "log-pile", from: [3.5, -77], click: [3.5, -80], at: [3.5, -80], range: [1.2, 1.8] },
  { name: "outside-the-world", from: [18, 18], click: [200, 200], at: [0, 0], range: [82.1, 82.51] },
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const report = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
await page.goto(url, { waitUntil: "load" });
await page.waitForSelector("canvas", { timeout: 20000 });
await arrive(page, errors, "page");
await page.waitForFunction(() => !!window.__vila, null, { timeout: 10000 });

const pose = () => page.evaluate(() => window.__vila.pose());
const fmt = (p) => `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;

/**
 * One click: returns the resolved destination (where the marker goes), the pose once the walk ended, how
 * long it took and what the planner did. `ended` is false when the time limit ran out.
 */
async function walk(x, z) {
  const started = Date.now();
  const resolved = await page.evaluate(([x, z]) => (window.__vila.walkTo(x, z), window.__vila.extra.target()), [x, z]);
  const route = await page.evaluate(() => window.__vila.extra.route());
  const ended = await page
    .waitForFunction(() => window.__vila.extra.target() === null, null, { timeout: TIME_LIMIT })
    .then(() => true)
    .catch(() => false);
  // The target clears on the last fixed step; give the render pose a frame or two to catch up.
  await page.waitForTimeout(300);
  return { resolved, route, ended, at: await pose(), ms: Date.now() - started, replans: (await page.evaluate(() => window.__vila.extra.route())).replans };
}

for (const [name, x, z] of LEGS) {
  const w = await walk(x, z);
  const off = Math.hypot(w.at.x - x, w.at.z - z);
  report.push(`${name}: (${x}, ${z}) → ${fmt(w.at)} off ${off.toFixed(2)} in ${(w.ms / 1000).toFixed(1)} s, ${w.route.waypoints} waypoint(s), ${w.route.expanded} nodes`);
  if (!w.resolved || Math.hypot(w.resolved.x - x, w.resolved.z - z) > 1e-6) errors.push(`${name}: (${x}, ${z}) is open ground but resolved to ${w.resolved ? fmt(w.resolved) : "nothing"}`);
  if (!w.ended) errors.push(`${name}: still walking to (${x}, ${z}) after ${TIME_LIMIT / 1000} s — avatar at ${fmt(w.at)}`);
  else if (off > TOLERANCE) errors.push(`${name}: stopped ${off.toFixed(2)} u from (${x}, ${z}) — avatar at ${fmt(w.at)}`);
  if (w.route.direct || w.replans > 0) errors.push(`${name}: fell back to the last resort (direct ${w.route.direct}, replans ${w.replans})`);
}
await page.screenshot({ path: `${out}collisions-1-tour.png` });

for (const { name, from, click, at, range } of BLOCKED) {
  const start = await walk(from[0], from[1]);
  if (!start.ended || Math.hypot(start.at.x - from[0], start.at.z - from[1]) > TOLERANCE) errors.push(`${name}: could not get to the starting point (${from}) — avatar at ${fmt(start.at)}`);
  const w = await walk(click[0], click[1]);
  const moved = w.resolved ? Math.hypot(w.resolved.x - click[0], w.resolved.z - click[1]) : 0;
  const dist = Math.hypot(w.at.x - at[0], w.at.z - at[1]);
  const off = w.resolved ? Math.hypot(w.at.x - w.resolved.x, w.at.z - w.resolved.z) : NaN;
  report.push(`${name}: click (${click}) → marker ${w.resolved ? fmt(w.resolved) : "none"}, stopped ${fmt(w.at)}, ${dist.toFixed(2)} u from (${at}) in ${(w.ms / 1000).toFixed(1)} s`);
  if (!w.resolved || moved < 0.5) errors.push(`${name}: the click on (${click}) was not moved to walkable ground (marker ${w.resolved ? fmt(w.resolved) : "none"})`);
  if (!w.ended) errors.push(`${name}: still walking after ${TIME_LIMIT / 1000} s — avatar at ${fmt(w.at)}`);
  else if (!(off <= TOLERANCE)) errors.push(`${name}: stopped ${off.toFixed(2)} u from the marker — avatar at ${fmt(w.at)}`);
  if (dist < range[0] || dist > range[1]) errors.push(`${name}: stopped ${dist.toFixed(2)} u from (${at}), expected ${range[0]}–${range[1]} (beside it, not inside and not far)`);
  if (w.route.direct || w.replans > 0) errors.push(`${name}: fell back to the last resort (direct ${w.route.direct}, replans ${w.replans})`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}collisions-2-${name}.png` });
}

await browser.close();
console.log(report.join("\n"));
if (errors.length) {
  console.error(`FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`ok — ${LEGS.length} far targets reached and ${BLOCKED.length} blocked clicks resolved; screenshots in ${out}`);
