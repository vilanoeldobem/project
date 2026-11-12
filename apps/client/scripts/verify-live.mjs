/**
 * verify-live.mjs — read-only check of a DEPLOYED game in a real Chrome (playwright-core + system Chrome).
 * `verify.mjs` cannot run against production: it drives the environment debug panel (`?envDebug=1`), which only
 * exists on localhost. This one creates nothing and signs in nowhere. It fails when:
 *
 *   - the page does not answer 200 or sends no Content-Security-Policy;
 *   - the canvas or the "Entrar na Vila" button is missing;
 *   - anything is written to the console as an error (CSP violations included) or a request fails;
 *   - the presence chip ("👥 …") does not show after entering, or no WebSocket was opened to the realtime server;
 *   - account controls are visible although the API says accounts are off.
 *
 * Usage: node scripts/verify-live.mjs [game=https://play.vilanoeldobem.com.br] [api=https://api.vilanoeldobem.com.br]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const [url = "https://play.vilanoeldobem.com.br", apiUrl = "https://api.vilanoeldobem.com.br"] = process.argv.slice(2);
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const config = await (await fetch(`${apiUrl}/config`)).json();
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const sockets = [];
page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
// Query strings are dropped (analytics hits carry long ones): the host, the path and the blocked directive matter.
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().replace(/\?[^\s'"]*/g, "").slice(0, 400)}`));
page.on("requestfailed", (r) => errors.push(`request failed: ${new URL(r.url()).origin}${new URL(r.url()).pathname} (${r.failure()?.errorText})`));
page.on("websocket", (ws) => sockets.push(ws.url()));

const response = await page.goto(url, { waitUntil: "load" });
if (response.status() !== 200) errors.push(`status ${response.status()}`);
if (!response.headers()["content-security-policy"]) errors.push("no Content-Security-Policy header");
await page.waitForSelector("canvas", { timeout: 20000 });
await page.getByRole("button", { name: "Entrar na Vila" }).click();
const chip = page.getByText(/👥/).first();
await chip.waitFor({ timeout: 20000 }).catch(() => errors.push("no presence chip after entering the village"));
// Late requests (analytics, presence) still count.
await page.waitForTimeout(5000);
if (!sockets.some((s) => s.includes("/room"))) errors.push("no WebSocket to the realtime server");
const text = await page.locator("body").innerText();
if (config.accounts !== true && /Criar conta|Entrar com e-mail|Minha conta/.test(text)) errors.push("account controls visible although the API has accounts off");
await page.screenshot({ path: `${out}live.png` });
await browser.close();

if (errors.length) {
  const unique = [...new Set(errors)];
  console.error(`${unique.length} failure(s) on ${url}:`);
  for (const e of unique) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`ok — ${url}: presence "${text.match(/👥[^\n]*/)?.[0] ?? "?"}", accounts ${config.accounts === true ? "on" : "off"}; screenshot in ${out}live.png`);
