/**
 * verify-life.mjs — real-browser check of the village's characters (PROPOSTA, IMPL-0025) against LOCAL Workers.
 *
 * - two browser contexts see every character at the same place at the same moment (the measured difference is
 *   printed), and the same function gives the same answer for the same time in both;
 * - morning, afternoon, night and heavy snow: who is out, with a screenshot of each;
 * - talking to the lumberjack, a shopkeeper, Santa, a villager (action button, E, and a click on the
 *   character) and, with `?quests=1`, to a quest NPC, whose dialogue is the quest's;
 * - a walk across the busy square, through the places where characters stand: every leg arrives, and the
 *   character whose spot the avatar takes steps aside;
 * - the setting that hides the characters, "less motion", the phone width;
 * - the render budget (150 draw calls, 250 000 triangles) at the views verify.mjs measures and at two more.
 *
 * Needs the local API, realtime server and client Worker (see AGENTS.md). Local only: it changes nothing.
 * Usage: node apps/client/scripts/verify-life.mjs [client=http://localhost:8799] [shots=apps/client/verify-output]
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

const [url = "http://localhost:8799", shots = new URL("../verify-output/", import.meta.url).pathname] = process.argv.slice(2);
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("local only (the developer hooks it drives exist only on localhost)");
  process.exit(1);
}
mkdirSync(shots, { recursive: true });
const errors = [];
const report = {};
const fail = (message) => {
  errors.push(message);
  console.error(`error: ${message}`);
};
const check = (ok, message) => void (ok || fail(message));

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const WEATHER = "LIGHT_SNOW";
const DAY = "2026-12-20";
/** São Paulo is UTC-3 all year: village time as the `envTime` the page takes. */
const envTime = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 19);
const epoch = (hhmm) => Date.parse(`${DAY}T${hhmm}:00-03:00`);

async function open(name, { time, weather = WEATHER, quests = false, viewport = { width: 1280, height: 800 }, zoom = 1, quality = "medium", settings = {}, context = null } = {}) {
  const page = await (context ?? browser).newPage(context ? undefined : { viewport, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => fail(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && fail(`${name}: ${m.text()}`));
  await page.addInitScript(([quality, zoom, settings]) => {
    localStorage.setItem("vila.environment.v1", JSON.stringify({ quality, multiplayer: false, ...settings }));
    localStorage.setItem("vila.zoom.v1", String(zoom));
    localStorage.setItem("vila.moved.v1", "1");
  }, [quality, zoom, settings]);
  const query = [time ? `envTime=${typeof time === "number" ? envTime(time) : `${DAY}T${time}`}&envWeather=${weather}` : "", "envDebug=1", quests ? "quests=1" : ""].filter(Boolean).join("&");
  await page.goto(`${url}?${query}`, { waitUntil: "load" });
  // Software rendering, one page after another: the scene can take a while to come up.
  await page.waitForSelector("canvas", { timeout: 60000 });
  await arrive(page, errors, name);
  await page.waitForFunction(() => window.__vila?.extra?.life?.().chars.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return page;
}
const life = (page) => page.evaluate(() => window.__vila.extra.life());
const who = async (page, id) => (await life(page)).chars.find((c) => c.id === id);
const counters = async (page) => {
  let calls = 0, triangles = 0;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1200);
    const line = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? "";
    const m = /calls (\d+) · tris (\d+)/.exec(line);
    if (m) (calls = Math.max(calls, Number(m[1]))), (triangles = Math.max(triangles, Number(m[2])));
  }
  return { calls, triangles };
};
const shot = async (page, name) => {
  await page.evaluate(() => document.querySelector(".env-debug")?.setAttribute("hidden", ""));
  await page.screenshot({ path: `${shots}/${name}.png` });
  await page.evaluate(() => document.querySelector(".env-debug")?.removeAttribute("hidden"));
};
const PEOPLE = /^(santa|elf|shopkeeper|lumberjack|villager|visitor)/;

// ---------------------------------------------------------------------------------------------------------
// 1. Two visitors: the same characters in the same places at the same moment.
// ---------------------------------------------------------------------------------------------------------
{
  /** Fastest any character moves (a bird between two lamps), u/s: what a clock difference can amount to. */
  const TOP_SPEED = 5.6;
  /**
   * How far apart two pages' village clocks are (both read next to the machine's own clock, which they share),
   * and what that does to the characters: each page says where everyone is at the same real instants, by its
   * own clock. `from`: the first of those instants, on the first page's clock; one every 61 s, for 24 h.
   */
  const compare = async (name, pa, pb) => {
    const offsets = [];
    for (let i = 0; i < 9; i++) {
      const [ca, cb] = await Promise.all([pa, pb].map((p) => p.evaluate(() => window.__vila.extra.lifeClock())));
      offsets.push([ca.now - ca.wall, cb.now - cb.wall]);
      await pa.waitForTimeout(250);
    }
    // The middle reading: a page that is busy for a moment reads its two clocks a little apart.
    const middle = (k) => offsets.map((o) => o[k]).sort((x, y) => x - y)[4];
    const [oa, ob] = [middle(0), middle(1)];
    const apart = Math.abs(oa - ob);
    const from = (await pa.evaluate(() => window.__vila.extra.lifeClock())).now;
    const instants = Array.from({ length: 1416 }, (_, i) => from - oa + i * 61_000);
    const [sa, sb] = await Promise.all([[pa, oa], [pb, ob]].map(([p, o]) => p.evaluate(([instants, o]) => instants.map((t) => window.__vila.extra.lifeAt(t + o)), [instants, o])));
    let worst = 0, sum = 0, differ = 0, compared = 0, moving = 0, who = "";
    sa.forEach((chars, i) =>
      chars.forEach((c, k) => {
        const o = sb[i][k];
        const d = Math.hypot(c.x - o.x, c.z - o.z);
        compared++;
        sum += d;
        if (d > 0) differ++;
        if (c.moving || o.moving) moving++;
        if (d > worst) (worst = d), (who = c.id);
        // A character is never farther apart for two visitors than its speed times the difference of their clocks.
        check(d <= (TOP_SPEED * apart) / 1000 + 1e-6, `${name}: ${c.id} is ${d.toFixed(3)} u apart with clocks ${apart.toFixed(1)} ms apart`);
      })
    );
    return { clockDifferenceMs: Number(apart.toFixed(2)), instants: instants.length, positionsCompared: compared, onTheMove: moving, identical: compared - differ, worstDistance: Number(worst.toFixed(4)), worstCharacter: who, meanDistance: Number((sum / compared).toFixed(6)) };
  };
  // (a) The synchronized clock, as visitors have it: two separate contexts.
  const [a, b] = await Promise.all([browser.newContext({ viewport: { width: 1280, height: 800 } }), browser.newContext({ viewport: { width: 900, height: 700 } })]);
  const pa = await open("first visitor", { context: a });
  const pb = await open("second visitor", { context: b });
  // The clock syncs with the API a few times after loading: give the min-RTT filter its samples.
  await pa.waitForTimeout(4000);
  report.twoVisitors = { synchronizedClock: await compare("two visitors", pa, pb) };
  check(report.twoVisitors.synchronizedClock.clockDifferenceMs < 250, `two visitors: their synchronized clocks are ${report.twoVisitors.synchronizedClock.clockDifferenceMs} ms apart`);
  // The same function, the same time: bit for bit the same answer in both contexts, for times across a day.
  const times = Array.from({ length: 48 }, (_, i) => epoch("00:00") + i * 1_800_000 + i * 977);
  const [fa, fb] = await Promise.all([pa, pb].map((p) => p.evaluate((times) => times.map((t) => window.__vila.extra.lifeAt(t)), times)));
  check(JSON.stringify(fa) === JSON.stringify(fb), "two visitors: the simulation answers differently for the same time in two contexts");
  check(fa.flat().some((c) => c.presence > 0), "two visitors: nobody is ever on stage");
  report.twoVisitors.sameTimeSameAnswer = { times: times.length, positions: fa.flat().length, identical: JSON.stringify(fa) === JSON.stringify(fb) };
  await a.close();
  await b.close();
  // (b) Clocks that are off: two pages opened one after the other on a developer clock that starts at 15:00 when
  // each one loads, so one runs a few seconds ahead of the other.
  const [c, d] = await Promise.all([browser.newContext({ viewport: { width: 1280, height: 800 } }), browser.newContext({ viewport: { width: 1280, height: 800 } })]);
  const pc = await open("visitor ahead", { context: c, time: "15:00" });
  const pd = await open("visitor behind", { context: d, time: "15:00" });
  report.twoVisitors.clocksApart = await compare("clocks apart", pc, pd);
  check(report.twoVisitors.clocksApart.onTheMove > 0, "clocks apart: nobody moved while the two were compared");
  await c.close();
  await d.close();
}

// ---------------------------------------------------------------------------------------------------------
// 2. Morning, afternoon, night, heavy snow.
// ---------------------------------------------------------------------------------------------------------
report.scenes = {};
for (const [name, time, weather] of [["morning", "09:40", "LIGHT_SNOW"], ["afternoon", "15:00", "LIGHT_SNOW"], ["night", "23:30", "CLEAR_FROST"], ["heavy-snow", "15:00", "HEAVY_SNOW"]]) {
  const page = await open(name, { time, weather, zoom: 1.3 });
  await page.waitForTimeout(2500);
  const r = await life(page);
  const out = r.chars.filter((c) => c.presence > 0);
  const people = out.filter((c) => PEOPLE.test(c.id)).map((c) => c.id);
  report.scenes[name] = { people: people.length, animals: out.length - people.length, drawn: r.drawn, owl: out.some((c) => c.id === "owl-1") };
  check(r.on, `${name}: the characters are off`);
  check(r.drawn > 0, `${name}: nobody is drawn at the spawn`);
  for (const c of out) check(Number.isFinite(c.x) && Math.hypot(c.x, c.z) < 83, `${name}: ${c.id} is outside the world`);
  await shot(page, `life-${name}`);
  await page.close();
}
check(report.scenes.afternoon.people >= 12, `afternoon: only ${report.scenes.afternoon.people} people out`);
check(report.scenes.night.people === 0, `night: ${report.scenes.night.people} people are out at 23:30`);
check(report.scenes.night.owl && !report.scenes.afternoon.owl, "the owl is out by day or in at night");
check(report.scenes["heavy-snow"].people < report.scenes.afternoon.people, "heavy snow does not thin the streets");

// ---------------------------------------------------------------------------------------------------------
// 3. Talking. A time at which each character stands at the place asked is found with the same function.
// ---------------------------------------------------------------------------------------------------------
const finder = await open("finder", { time: "15:00" });
/** The first time from `from` on at which the character stands within `within` of a point (and for the next 50 s). */
const when = (id, point, from, within = 0.6) =>
  finder.evaluate(
    ([id, point, from, within]) => {
      const at = (t) => window.__vila.extra.lifeAt(t).find((c) => c.id === id);
      for (let t = from; t < from + 8 * 3_600_000; t += 15_000) {
        const a = at(t), b = at(t + 50_000);
        if (a.presence === 1 && a.x === b.x && a.z === b.z && Math.hypot(a.x - point[0], a.z - point[1]) < within) return t + 4_000;
      }
      return null;
    },
    [id, point, from, within]
  );
const TALKS = [
  { id: "lumberjack", at: [3.5, -78.1], from: "08:00", action: "Conversar com o lenhador", title: "Lenhador", lines: ["A lenha da Vila vai sair daqui, do pátio na beira da floresta.", "O pátio da lenha ainda não abriu.", "Nada é vendido na Vila."] },
  { id: "shopkeeper-2", at: [7.2, 25.8], from: "10:00", action: "Conversar com lojista", title: "Lojista", lines: ["Este lugar se chama Oficina de Brinquedos. O tema é brinquedos e lembranças.", "A loja ainda não abriu.", "Nada é vendido na Vila."] },
  { id: "santa", at: [-0.3, 16.4], from: "11:00", action: "Conversar com Papai Noel", title: "Papai Noel", lines: ["Ho, ho, ho! Que alegria ver você na Vila.", "Estou cuidando do trenó e das renas.", "Cada casa em volta da praça é de uma ONG. Conheça no seu tempo."] },
  { id: "villager-5", at: [-6.51, 7.64], from: "14:00", action: "Conversar com morador", title: "Morador da Vila", lines: ["Boa tarde! Está caindo uma neve fininha, boa para passear.", "Paramos aqui no banco para pôr a conversa em dia.", null], click: true },
];
report.talks = {};
for (const talk of TALKS) {
  const time = await when(talk.id, talk.at, epoch(talk.from), 1.2);
  if (time === null) {
    fail(`${talk.id}: never stands at (${talk.at}) after ${talk.from}`);
    continue;
  }
  const page = await open(`talk to ${talk.id}`, { time });
  const c = await who(page, talk.id);
  check(c.presence === 1 && !c.moving, `${talk.id}: not standing on stage at the time found`);
  // A step short of the character, on the side of the tree.
  const r = Math.hypot(c.x, c.z);
  const beside = [c.x * (1 - 1.2 / r), c.z * (1 - 1.2 / r)];
  if (talk.click) {
    // From afar a click on the character walks the avatar up to it; the action is then on offer.
    await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), [c.x * (1 + 6 / r), c.z * (1 + 6 / r)]);
    await page.waitForTimeout(1500);
    const at = await page.evaluate(([x, z]) => window.__vila.extra.project(x, 1.4, z), [c.x, c.z]);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.__vila.extra.target() !== null, null, { timeout: 5000 }).catch(() => fail(`${talk.id}: a click on the character did not start a walk`));
    check((await page.evaluate(() => window.__vila.extra.panel())).kind === "none", `${talk.id}: a click from afar opened a panel`);
    await page.waitForFunction(() => window.__vila.extra.target() === null, null, { timeout: 20000 }).catch(() => fail(`${talk.id}: the walk to the character never ended`));
    const pose = await page.evaluate(() => window.__vila.pose());
    check(Math.hypot(pose.x - c.x, pose.z - c.z) < 2.4, `${talk.id}: the walk ended ${Math.hypot(pose.x - c.x, pose.z - c.z).toFixed(2)} u from the character`);
  } else {
    await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), beside);
  }
  const button = page.locator(".hud__action");
  await button.waitFor({ timeout: 8000 }).catch(() => fail(`${talk.id}: no action button next to the character`));
  const label = (await button.textContent().catch(() => "")) ?? "";
  check(label.includes(talk.action), `${talk.id}: the action is "${label}", expected "${talk.action}"`);
  check((await page.evaluate(() => window.__vila.extra.nearby()))?.charId === talk.id, `${talk.id}: the target of the action is not the character`);
  // The camera eases to the avatar after a jump across the village.
  await page.waitForTimeout(2500);
  await shot(page, `life-talk-${talk.id}`);
  if (talk.click) {
    // A second click, from talking distance, opens the dialogue (and leaves no walk behind it).
    const at = await page.evaluate(([x, z]) => window.__vila.extra.project(x, 1.4, z), [c.x, c.z]);
    await page.mouse.click(at.x, at.y);
  } else await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: talk.title });
  await dialog.waitFor({ timeout: 5000 }).catch(() => fail(`${talk.id}: the dialogue did not open`));
  const lines = await dialog.locator("[data-life-line]").allTextContents();
  talk.lines.forEach((expected, i) => expected === null || check(lines[i] === expected, `${talk.id}: line ${i + 1} is "${lines[i]}", expected "${expected}"`));
  check(lines.length >= 2 && lines.length <= 3, `${talk.id}: ${lines.length} lines`);
  check((await page.evaluate(() => window.__vila.extra.target())) === null, `${talk.id}: a walk is waiting behind the dialogue`);
  check(/Explorar ONGs|Jogar|Doação global/.test(lines.join(" ")) === (talk.id === "villager-5"), `${talk.id}: the path a villager points to is ${talk.id === "villager-5" ? "missing" : "said by someone else"}`);
  report.talks[talk.id] = { time: envTime(time), action: label.replace(/\s*E$/, "").trim(), lines };
  await shot(page, `life-dialog-${talk.id}`);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await page.waitForFunction(() => window.__vila.extra.panel().kind === "none", null, { timeout: 3000 }).catch(() => fail(`${talk.id}: "Continuar" did not close the dialogue`));
  if (talk.id === "shopkeeper-2") {
    // The shop and its billboard keep their action at their own points, with the keeper standing between them.
    for (const [point, wanted] of [[[5, 25.5], "Ver loja"], [[8.4, 25.5], "Ler placa"]]) {
      await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), point);
      await page.waitForFunction((wanted) => document.querySelector(".hud__action")?.textContent?.includes(wanted), wanted, { timeout: 5000 }).catch(() => fail(`shop: "${wanted}" is not offered at (${point}) with the keeper there`));
    }
  }
  await page.close();
}
await finder.close();

// A quest NPC, with quests on: its own label and its own dialogue, as before.
{
  const page = await open("quest NPC", { time: "15:00", quests: true });
  await page.waitForFunction(() => window.__vila.extra.quests().some((q) => q.state === "available"), null, { timeout: 10000 }).catch(() => fail("quest NPC: quests are off (the local API needs QUESTS_V1_ENABLED=true)"));
  await page.evaluate(() => window.__vila.extra.teleport(3.3, 10.2));
  const button = page.locator(".hud__action");
  await button.waitFor({ timeout: 8000 }).catch(() => fail("quest NPC: no action button next to Seu Nivaldo"));
  const label = (await button.textContent().catch(() => "")) ?? "";
  check(label.includes("Falar com Seu Nivaldo"), `quest NPC: the action is "${label}"`);
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "Seu Nivaldo" });
  await dialog.waitFor({ timeout: 5000 }).catch(() => fail("quest NPC: its dialogue did not open"));
  check((await dialog.locator("[data-life-line]").count()) === 0, "quest NPC: it speaks the lines of a village character");
  report.talks["quest NPC (postmaster)"] = { action: label.replace(/\s*E$/, "").trim(), dialog: ((await dialog.locator(".panel__body").textContent().catch(() => "")) ?? "").slice(0, 80) };
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
// 4. A walk across the busy square: nobody traps the avatar, and whoever is in the way steps aside.
// ---------------------------------------------------------------------------------------------------------
{
  const page = await open("busy square", { time: "15:00" });
  const before = await life(page);
  const standing = before.chars.filter((c) => c.presence === 1 && !c.moving && c.y < 1 && Math.hypot(c.x, c.z) < 20);
  check(standing.length >= 10, `busy square: only ${standing.length} characters stand in the square`);
  const legs = [];
  let aside = 0;
  // Onto the very spot of each of them, one after the other: the planner knows no character, the walk is exact.
  for (const c of standing.slice(0, 14)) {
    const from = await page.evaluate(() => window.__vila.pose());
    const started = Date.now();
    await page.evaluate(([x, z]) => window.__vila.walkTo(x, z), [c.x, c.z]);
    const to = await page.evaluate(() => window.__vila.extra.target());
    const done = await page.waitForFunction(() => window.__vila.extra.target() === null, null, { timeout: 30000 }).then(() => true, () => false);
    const pose = await page.evaluate(() => window.__vila.pose());
    const short = to ? Math.hypot(pose.x - to.x, pose.z - to.z) : Infinity;
    legs.push({ to: c.id, length: Number(Math.hypot(from.x - c.x, from.z - c.z).toFixed(1)), seconds: Number(((Date.now() - started) / 1000).toFixed(1)), short: Number(short.toFixed(2)) });
    check(done && short < 0.6, `busy square: the walk to ${c.id} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) ${done ? `ended ${short.toFixed(2)} u short` : "never ended"}`);
    await page.waitForTimeout(700);
    const now = (await life(page)).chars.find((x) => x.id === c.id);
    if (now.presence === 1 && !now.moving && Math.hypot(now.x - pose.x, now.z - pose.z) < 0.6) {
      // Still standing where the avatar now is: it is drawn beside the avatar, within its bound.
      check(now.offset <= 1.0001, `busy square: ${c.id} is drawn ${now.offset.toFixed(2)} u from its place (bound 1)`);
      check(Math.hypot(now.shownX - pose.x, now.shownZ - pose.z) > 0.6, `busy square: ${c.id} is drawn on top of the avatar`);
      aside++;
    }
  }
  check(aside >= 5, `busy square: only ${aside} characters were seen stepping aside`);
  await shot(page, "life-busy-square");
  report.busySquare = { legs, steppedAside: aside };
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
// 5. The setting, "less motion", the phone.
// ---------------------------------------------------------------------------------------------------------
{
  const page = await open("setting", { time: "15:00" });
  check((await life(page)).drawn > 5, "setting: characters are not drawn by default");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /Configurações/ }).click();
  const box = page.locator('input[data-setting="characters"]');
  check(await box.isChecked(), "setting: the checkbox is not checked by default");
  await box.uncheck();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const off = await life(page);
  check(off.drawn === 0 && !off.on, `setting: ${off.drawn} characters are drawn with the setting off`);
  await page.evaluate(() => window.__vila.extra.teleport(-0.3, 15.2));
  await page.waitForTimeout(800);
  check((await page.evaluate(() => window.__vila.extra.nearby())) === null, "setting: a hidden character is still offered");
  await shot(page, "life-setting-off");
  await page.close();

  const calm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const still = await open("less motion", { time: "15:00", context: calm, settings: { reduceMotion: true } });
  check((await life(still)).drawn > 5, "less motion: the characters are not drawn");
  await calm.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const small = await open("phone", { time: "11:20", context: phone });
  const santa = await who(small, "santa");
  const p = small.viewportSize();
  if (santa.presence === 1 && !santa.moving) {
    const r = Math.hypot(santa.x, santa.z);
    await small.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), [santa.x * (1 + 1.2 / r), santa.z * (1 + 1.2 / r)]);
    const button = small.locator(".hud__action");
    await button.waitFor({ timeout: 8000 }).catch(() => fail("phone: no action button next to the character"));
    const b = await button.boundingBox().catch(() => null);
    check(b && b.x >= 0 && b.x + b.width <= p.width && b.y + b.height <= p.height && b.height >= 44, `phone: the action button does not fit or is smaller than 44 px (${JSON.stringify(b)})`);
    await shot(small, "life-phone");
    await button.tap();
    const dialog = small.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 }).catch(() => fail("phone: the dialogue did not open"));
    const d = await dialog.boundingBox().catch(() => null);
    check(d && d.x >= 0 && d.x + d.width <= p.width + 0.5 && d.y >= 0 && d.y + d.height <= p.height + 0.5, `phone: the dialogue does not fit (${JSON.stringify(d)})`);
    check((await small.evaluate(() => document.documentElement.scrollWidth)) <= p.width, "phone: the page scrolls sideways");
    await shot(small, "life-phone-dialog");
    report.phone = { button: b, dialog: d };
  } else fail("phone: Santa is not standing at 11:20 (pick another time)");
  await phone.close();
}

// ---------------------------------------------------------------------------------------------------------
// 6. Render budget, with the characters drawn.
// ---------------------------------------------------------------------------------------------------------
const BUDGET = { calls: 150, triangles: 250000 };
report.budget = {};
for (const [name, time, weather, zoom, at] of [
  ["spawn, default zoom, noon, snow", "12:00", "SNOW", 1, null],
  ["spawn, default zoom, 15:30, clear", "15:30", "CLEAR_FROST", 1, null],
  ["spawn, zoomed out, 15:30, clear", "15:30", "CLEAR_FROST", 1.6, null],
  ["spawn, zoomed out, 06:20, clear", "06:20", "CLEAR_FROST", 1.6, null],
  ["shop door, default zoom, noon, snow", "12:00", "SNOW", 1, [5, 25.5]],
  ["premium street, default zoom, noon, snow", "12:00", "SNOW", 1, [37.5, 6]],
]) {
  const page = await open(`budget (${name})`, { time, weather, zoom });
  if (at) await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), at);
  const { calls, triangles } = await counters(page);
  const drawn = (await life(page)).drawn;
  report.budget[name] = { calls, triangles, charactersDrawn: drawn };
  check(calls > 0, `budget (${name}): no render counters`);
  check(calls <= BUDGET.calls && triangles <= BUDGET.triangles, `budget (${name}): ${calls} calls and ${triangles} triangles, over ${BUDGET.calls} and ${BUDGET.triangles}`);
  await page.close();
}

await browser.close();
writeFileSync(`${shots}/life-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n${errors.map((e) => `- ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("\nverify-life: ok");
