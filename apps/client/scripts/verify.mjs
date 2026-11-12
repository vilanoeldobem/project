/**
 * verify.mjs — opens the village in a real Chrome (playwright-core + system Chrome), walks the
 * basic flow and saves screenshots to verify-output/. Fails on any console or page error.
 *
 * Usage: node scripts/verify.mjs [url]   (default http://localhost:8787, e.g. `pnpm dev:worker`)
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright-core";

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
  await page.screenshot({ path: `${out}${name}-1-welcome.png` });
  await page.getByRole("button", { name: "Entrar na Vila" }).click();
  // Movement is click/tap only (WASD removed): click open plaza ground beside the avatar. Not straight ahead:
  // in portrait the tree fills that spot, and a click on the tree opens the donation panel (hiding the zoom HUD).
  await page.mouse.click(viewport.width * 0.3, viewport.height * 0.47);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}${name}-2a-clique.png` });
  await page.waitForTimeout(800);
  // Zoom: wheel in, then the HUD buttons back out.
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}${name}-2b-zoom.png` });
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Afastar" }).click();
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
  await page.getByRole("button", { name: "Entrar na Vila" }).click();
  if (sky) await page.getByRole("button", { name: "Olhar o céu" }).click();
  // Software GL runs at a few fps; the camera eases per frame, so the sky view needs longer to settle.
  await page.waitForTimeout(sky ? 14000 : 1500);
  await page.screenshot({ path: `${out}env-${name}.png` });
  // Render cost of the scene (draw calls/triangles are resolution independent; timings are software GL).
  stats[name] = (await page.locator(".env-debug").textContent())?.split("\n").find((l) => l.startsWith("calls")) ?? null;
  await page.close();
}
// Gameplay: walk to the two gifts (click-to-move through the dev hook) → pickup events + mission done.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`gifts: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`gifts: ${m.text()}`));
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Entrar na Vila" }).click();
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
    // Two software-GL pages starve Playwright's "stable element" check; dispatch the click directly.
    await p.getByRole("button", { name: "Entrar na Vila" }).dispatchEvent("click");
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
