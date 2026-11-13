/**
 * verify-live.mjs — check of a DEPLOYED game in a real Chrome (playwright-core + system Chrome), to run after a
 * deploy. `verify.mjs` cannot run against production: it drives the environment debug panel (`?envDebug=1`),
 * which only exists on localhost. This one signs in nowhere and writes nothing to the database; like any visit,
 * it joins the presence room for a few seconds and triggers the page's analytics. It fails when:
 *
 *   - the page does not answer 200 or sends no Content-Security-Policy;
 *   - the canvas or the "Menu" button of the HUD is missing, a dialog is open on arrival or the welcome screen
 *     ("Entrar na Vila") is back: the visitor lands in the village (IMPL-0022);
 *   - one of the three paths (Explorar ONGs, Jogar, Doação global) is not on the HUD at arrival;
 *   - anything is written to the console as an error (CSP violations included) or a request fails;
 *   - the presence chip ("👥 …") does not show, or the realtime server sent nothing over the
 *     WebSocket (opening a socket is not enough: the room must answer);
 *   - the account chip of the HUD is shown although the API says accounts are off, or missing although they are on.
 *
 * Usage: node scripts/verify-live.mjs [game=https://play.vilanoeldobem.com.br] [api=https://api.vilanoeldobem.com.br]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

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
page.on("websocket", (ws) => {
  if (ws.url().includes("/room")) ws.on("framereceived", () => sockets.push(ws.url()));
});

const response = await page.goto(url, { waitUntil: "load" });
if (response.status() !== 200) errors.push(`status ${response.status()}`);
if (!response.headers()["content-security-policy"]) errors.push("no Content-Security-Policy header");
await page.waitForSelector("canvas", { timeout: 20000 });
await arrive(page, errors, "arrival");
for (const path of ["Explorar ONGs", "Jogar", "Doação global"]) {
  if (!(await page.getByRole("button", { name: path, exact: true }).isVisible())) errors.push(`path "${path}" is not on the HUD at arrival`);
}
const chip = page.getByText(/👥/).first();
await chip.waitFor({ timeout: 20000 }).catch(() => errors.push("no presence chip in the village"));
// Late requests (analytics, presence) still count.
await page.waitForTimeout(5000);
if (!sockets.length) errors.push("the realtime server sent nothing over the WebSocket");
const text = await page.locator("body").innerText();
// The HUD chip of accounts: "Entrar ou criar conta" signed out, "Sua conta: …" signed in (apps/client/src/ui/Account.tsx).
const accountChip = await page.getByRole("button", { name: /^(Entrar ou criar conta|Sua conta: .+)$/ }).count();
if (config.accounts !== true && accountChip) errors.push("the account chip is shown although the API has accounts off");
if (config.accounts === true && !accountChip) errors.push("the account chip is missing although the API has accounts on");
await page.screenshot({ path: `${out}live.png` });
await browser.close();

if (errors.length) {
  const unique = [...new Set(errors)];
  console.error(`${unique.length} failure(s) on ${url}:`);
  for (const e of unique) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`ok — ${url}: presence "${text.match(/👥[^\n]*/)?.[0] ?? "?"}", accounts ${config.accounts === true ? "on" : "off"}; screenshot in ${out}live.png`);
