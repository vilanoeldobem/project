/**
 * verify.mjs — opens the backoffice dashboard in a real Chrome (playwright-core + system Chrome) at desktop and
 * phone sizes, saves screenshots to verify-output/ and fails on console/page errors. It checks:
 *
 *   1. the response headers of the HTML (strict CSP with exactly the API origin, `blob:` for images only, noindex,
 *      no-store, no-referrer);
 *   2. the signed-out screen (sign-in form, nothing else), when the API has accounts on;
 *   3. every section's honest state with accounts off: "contas desligadas" where an admin session is needed,
 *      real public data for lots and system status, labelled placeholders for the pending areas.
 *
 * "Accounts off" is how production runs today. Against a local API with accounts on, the script answers
 * `GET /config` itself with `{"accounts": false}`; every other request goes to the real API, and any call to an
 * account route in that state is reported as an error (the dashboard must not make one).
 * Signed-in flows (review, audit, users) are covered by apps/client/scripts/verify-accounts.mjs.
 *
 * Needs: the dashboard served by its Worker (`pnpm --filter @vila/dash dev:worker`, :8797 — the Vite dev server
 * sends no security headers) and the API that build talks to (`pnpm --filter @vila/api dev`, :8787).
 *
 * Usage: node scripts/verify.mjs [url=http://localhost:8797] [api=http://localhost:8787]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const [url = "http://localhost:8797", apiUrl = "http://localhost:8787"] = process.argv.slice(2);
const dashOrigin = new URL(url).origin;
const apiOrigin = new URL(apiUrl).origin;
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const errors = [];
const WAIT = 30000;

/** Waits for the locator to be visible; false on timeout (`locator.isVisible()` never waits). */
const visible = (locator, timeout = WAIT) =>
  locator.waitFor({ state: "visible", timeout }).then(
    () => true,
    () => false
  );

// What the real API says (public routes; read from Node, so no CORS involved).
const getJson = async (path) => (await fetch(`${apiUrl}${path}`)).json();
const [config, health, lots] = await Promise.all([getJson("/config"), getJson("/health"), getJson("/lots")]);

// 1. Response headers of the HTML.
{
  const res = await fetch(url);
  const header = (name) => res.headers.get(name) ?? "";
  const csp = header("content-security-policy");
  const connect = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src")) ?? "";
  if (connect !== `connect-src 'self' ${apiOrigin}`) errors.push(`headers: connect-src must list exactly the API origin (got "${connect}")`);
  // Images: the dashboard itself and object URLs (the logo preview of an application, IMPL-0017); nothing remote.
  const directives = csp.split(";").map((d) => d.trim());
  const img = directives.find((d) => d.startsWith("img-src")) ?? "";
  if (img !== "img-src 'self' blob:") errors.push(`headers: img-src must be exactly 'self' blob: (got "${img}")`);
  if (directives.some((d) => d !== img && /blob:|data:/.test(d))) errors.push("headers: blob: or data: allowed outside img-src");
  for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"])
    if (!csp.includes(directive)) errors.push(`headers: CSP misses "${directive}"`);
  if (/unsafe-inline|unsafe-eval/.test(csp)) errors.push("headers: CSP allows inline or eval code");
  if (!/noindex/.test(header("x-robots-tag"))) errors.push(`headers: X-Robots-Tag is "${header("x-robots-tag")}"`);
  if (!/no-store/.test(header("cache-control"))) errors.push(`headers: Cache-Control of the HTML is "${header("cache-control")}"`);
  if (header("referrer-policy") !== "no-referrer") errors.push(`headers: Referrer-Policy is "${header("referrer-policy")}"`);
  if (!/<meta name="robots" content="noindex/.test(await res.text())) errors.push("html: robots meta tag missing");
}

const ACCOUNT_ROUTE = /^\/(auth\/|me$|progress|ngo\/|admin\/)/;
const cors = { "Access-Control-Allow-Origin": dashOrigin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" };

/** Section menu label → page title and the state the section must show with accounts off. */
const SECTIONS = [
  { menu: "Candidaturas", title: "Candidaturas de ONGs", file: "applications", states: { "accounts-off": 1 } },
  { menu: "ONGs e terrenos", title: "ONGs e terrenos", file: "lots", states: { "accounts-off": 1 } },
  { menu: "Auditoria", title: "Auditoria", file: "audit", states: { "accounts-off": 1 } },
  { menu: "Usuários", title: "Usuários", file: "users", states: { "accounts-off": 1, pending: 1 } },
  { menu: "Sistema", title: "Sistema", file: "system", states: { "api-health": 1, flags: 1 } },
  { menu: "Pendentes", title: "Pendentes", file: "pending", states: { pending: 3 } },
];

const browser = await chromium.launch({ channel: "chrome" });

async function open(name, forceAccountsOff) {
  const context = await browser.newContext({ viewport: name.startsWith("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  // No third party: every request goes to the dashboard itself or to the API.
  page.on("request", (r) => {
    const origin = new URL(r.url()).origin;
    if (origin !== dashOrigin && origin !== apiOrigin) errors.push(`${name}: request to a third party (${r.url()})`);
  });
  if (forceAccountsOff) {
    await context.route(`${apiOrigin}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/config") return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ ...config, accounts: false }) });
      if (ACCOUNT_ROUTE.test(pathname)) {
        errors.push(`${name}: called ${route.request().method()} ${pathname} with accounts off`);
        return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: '{"error":"accounts_disabled"}' });
      }
      return route.continue();
    });
  }
  await page.goto(url, { waitUntil: "networkidle" });
  return page;
}

/** No sideways scrolling at this viewport (responsive down to 390 px). */
async function fits(page, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${name}: the page is ${overflow}px wider than the viewport`);
}

for (const size of ["desktop", "mobile"]) {
  // 2. Signed out (only when the API really has accounts on; otherwise there is no sign-in to show).
  if (config.accounts === true) {
    const name = `${size}-signed-out`;
    const page = await open(name, false);
    if (!(await visible(page.getByRole("heading", { name: "Entrar", exact: true })))) errors.push(`${name}: sign-in screen not shown`);
    const send = page.getByRole("button", { name: "Enviar link de acesso" });
    if (!(await send.isDisabled().catch(() => false))) errors.push(`${name}: the send button must wait for an e-mail`);
    await page.getByLabel("E-mail da sua conta").fill("alguem@example.com");
    if (await send.isDisabled().catch(() => true)) errors.push(`${name}: the send button stays disabled with an e-mail typed`);
    await page.getByLabel("E-mail da sua conta").fill("");
    if (await page.getByRole("navigation").count()) errors.push(`${name}: menu shown while signed out`);
    if (await page.getByRole("button", { name: /Criar conta/ }).count()) errors.push(`${name}: the dashboard must not offer account creation`);
    await fits(page, name);
    await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
    await page.context().close();
  } else {
    console.log(`note — ${size}: the API has accounts off, so there is no signed-out screen to check`);
  }

  // 3. Accounts off: every section, honest states only.
  const page = await open(`${size}-accounts-off`, config.accounts === true);
  if (!(await visible(page.locator('[data-state="accounts-off-banner"]')))) errors.push(`${size}: "contas desligadas" banner not shown`);
  const menu = page.getByRole("navigation", { name: "Seções" });
  if (size === "desktop") {
    // Keyboard: the first Tab stop is the skip link, and the menu links are reachable.
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (first !== "Pular para o conteúdo") errors.push(`${size}: first Tab stop is "${first}", not the skip link`);
  }
  for (const section of SECTIONS) {
    const name = `${size}-${section.file}`;
    await menu.getByRole("link", { name: section.menu, exact: true }).click();
    const main = page.getByRole("main");
    if (!(await visible(main.getByRole("heading", { level: 1, name: section.title, exact: true })))) errors.push(`${name}: heading "${section.title}" not shown`);
    // Wait until every async region of the section has answered (`aria-busy` back to false). "networkidle" would
    // not do: a hash navigation stays in the same document, where it has already fired.
    await page
      .waitForFunction(() => !document.querySelector('main [aria-busy="true"]'), null, { timeout: WAIT })
      .catch(() => errors.push(`${name}: still loading after ${WAIT / 1000} s`));
    for (const [state, count] of Object.entries(section.states)) {
      await visible(main.locator(`[data-state="${state}"]`).first(), 10000);
      const found = await main.locator(`[data-state="${state}"]`).count();
      if (found !== count) errors.push(`${name}: expected ${count} "${state}" block(s), found ${found}`);
    }
    if (section.file === "lots") {
      // Real public data: one row per lot the API returns, nothing made up.
      const rows = await main.locator("table tbody tr").count();
      if (rows !== lots.lots.length) errors.push(`${name}: ${rows} lot rows, the API has ${lots.lots.length}`);
    }
    if (section.file === "system") {
      const text = await main.innerText();
      if (!text.includes(health.version)) errors.push(`${name}: API version ${health.version} not shown`);
      if ((await main.locator('[data-flag="accounts"]').innerText().catch(() => "")) !== "Desligado") errors.push(`${name}: the accounts flag must read "Desligado"`);
      if (!(await main.getByRole("link", { name: /\/health$/ }).count())) errors.push(`${name}: no link to the realtime server's /health`);
    }
    if (section.file === "pending" || section.file === "audit" || section.file === "users" || section.file === "applications") {
      // Nothing that pretends to work: these states have no button at all.
      const buttons = await main.getByRole("button").count();
      if (buttons) errors.push(`${name}: ${buttons} button(s) in a section that has nothing to act on`);
    }
    await fits(page, name);
    await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  }
  await page.context().close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — screenshots in ${out}`);
