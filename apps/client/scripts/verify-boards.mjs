/**
 * verify-boards.mjs — every board screen of the game in a real Chrome, at 1440×900 (computer) and 390×844
 * (phone). For each P01–P15 screen it opens the real panel, asserts its title, that nothing scrolls sideways,
 * that every control is at least 44×44 and that Escape closes it, and writes `boards-<id>-<viewport>.png` to
 * verify-output/. It also saves a skin colour, reloads and checks it came back with the local appearance.
 *
 * Local only: it creates one throwaway account through the API's development link so the account, application
 * and badges screens show their signed-in state. With accounts off, those three run signed out and the script
 * says so. P04 is skipped (with a note) when no NGO is published in the local database; run
 * `node scripts/verify-accounts.mjs` once to create one through the real flow.
 *
 * Usage: node scripts/verify-boards.mjs [game=http://localhost:8799] [api=http://localhost:8787]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const game = (process.argv[2] ?? "http://localhost:8799").replace(/\/$/, "");
const api = (process.argv[3] ?? "http://localhost:8787").replace(/\/$/, "");
if (![game, api].every((u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u))) {
  console.error("local only (creates an account)");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const failures = [];
const fail = (message) => failures.push(message);
const read = async (path) => {
  try {
    const res = await fetch(`${api}${path}`, { headers: { Accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

const lots = (await read("/lots"))?.lots ?? [];
const config = (await read("/config")) ?? {};
const published = lots.find((l) => l.state === "published" && l.ngo_name) ?? null;
const available = lots.find((l) => l.state === "available") ?? lots.find((l) => l.state !== "published") ?? null;
const inReview = available && available.state !== "available";

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext();
// Analytics is not what this check is about: GTM is stubbed so its CSP console noise stays out (OQ-13).
await context.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
const errors = [];
const listen = (page, name) => {
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
};
const ready = async (page) => {
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForTimeout(1200);
};

/** One throwaway account through the development link, so P12/P13/P15 show the signed-in state. */
let signedIn = false;
if (config.accounts) {
  const nickname = `wf_${Date.now().toString(36)}`;
  let devLink = null;
  try {
    const res = await fetch(`${api}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: game },
      body: JSON.stringify({ name: "Visitante do quadro", nickname, city: "Recife", email: `${nickname}@example.com` }),
    });
    devLink = (await res.json().catch(() => null))?.devLink ?? null;
    if (!devLink) fail(`sign-in: /auth/register answered ${res.status} without a development link`);
  } catch (e) {
    fail(`sign-in: ${e.message}`);
  }
  if (devLink) {
    const page = await context.newPage();
    listen(page, "sign-in");
    await page.goto(game, { waitUntil: "load" });
    await ready(page);
    await page.goto("about:blank");
    await page.goto(devLink, { waitUntil: "load" });
    await page
      .getByRole("button", { name: /^Sua conta:/ })
      .waitFor({ timeout: 15000 })
      .catch(() => fail("sign-in: the account chip did not appear"));
    signedIn = await page
      .getByRole("button", { name: /^Sua conta:/ })
      .count()
      .then((n) => n > 0);
    await page.close();
  }
}

const BOARDS = [
  { id: "P02", kind: "indicators", title: "Indicadores da Vila" },
  {
    id: "P03",
    kind: "lot",
    arg: available?.id,
    title: inReview ? "Em análise — casa ainda não publicada" : "Terreno disponível",
    skip: available ? null : "no lot the API lists",
  },
  { id: "P04", kind: "lot", arg: published?.id, title: published?.ngo_name, skip: published ? null : "no published NGO (run verify-accounts.mjs first)" },
  { id: "P07", kind: "avatar", title: "Aparência do personagem" },
  { id: "P08", kind: "avatar", title: "Aparência do personagem", selector: '[data-board="P07"]', tab: "Visuais" },
  { id: "P09", kind: "games", title: "Minijogos da Vila" },
  { id: "P10", kind: "map", title: "Expansão da Vila" },
  { id: "P11", kind: "invite", title: "Convide uma ONG" },
  { id: "P12", kind: "ngo", title: signedIn ? "Cadastro da ONG" : "Cadastro de ONGs" },
  { id: "P13", kind: "account", title: signedIn ? "Conta" : "Criar conta na Vila" },
  { id: "P14", kind: "missions", title: "Missões da Vila" },
  { id: "P15", kind: "badges", title: "Suas badges" },
];

const openBoard = async (page, board) => {
  await page.evaluate(([kind, arg]) => window.__vila.extra.panel(kind, arg), [board.kind, board.arg]);
  const dialog = page.getByRole("dialog", { name: board.title, exact: true });
  await dialog.waitFor({ timeout: 10000 }).catch(() => fail(`${board.id}: the dialog "${board.title}" did not open`));
  if (board.tab) {
    await dialog.getByRole("tab", { name: board.tab, exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(250);
  return dialog;
};

const smallTargets = async (dialog) =>
  dialog.evaluate((panel) =>
    [...panel.querySelectorAll("button, a.btn")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 24))
  );

/** The local appearance: a swatch, save, reload, and both the pressed state and the portrait colour come back. */
const appearanceSaveCheck = async (page) => {
  await page.evaluate(() => window.__vila.extra.panel("avatar"));
  const dialog = page.getByRole("dialog", { name: "Aparência do personagem", exact: true });
  await dialog.waitFor({ timeout: 10000 }).catch(() => fail("appearance: panel did not open"));
  await dialog.locator('[data-field="skin"][data-value="#A96B45"]').click();
  await dialog.getByRole("button", { name: "Salvar aparência", exact: true }).click();
  const stored = await page.evaluate(() => localStorage.getItem("vila.appearance.v1"));
  if (!stored || JSON.parse(stored).skin !== "#A96B45") fail(`appearance: saved skin is ${stored}`);
  await page.reload({ waitUntil: "load" });
  await ready(page);
  await page.evaluate(() => window.__vila.extra.panel("avatar"));
  const again = page.getByRole("dialog", { name: "Aparência do personagem", exact: true });
  await again.waitFor({ timeout: 10000 }).catch(() => fail("appearance: panel did not reopen after reload"));
  const pressed = await again.locator('[data-field="skin"][data-value="#A96B45"]').getAttribute("aria-pressed");
  if (pressed !== "true") fail(`appearance: swatch not pressed after reload (${pressed})`);
  const fills = await again.locator("svg.avatar-portrait rect").evaluateAll((rects) => rects.map((r) => r.getAttribute("fill")));
  if (!fills.includes("#A96B45")) fail("appearance: the portrait does not use the saved skin colour");
  await page.keyboard.press("Escape");
};

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
]) {
  const page = await context.newPage();
  listen(page, name);
  await page.setViewportSize({ width, height });
  await page.goto(game, { waitUntil: "load" });
  await ready(page);

  // P01: the bar with the brand and the four named paths, with nothing covering the village.
  if (!(await page.locator('.hud__top[data-board="P01"] .hud__brand .wordmark').isVisible())) fail(`${name}: P01 has no wordmark in the bar`);
  if ((await page.locator(".wordmark").count()) !== 1) fail(`${name}: the wordmark appears outside the header bar`);
  for (const path of ["Explorar ONGs", "Jogar", "Doação global", "Indicar uma ONG"]) {
    if (!(await page.getByRole("button", { name: path, exact: true }).isVisible())) fail(`${name}: P01 path "${path}" is missing`);
  }
  const barHeight = await page.locator(".hud__top").evaluate((el) => el.getBoundingClientRect().height);
  // Four rows of 44 px controls (brand, system, two path rows) plus gaps: the village keeps most of the screen.
  if (name === "mobile" && barHeight > 220) fail(`P01: the bar takes ${Math.round(barHeight)} px of a phone screen`);
  await page.screenshot({ path: `${out}boards-P01-${name}.png` });

  for (const board of BOARDS) {
    if (board.skip) {
      console.log(`note: ${board.id} skipped (${board.skip})`);
      continue;
    }
    const dialog = await openBoard(page, board);
    const root = board.selector ?? `[data-board="${board.id}"]`;
    if (!(await page.locator(root).count())) fail(`${board.id}: no ${root} on the screen`);
    const small = await smallTargets(dialog);
    if (small.length) fail(`${board.id} (${name}): controls under 44 px: ${small.join(" | ")}`);
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > width) fail(`${board.id} (${name}): the page scrolls sideways`);
    await page.screenshot({ path: `${out}boards-${board.id}-${name}.png` });
    await page.keyboard.press("Escape");
    if (await page.getByRole("dialog").count()) fail(`${board.id}: Escape did not close the panel`);
  }

  if (name === "desktop") await appearanceSaveCheck(page);
  // One WebGL canvas at a time: the main page leaves before the account form (two scenes can stall a screenshot).
  await page.close();

  // P13's board is the create-account form: a fresh context without the session shows it at both sizes.
  const anon = await browser.newContext({ viewport: { width, height } });
  await anon.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  const anonPage = await anon.newPage();
  listen(anonPage, `${name}-account-form`);
  await anonPage.goto(game, { waitUntil: "load" });
  await ready(anonPage);
  await anonPage.evaluate(() => window.__vila.extra.panel("account"));
  await anonPage.getByRole("dialog", { name: "Criar conta na Vila", exact: true }).waitFor({ timeout: 10000 }).catch(() => fail("P13 form: the create-account dialog did not open"));
  await anonPage.waitForTimeout(200);
  await anonPage.screenshot({ path: `${out}boards-P13-form-${name}.png` });
  await anon.close();
}

await context.close();
await browser.close();

if (errors.length) failures.push(...errors);
if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`ok — ${BOARDS.filter((b) => !b.skip).length + 1} board screens at 2 sizes; screenshots in ${out}`);
