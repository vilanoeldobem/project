/**
 * verify-recovery.mjs — what a visitor sees when the 3D village cannot be shown (audit 7.1), in a real Chrome:
 * - the world's code does not download → the failure screen, and the HUD still opens "Explorar ONGs";
 * - the browser has no WebGL → the failure screen;
 * - the graphics context is lost and comes back → a short notice, then the village again;
 * - the graphics context is lost for good → the notice, then the failure screen with "Tentar de novo".
 * No page error may escape the boundary in any case. Local only.
 *
 * Usage: node scripts/verify-recovery.mjs [url]   (default http://localhost:8799, `pnpm dev:worker`)
 */
import { chromium } from "playwright-core";

import { analyticsNoise, isolateAnalytics } from "./analytics.mjs";

const url = process.argv[2] ?? "http://localhost:8799";
const errors = [];
const check = (ok, message) => ok || errors.push(message);
const SWIFT = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

async function open(browser, name, { blockWorld = false, strictConsole = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: uncaught ${e.message}`));
  if (strictConsole) page.on("console", (m) => m.type() === "error" && !analyticsNoise(m.text()) && errors.push(`${name}: ${m.text()}`));
  await isolateAnalytics(page);
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  if (blockWorld) await page.route(/\/assets\/World-[^/]*\.js$/, (route) => route.abort());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

const unavailable = (page) => page.locator(".world-unavailable");
const loseContext = (page) =>
  page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    window.__lose = gl.getExtension("WEBGL_lose_context");
    window.__lose.loseContext();
  });

{
  const browser = await chromium.launch({ channel: "chrome", args: SWIFT });

  // 1. The world's code does not download.
  const blocked = await open(browser, "blocked world", { blockWorld: true });
  await unavailable(blocked).waitFor({ timeout: 15000 }).catch(() => errors.push("blocked world: no failure screen"));
  check(await blocked.getByRole("button", { name: "Tentar de novo" }).isVisible(), "blocked world: no retry button");
  await blocked.getByRole("button", { name: "Explorar ONGs", exact: true }).click().catch(() => errors.push("blocked world: no Explorar ONGs on the HUD"));
  await blocked.locator(".panel, [role=dialog]").first().waitFor({ timeout: 5000 }).catch(() => errors.push("blocked world: Explorar ONGs did not open"));
  await blocked.close();

  // 3. Lost and restored.
  const back = await open(browser, "context restored", { strictConsole: true });
  await back.waitForSelector("canvas", { timeout: 20000 });
  await back.waitForTimeout(3000);
  await loseContext(back);
  await back.locator(".world-paused").waitFor({ timeout: 5000 }).catch(() => errors.push("context restored: no pause notice"));
  await back.waitForTimeout(1000);
  await back.evaluate(() => window.__lose.restoreContext());
  await back.locator(".world-paused").waitFor({ state: "detached", timeout: 5000 }).catch(() => errors.push("context restored: the notice stayed"));
  await back.waitForTimeout(9000);
  check(!(await unavailable(back).count()), "context restored: failure screen after a restore");
  check(await back.locator("canvas").isVisible(), "context restored: the village is gone");
  await back.close();

  // 4. Lost for good.
  const gone = await open(browser, "context lost", { strictConsole: true });
  await gone.waitForSelector("canvas", { timeout: 20000 });
  await gone.waitForTimeout(3000);
  await loseContext(gone);
  await gone.locator(".world-paused").waitFor({ timeout: 5000 }).catch(() => errors.push("context lost: no pause notice"));
  await unavailable(gone).waitFor({ timeout: 12000 }).catch(() => errors.push("context lost: no failure screen after the wait"));
  check(!(await gone.locator(".world-paused").count()), "context lost: the pause notice stayed over the failure screen");
  await gone.close();
  await browser.close();
}

// 2. No WebGL at all.
{
  const browser = await chromium.launch({ channel: "chrome", args: ["--disable-3d-apis", "--disable-gpu"] });
  const page = await open(browser, "no webgl");
  await unavailable(page).waitFor({ timeout: 20000 }).catch(() => errors.push("no webgl: no failure screen"));
  await browser.close();
}

if (errors.length) {
  console.error(`${errors.length} error(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("ok — blocked world, no WebGL, context restored, context lost");
