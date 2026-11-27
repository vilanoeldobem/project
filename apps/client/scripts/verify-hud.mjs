/**
 * verify-hud.mjs — the HUD and the mission journal in a real Chrome, at every width (IMPL-0037).
 *
 * Local only: needs the game on :5173 (`pnpm --filter @vila/client dev`) with the API on :8787 (quests are
 * always on). It seeds three open quests through the real dialogues, then checks each width for horizontal
 * scroll, overlapping HUD blocks, 44 px targets, a visible keyboard focus ring, the journal opening and
 * closing, reduced motion, forced colors and 200 % zoom. Screenshots land in verify-output/.
 *
 * Usage: node apps/client/scripts/verify-hud.mjs [url]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { analyticsNoise, frameworkNoise } from "./analytics.mjs";
import { arrive } from "./arrive.mjs";

const url = process.argv[2] ?? "http://localhost:5173";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("local only");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const WIDTHS = [320, 375, 414, 768, 1024, 1280, 1440, 1920];
const errors = [];
const fail = (message) => {
  errors.push(message);
  console.error(`error: ${message}`);
};

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function newPage(width) {
  const page = await browser.newPage({ viewport: { width, height: width <= 640 ? 568 : 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => fail(`${width}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !analyticsNoise(m.text()) && !frameworkNoise(m.text()) && fail(`${width}: ${m.text()}`));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(url)) fail(`${width}: request failed ${request.url()}`);
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  await arrive(page, errors, `${width}`);
  await page.waitForFunction(() => window.__vila?.pose() !== undefined, null, { timeout: 15000 });
  return page;
}

const teleport = (page, x, z) => page.evaluate(([px, pz]) => window.__vila.extra.teleport(px, pz), [x, z]);
const action = (page) => page.waitForSelector(".hud__action", { timeout: 10000 });
const openAt = async (page, x, z) => {
  await teleport(page, x, z);
  await page.waitForTimeout(350);
  await action(page);
  await page.click(".hud__action");
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
};
const accept = async (page, x, z) => {
  await openAt(page, x, z);
  await page.getByRole("button", { name: "Aceitar missão", exact: true }).click();
  await page.waitForTimeout(200);
};
const box = async (page, selector) => {
  const element = page.locator(selector).first();
  return (await element.count()) ? await element.boundingBox() : null;
};
const inside = (b, width, height) => !b || (b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= width + 0.5 && b.y + b.height <= height + 0.5);
const overlaps = (a, b) => Boolean(a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);

try {
  for (const width of WIDTHS) {
    const height = width <= 640 ? 568 : 900;
    const page = await newPage(width);
    // Three open quests through the real givers: Baltazar, Dona Filó and Dona Guida.
    await accept(page, -6, 23.4);
    await accept(page, -18.6, 1.6);
    await accept(page, 5, 5.6);
    await page.waitForTimeout(300);

    if ((await page.locator(".hud__quest").count()) !== 2) fail(`${width}: the tracker does not show exactly two rows`);
    if (!(await page.getByText("+1", { exact: true }).isVisible().catch(() => false))) fail(`${width}: missing the +N chip with three open quests`);
    if (!(await page.getByRole("button", { name: "Abrir Caderno de Missões" }).textContent())?.includes("3 ativas")) fail(`${width}: the journal button does not count three open quests`);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) fail(`${width}: the page scrolls sideways (${scrollWidth})`);

    const top = await box(page, ".hud__top");
    const tracker = await box(page, ".hud__quests");
    const missions = await box(page, ".hud__missions");
    for (const [name, b] of [["top", top], ["tracker", tracker], ["missions", missions]]) if (!inside(b, width, height)) fail(`${width}: the ${name} block leaves the viewport`);
    if (overlaps(top, tracker)) fail(`${width}: the tracker overlaps the top bar`);
    if (overlaps(tracker, missions)) fail(`${width}: the tracker overlaps the journal button`);

    for (const selector of [".hud__quest", ".hud__missions", ".hud__top .btn--chip"]) {
      for (const b of await page.locator(selector).evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()))) {
        if (!b.width || !b.height) continue;
        if (b.width < 44 || b.height < 44) fail(`${width}: ${selector} is smaller than 44 px (${Math.round(b.width)}x${Math.round(b.height)})`);
      }
    }

    // Keyboard: Tab reaches a HUD control with the two-tone ring (the canvas may be the stop before it).
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.body.focus();
    });
    let focus = null;
    for (let i = 0; i < 8 && !focus; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || !element.closest(".hud")) return null;
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), shadow: style.boxShadow };
      });
    }
    if (!focus || focus.outlineStyle === "none" || focus.outlineWidth < 2) fail(`${width}: no visible focus ring on a HUD control`);
    if (focus && !focus.shadow.includes("rgb")) fail(`${width}: the focus ring has no two-tone halo`);

    // The journal opens from the button and closes with Escape.
    await page.getByRole("button", { name: "Abrir Caderno de Missões" }).click();
    await page.getByRole("dialog", { name: "Missões da Vila" }).waitFor({ timeout: 10000 });
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > width) fail(`${width}: the journal scrolls sideways`);
    await page.screenshot({ path: `${out}hud-${width}-journal.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    if (await page.getByRole("dialog").count()) fail(`${width}: Escape did not close the journal`);

    await page.screenshot({ path: `${out}hud-${width}.png` });
    await page.close();
  }

  // Reduced motion, forced colors and 200 % zoom on the two edges of the range.
  for (const width of [320, 1280]) {
    const height = width <= 640 ? 568 : 900;
    const page = await newPage(width);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await accept(page, -6, 23.4);
    const toast = page.locator(".toast").first();
    if (await toast.count()) {
      const animation = await toast.evaluate((node) => getComputedStyle(node).animationName);
      if (animation !== "none") fail(`${width}: the toast animates under reduced motion (${animation})`);
    }
    await page.emulateMedia({ forcedColors: "active" });
    const border = await page.locator(".hud__quest").first().evaluate((node) => getComputedStyle(node).borderTopStyle);
    if (border === "none") fail(`${width}: the tracker has no border under forced colors`);
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.documentElement.scrollWidth) > width) fail(`${width}: 200 % zoom scrolls sideways`);
    const top = await box(page, ".hud__top");
    const tracker = await box(page, ".hud__quests");
    const missions = await box(page, ".hud__missions");
    for (const [name, b] of [["top", top], ["tracker", tracker], ["missions", missions]]) if (!inside(b, width, height)) fail(`${width}: 200 % zoom leaves the ${name} block outside the viewport`);
    if (overlaps(top, missions)) fail(`${width}: 200 % zoom overlaps the top bar and the journal button`);
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
}

const covered = WIDTHS.map((width) => `${width}px`).join(", ");
console.log(`HUD checked at ${covered}; ${errors.length} failure(s).`);
if (errors.length) process.exit(1);
