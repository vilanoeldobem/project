/**
 * verify.mjs — opens the village in a real Chrome (playwright-core + system Chrome), walks the
 * basic flow and saves screenshots to verify-output/. Fails on any console or page error.
 *
 * Arrival (IMPL-0022): the visitor lands in the village with no dialog, the first click walks, the zoom is the
 * wheel and the + / - keys (there are no zoom buttons), Escape closes a panel and, with none open, toggles the
 * game menu, which is also behind the "Menu" button of the HUD.
 *
 * Usage: node scripts/verify.mjs [url]   (default http://localhost:8787, e.g. `pnpm dev:worker`)
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

const url = process.argv[2] ?? "http://localhost:8787";
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const stats = {};
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await arrive(page, errors, name);
  // The three paths are on the HUD from the first second, by name (P01), and nothing covers the village.
  for (const path of ["Explorar ONGs", "Jogar", "Doação global"]) {
    if (!(await page.getByRole("button", { name: path, exact: true }).isVisible())) errors.push(`${name}: path "${path}" is not on the HUD at arrival`);
  }
  if (await page.getByRole("button", { name: /Aproximar|Afastar/ }).count()) errors.push(`${name}: zoom buttons on the HUD`);
  if (await page.locator(".wordmark").count()) errors.push(`${name}: the wordmark is on the gameplay screen`);
  if ((await page.evaluate(() => document.documentElement.scrollWidth)) > viewport.width) errors.push(`${name}: the page scrolls sideways`);
  await page.screenshot({ path: `${out}${name}-1-chegada.png` });
  // Movement is click/tap only (WASD removed): click open plaza ground beside the avatar, with nothing to close
  // first. Not straight ahead: in portrait the tree fills that spot, and a click on the tree opens the donation panel.
  const start = await page.evaluate(() => window.__vila.pose());
  await page.mouse.click(viewport.width * 0.3, viewport.height * 0.47);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}${name}-2a-clique.png` });
  await page
    .waitForFunction((from) => Math.hypot(window.__vila.pose().x - from.x, window.__vila.pose().z - from.z) > 0.3, start, { timeout: 15000 })
    .catch(() => errors.push(`${name}: the first click on the ground did not walk`));
  await page.waitForTimeout(800);
  // Zoom: wheel in, then the "-" key back out (no zoom buttons: wheel, pinch and keys).
  const zoom = () => page.evaluate(() => Number(localStorage.getItem("vila.zoom.v1") ?? 1));
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(700);
  const zoomedIn = await zoom();
  if (!(zoomedIn < 1)) errors.push(`${name}: the wheel did not zoom in (zoom ${zoomedIn})`);
  await page.screenshot({ path: `${out}${name}-2b-zoom.png` });
  for (let i = 0; i < 4; i++) await page.keyboard.press("-");
  const zoomedOut = await zoom();
  if (!(zoomedOut > zoomedIn)) errors.push(`${name}: the "-" key did not zoom out (zoom ${zoomedIn} → ${zoomedOut})`);
  await page.keyboard.press("+");
  if (!((await zoom()) < zoomedOut)) errors.push(`${name}: the "+" key did not zoom in`);
  await page.keyboard.press("-");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}${name}-2-praca.png` });
  await page.getByRole("button", { name: /Indicadores/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}${name}-3-indicadores.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Jogar/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}-4-memoria.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Ambiente:/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}${name}-5-ambiente.png` });
  await page.keyboard.press("Escape");
  // Escape closed the panel and nothing else: the same press must not open the menu.
  if (await page.getByRole("dialog").count()) errors.push(`${name}: Escape did not leave the village clear after closing a panel`);
  // Game menu: Escape with nothing open, and the "Menu" button of the HUD.
  const menu = page.getByRole("dialog", { name: "Menu", exact: true });
  await page.keyboard.press("Escape");
  if (!(await menu.isVisible())) errors.push(`${name}: Escape did not open the game menu`);
  const entries = (await menu.getByRole("button").allInnerTexts()).join(" | ");
  if (entries !== "× | Continuar | Configurações | Controles | Ajuda | Sair da Vila") errors.push(`${name}: menu entries are "${entries}"`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}-6-menu.png` });
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").count()) errors.push(`${name}: the second Escape did not close the game menu`);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await menu.getByRole("button", { name: "Controles", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}-7-controles.png` });
  await page.keyboard.press("Escape"); // back to the list
  await menu.getByRole("button", { name: "Continuar", exact: true }).click();
  if (await page.getByRole("dialog").count()) errors.push(`${name}: "Continuar" did not close the game menu`);
  await page.close();
}

// Environment scenarios (IMPL-0006): fixed São Paulo time + forced weather (debug override, localhost only).
const scenes = [
  ["dia-neve", "2026-12-20T12:00", "SNOW", false, "medium"],
  ["entardecer-limpo", "2026-12-20T17:50", "CLEAR_FROST", false, "high"],
  ["noite-nevasca", "2026-12-20T23:00", "BLIZZARD", false, "medium"],
  ["noite-ceu-aurora", "2026-12-20T23:00", "CLEAR_FROST", true, "ultra"],
  ["amanhecer-nevoa", "2026-12-20T05:30", "MISTY_FROST", true, "low"],
];
for (const [name, time, weather, sky, quality] of scenes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript((q) => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: q })), quality);
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}envTime=${time}&envWeather=${weather}&envDebug=1`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await arrive(page, errors, name);
  if (sky) await page.getByRole("button", { name: "Olhar o céu" }).click();
  // Software GL runs at a few fps; the camera eases per frame, so the sky view needs longer to settle.
  await page.waitForTimeout(sky ? 14000 : 1500);
  await page.screenshot({ path: `${out}env-${name}.png` });
  // Render cost of the scene (draw calls/triangles are resolution independent; timings are software GL).
  stats[name] = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? null;
  await page.close();
}
// Render budget (IMPL-0024): at most 150 draw calls and 250 000 triangles a frame on the medium preset, at the
// spawn with the default zoom and with the zoom all the way out (the counters are those of the debug overlay,
// every pass included; they do not depend on the resolution or on the GPU). 06:20 is the hour of the long
// shadows, the dearest one on the review's walking tour.
const BUDGET = { calls: 150, triangles: 250000 };
stats.budget = {};
for (const [name, time, weather, zoom] of [
  ["spawn, default zoom, noon, snow", "2026-12-20T12:00", "SNOW", 1],
  ["spawn, default zoom, 15:30, clear", "2026-12-20T15:30", "CLEAR_FROST", 1],
  ["spawn, zoomed out, 15:30, clear", "2026-12-20T15:30", "CLEAR_FROST", 1.6],
  ["spawn, zoomed out, 06:20, clear", "2026-12-20T06:20", "CLEAR_FROST", 1.6],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`budget (${name}): ${e.message}`));
  await page.addInitScript((zoom) => {
    localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "medium", multiplayer: false }));
    localStorage.setItem("vila.zoom.v1", String(zoom));
  }, zoom);
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}envTime=${time}&envWeather=${weather}&envDebug=1`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await arrive(page, errors, `budget (${name})`);
  // The camera eases to its place and the shadow pass settles with it: the largest of a few readings counts.
  let calls = 0, triangles = 0;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    const line = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? "";
    const m = /calls (\d+) · tris (\d+)/.exec(line);
    if (m) (calls = Math.max(calls, Number(m[1]))), (triangles = Math.max(triangles, Number(m[2])));
  }
  stats.budget[name] = { calls, triangles };
  if (calls === 0) errors.push(`budget (${name}): the debug overlay shows no render counters`);
  if (calls > BUDGET.calls || triangles > BUDGET.triangles) errors.push(`budget (${name}): ${calls} calls and ${triangles} triangles, over ${BUDGET.calls} and ${BUDGET.triangles}`);
  await page.close();
}

// The expanded village (IMPL-0024, PROPOSTA): one shop, one billboard and one residential plot, each opened by
// the contextual action from where it is used. The copy is neutral: nothing is sold, rented or promised, and
// with ownership off (`/config.residentialPlots` false) the plot panel shows no requirement.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`village: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`village: ${m.text()}`));
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await page.goto(url, { waitUntil: "load" });
  await arrive(page, errors, "village");
  const PROMISE = /em breve|será liberad|quando abrir|ainda não abri|alug|R\$|comprar|preço/i;
  // [what, where the avatar stands (the south shop's door, its billboard's point, the front of economy-21),
  //  the action, the panel's title, sentences the panel must show]
  const places = [
    ["shop", 5, 25.5, /Ver loja/, "Oficina de Brinquedos", ["Esta loja está fechada.", "Se e como ela vai funcionar ainda não foi decidido.", "Nada é vendido na Vila."]],
    ["billboard", 8.4, 25.5, /Ler placa/, "Placa 2", ["As placas mostram avisos da própria Vila.", "No telhado da loja Oficina de Brinquedos"]],
    ["plot", -4.5, 67.75, /Ver terreno residencial/, "Terreno 21 · Bairro da Floresta", ["Os terrenos residenciais não têm dono.", "A casa neste terreno é cenário: ninguém mora nela."]],
  ];
  for (const [what, x, z, action, title, sentences] of places) {
    await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), [x, z]);
    const button = page.getByRole("button", { name: action });
    if (!(await button.waitFor({ timeout: 20000 }).then(() => true, () => false))) {
      errors.push(`village: no "${action.source}" action at the ${what} (nearby: ${JSON.stringify(await page.evaluate(() => window.__vila.extra.nearby()))})`);
      continue;
    }
    await button.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await dialog.waitFor({ timeout: 10000 }).catch(() => errors.push(`village: the ${what} panel "${title}" did not open`));
    const text = ((await dialog.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
    for (const sentence of sentences) if (!text.includes(sentence)) errors.push(`village: the ${what} panel does not say "${sentence}" (it says "${text}")`);
    if (PROMISE.test(text)) errors.push(`village: the ${what} panel promises or sells something: "${text}"`);
    if (/premium|standard|economy|shop-\d|billboard-\d/.test(text)) errors.push(`village: the ${what} panel shows an internal id: "${text}"`);
    if (what === "plot") {
      // With ownership off (the default everywhere) the panel says it is undecided and shows no requirement.
      const flagOn = text.includes("Requisito em estudo");
      if (!flagOn && !text.includes("A posse por jogadores é uma proposta em estudo e ainda não foi decidida.")) errors.push(`village: the plot panel is not the neutral one: "${text}"`);
      if (!flagOn && /nível|requisito/i.test(text)) errors.push(`village: the plot panel shows a requirement with ownership off: "${text}"`);
    }
    if ((await dialog.getByRole("button").count()) !== 1) errors.push(`village: the ${what} panel has a button besides "Fechar"`);
    await page.screenshot({ path: `${out}village-${what}.png` });
    await page.keyboard.press("Escape");
    // Opening a panel leaves no walk behind it.
    await page.waitForTimeout(600);
    const moved = await page.evaluate(([x, z]) => Math.hypot(window.__vila.pose().x - x, window.__vila.pose().z - z), [x, z]);
    if (moved > 0.2 || (await page.evaluate(() => window.__vila.extra.target())) !== null) errors.push(`village: closing the ${what} panel left the avatar walking (${moved.toFixed(2)} u away)`);
  }
  await page.close();
}

// Gameplay: walk to the two gifts (click-to-move through the dev hook) → pickup events + mission done.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`gifts: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`gifts: ${m.text()}`));
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await page.goto(url, { waitUntil: "load" });
  await arrive(page, errors, "gifts");
  for (const [id, x, z] of [["gift-bench", -10, 6], ["gift-palm", 9.5, -9.5]]) {
    await page.evaluate(([x, z]) => window.__vila.walkTo(x, z), [x, z]);
    await page
      .waitForFunction((id) => window.__vila.progress().seen[`explore-gifts:${id}`], id, { timeout: 90000 })
      .catch(async () => errors.push(`gifts: ${id} not collected (avatar at ${JSON.stringify(await page.evaluate(() => window.__vila.pose()))})`));
  }
  const ev = await page.evaluate(() => window.__vila.events.join(","));
  if (!ev.includes("gift") || !ev.includes("mission")) errors.push(`gifts: expected gift + mission events, got "${ev}"`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}gameplay-gifts.png` });
  // Cosmetics (PROPOSTA): the gifts mission unlocks the knit beanie; equip it from the Missions panel.
  const toast = (await page.locator(".toast").textContent().catch(() => "")) ?? "";
  if (!toast.includes("Novo visual")) errors.push(`cosmetics: mission toast without unlock: "${toast}"`);
  await page.getByRole("button", { name: "Abrir Caderno de Missões" }).dispatchEvent("click");
  const beanie = page.getByRole("button", { name: "Gorro de tricô" });
  if (await beanie.isDisabled()) errors.push("cosmetics: beanie still locked after the gifts mission");
  await beanie.dispatchEvent("click");
  if ((await beanie.getAttribute("aria-pressed")) !== "true") errors.push("cosmetics: beanie not selected");
  if (!(await page.getByRole("button", { name: /Coroa de azevinho/ }).isDisabled())) errors.push("cosmetics: level-2 item unlocked too early");
  await page.screenshot({ path: `${out}gameplay-look-panel.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}gameplay-look-avatar.png` });
  await page.close();
}

// Multiplayer: two visitors in the same room see each other move (IMPL-0008).
{
  const ctxA = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const ctxB = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const [a, b] = [await ctxA.newPage(), await ctxB.newPage()];
  for (const [p, n] of [[a, "mp-a"], [b, "mp-b"]]) {
    p.on("pageerror", (e) => errors.push(`${n}: ${e.message}`));
    p.on("console", (m) => m.type() === "error" && errors.push(`${n}: ${m.text()}`));
    await p.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low" })));
    await p.goto(url, { waitUntil: "load" });
    await arrive(p, errors, n);
  }
  await b.waitForFunction(() => window.__vila.extra.remotes().length >= 1, null, { timeout: 30000 }).catch(() => errors.push("mp: B never saw A"));
  await a.evaluate(() => window.__vila.walkTo(-8, 0));
  const seen = await b
    .waitForFunction(() => window.__vila.extra.remotes().some((r) => r.x < -6), null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) errors.push(`mp: B did not see A walk (remotes ${JSON.stringify(await b.evaluate(() => window.__vila.extra.remotes()))})`);
  const chip = await b.getByRole("status", { name: /visitantes nesta praça/ }).textContent().catch(() => null);
  if (!chip?.includes("2")) errors.push(`mp: visitor chip shows "${chip}"`);
  await b.waitForTimeout(1500);
  await b.screenshot({ path: `${out}multiplayer-b.png` });
  stats.multiplayer = (await b.locator(".env-debug").textContent().catch(() => null)) ?? "n/a";
  await ctxA.close();
  await b.waitForFunction(() => window.__vila.extra.remotes().length === 0, null, { timeout: 15000 }).catch(() => errors.push("mp: A did not leave"));
  await ctxB.close();
}

// Content gallery (IMPL-0010, dev-only ?gallery): screenshot per category + render cost + budgets table.
stats.gallery = {};
for (const cat of ["props", "houses", "characters", "animals", "cosmetics"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`gallery-${cat}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`gallery-${cat}: ${m.text()}`));
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}gallery&cat=${cat}`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}gallery-${cat}.png` });
  stats.gallery[cat] = {
    perf: await page.locator(".gallery__perf").textContent(),
    models: await page.locator(".gallery__stats tbody tr").allTextContents(),
  };
  await page.close();
}

await browser.close();
writeFileSync(`${out}stats.json`, JSON.stringify(stats, null, 2));
console.log(stats);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — screenshots in ${out}`);
