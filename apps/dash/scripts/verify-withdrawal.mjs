/**
 * verify-withdrawal.mjs — withdraws a published NGO through the dashboard in a real Chrome (playwright-core +
 * system Chrome), at desktop size, then reads the result again at phone size (IMPL-0020, PROPOSTA). Local
 * simulators and synthetic data only; fails on console/page errors and on any request to a third party.
 *
 * It checks: the action is offered only on the published organisation, starts disabled, names the text as the
 * message the organisation reads and asks for an explicit confirmation; after the withdrawal the detail shows the
 * status, the message sent and the audit line and offers no action; the list filter, the freed lot and the
 * feature flag on the system screen agree.
 *
 * The sign-in itself is not exercised here (apps/client/scripts/verify-accounts.mjs covers it): a transport
 * bridge sends the dashboard's API calls to the local API with the synthetic admin session of the seed. It lets
 * through reads and exactly one write, the withdrawal.
 *
 * Needs:
 *   - the local API of `apps/api/scripts/verify-withdrawal.mjs`, freshly seeded and started with
 *     `--var NGO_WITHDRAWAL_ENABLED:true` (commands in that file's header). Seed again before each run: the
 *     synthetic published NGO can be withdrawn only once;
 *   - the dashboard built for local Workers and served anywhere on localhost, for example
 *     `pnpm --filter @vila/dash build:local && pnpm --filter @vila/dash exec vite preview --port 4175 --strictPort`.
 *
 * Usage: node apps/dash/scripts/verify-withdrawal.mjs [dash=http://localhost:4175] [api=http://127.0.0.1:8793]
 * `CHROMIUM_PATH` picks another Chromium build; without it the system Chrome is used.
 */
import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const dash = new URL(process.argv[2] ?? "http://localhost:4175");
const api = new URL(process.argv[3] ?? "http://127.0.0.1:8793");
for (const url of [dash, api]) {
  assert.equal(url.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local simulators only");
}
/** The API origin a `build:local` bundle calls (src/lib/endpoints.ts), and the dashboard origin the local API accepts (DASH_ORIGIN). */
const BUNDLE_API = "http://localhost:8787";
const ALLOWED_ORIGIN = "http://localhost:8797";
const SESSION = "__Host-vila_session=local-withdrawal-admin";
const NGO = "f1000000-0000-4000-8000-000000000005";
const NAME = "Synthetic published NGO";
const MESSAGE = "Synthetic message to the organisation, written in the dashboard";
const WITHDRAW = `/admin/ngos/${NGO}/withdraw`;
const WAIT = 30000;
const errors = [];
let writes = 0;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" });

async function open(name, viewport, readOnly) {
  const context = await browser.newContext({ viewport });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === dash.origin) return route.continue();
    if (url.origin !== BUNDLE_API) {
      errors.push(`${name}: request to a third party (${url.origin})`);
      return route.abort();
    }
    const method = request.method();
    const cors = { "Access-Control-Allow-Origin": dash.origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" };
    if (method === "OPTIONS")
      return route.fulfill({ status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    const withdrawal = method === "POST" && url.pathname === WITHDRAW;
    if (method !== "GET" && !(withdrawal && !readOnly)) {
      errors.push(`${name}: unexpected write ${method} ${url.pathname}`);
      return route.abort();
    }
    if (withdrawal) writes++;
    const response = await fetch(new URL(url.pathname + url.search, api), {
      method,
      headers: { Origin: ALLOWED_ORIGIN, Cookie: SESSION, ...(withdrawal ? { "Content-Type": "application/json" } : {}) },
      ...(withdrawal ? { body: request.postData() } : {}),
    });
    await route.fulfill({
      status: response.status,
      body: Buffer.from(await response.arrayBuffer()),
      headers: { ...cors, "Content-Type": response.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-store" },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT);
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(dash.href, { waitUntil: "networkidle" });
  return { context, page };
}

const fits = async (page, name) =>
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: the page is wider than the viewport`);

/** Opens the synthetic organisation from the list filtered by `status` (the chip's label). */
async function openFromList(page, status) {
  await page.getByRole("link", { name: "Candidaturas", exact: true }).click();
  await page.getByRole("button", { name: status, exact: true }).click();
  const row = page.getByRole("link", { name: new RegExp(NAME) });
  await row.waitFor();
  assert.match(await row.innerText(), new RegExp(status));
  await row.click();
  await page.getByRole("heading", { name: NAME, exact: true }).waitFor();
  assert.ok(page.url().endsWith(NGO));
}

/** What the detail of the withdrawn organisation must show, at any size. */
async function assertWithdrawn(page, name) {
  const notice = page.locator('[data-state="withdrawn"]');
  await notice.waitFor();
  assert.equal(await page.locator('[data-status="withdrawn"]').first().innerText(), "Retirada da Vila");
  assert.match(await notice.innerText(), /Mensagem enviada à organização/);
  assert.equal(await page.locator('[data-field="withdrawal-message"]').innerText(), MESSAGE);
  assert.match(await page.locator(".history").innerText(), /Retirada da Vila pela administração · @withdrawal_1/);
  assert.equal(await page.locator('[data-action="withdraw"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: /Retirar da Vila|Aprovar|Iniciar análise|Rejeitar|Pedir ajustes/ }).count(), 0);
  assert.equal(await page.locator("textarea").count(), 0);
  await fits(page, name);
}

/** The lot the organisation held is free again and names nobody. */
async function assertLotFree(page) {
  await page.getByRole("link", { name: "ONGs e terrenos", exact: true }).click();
  // Mobile cells include their CSS data-label in the accessible name.
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: /^(?:Terreno )?Terreno 4$/ }) });
  await row.waitFor();
  assert.match(await row.innerText(), /Disponível/);
  assert.ok(!(await row.innerText()).includes(NAME));
}

try {
  // Desktop: the withdrawal itself.
  const desktop = await open("desktop", { width: 1440, height: 900 }, false);
  {
    const { page } = desktop;
    await page.getByRole("link", { name: "Sistema", exact: true }).click();
    assert.equal(await page.locator('[data-flag="withdrawal"]').innerText(), "Ligado", "Start the local API with NGO_WITHDRAWAL_ENABLED:true");
    await openFromList(page, "Aprovada e publicada");
    const section = page.locator('[data-action="withdraw"]');
    await section.waitFor();
    assert.match(await section.innerText(), /PROPOSTA \(IMPL-0020\)/);
    assert.match(await section.innerText(), /Mensagem para a organização/);
    assert.match(await section.innerText(), /A organização lê este texto como foi escrito/);
    const button = section.getByRole("button", { name: "Retirar da Vila", exact: true });
    assert.equal(await button.isDisabled(), true, "the action must start disabled");
    await section.locator("textarea").fill(MESSAGE);
    assert.equal(await button.isDisabled(), true, "a message alone must not enable the action");
    await section.getByLabel("Entendo que a retirada não pode ser desfeita pelo painel").check();
    assert.equal(await button.isDisabled(), false);
    await fits(page, "desktop");
    await button.click();
    await page.getByRole("status").filter({ hasText: "Retirada registrada" }).waitFor();
    await assertWithdrawn(page, "desktop");
    assert.equal(writes, 1, "exactly one withdrawal request");
    await openFromList(page, "Retirada da Vila");
    await assertLotFree(page);
    // It left the "published" filter.
    await page.getByRole("link", { name: "Candidaturas", exact: true }).click();
    await page.getByRole("button", { name: "Aprovada e publicada", exact: true }).click();
    // The rows of the previous filter stay on screen until the new answer arrives: wait for the row to go.
    await page.getByRole("link", { name: new RegExp(NAME) }).waitFor({ state: "detached" });
    await page.locator('[data-state="empty"], ul.rows').first().waitFor();
  }
  await desktop.context.close();

  // Phone: the same organisation, read only.
  const mobile = await open("mobile", { width: 390, height: 844 }, true);
  {
    const { page } = mobile;
    await openFromList(page, "Retirada da Vila");
    await assertWithdrawn(page, "mobile");
    await assertLotFree(page);
    await fits(page, "mobile");
  }
  await mobile.context.close();

  // What the public API says agrees with the screen.
  const lot = (await (await fetch(new URL("/lots", api))).json()).lots.find((l) => l.id === "plaza-04");
  assert.deepEqual([lot.state, lot.ngo_id, lot.ngo_name], ["available", null, null]);
  assert.equal((await fetch(new URL(`/ngos/${NGO}`, api))).status, 404);
  assert.deepEqual(errors, []);
  console.log("PASS: dashboard withdrawal (message to the organisation, confirmation, single request), withdrawn detail, filters and freed lot at desktop and phone sizes");
} finally {
  await browser.close();
}
