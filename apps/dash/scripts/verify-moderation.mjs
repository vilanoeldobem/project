/**
 * verify-moderation.mjs — roles, account block, logo removal and the link to one application, through the
 * dashboard in a real Chrome (playwright-core + system Chrome) against a local API (IMPL-0021). Local simulators
 * and synthetic data only; fails on console/page errors, on any request to a third party and on any write the
 * run did not expect.
 *
 * What it does, with accounts it creates through the API for this run:
 *   1. a link to one application followed while signed out: after the real sign-in (link asked in the dashboard,
 *      token consumed from the fragment) the person lands on that application; a malformed id and an unknown id
 *      say "Candidatura não encontrada." (the malformed one without any request);
 *   2. logo removal: confirmation first, one request, the logo gone, the history line;
 *   3. accounts: no e-mail and no name anywhere, nothing offered on one's own row; a promotion done with the
 *      keyboard only, after proving that Enter held down sends nothing; a block (a double click sends nothing, a
 *      short message is refused without a request, the right one is sent once);
 *   4. the blocked account signs in to the dashboard: that it is blocked, the message, only "Sair";
 *   5. an administrator demoted while using the dashboard: the admin-only state on the next request, no loop;
 *   6. with the block flag reported off (`/config` answered by this script for one tab): no "Bloquear conta",
 *      "Desbloquear" still offered and working; the system screen shows both moderation flags;
 *   7. the audit trail labels every event above and never carries the block message;
 *   8. with accounts reported off (`/config` answered by this script): the accounts section keeps its honest
 *      state, the PROPOSTA note and no button, and asks the API for nothing about accounts.
 *
 * A transport bridge sends the dashboard's API calls (the build calls http://localhost:8787) to the local API
 * under test, with the dashboard's origin and one cookie jar per signed-in account, so the sign-in is the real one.
 *
 * Needs (ports are examples; never the ones of a dev stack that is already running):
 *   - a local API with a fresh database, started with the dashboard's origin and the block flag on. In `apps/api`:
 *       pnpm exec wrangler d1 migrations apply ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to <dir>
 *       node ../dash/scripts/verify-moderation.mjs --seed > <dir>/seed.sql
 *       pnpm exec wrangler d1 execute ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to <dir> --file <dir>/seed.sql
 *       pnpm exec wrangler dev --local -c wrangler.reconciliation-local.jsonc --persist-to <dir> --port 8871 --inspector-port 9371 \
 *         --var ACCOUNT_BLOCK_ENABLED:true --var DASH_ORIGIN:http://localhost:8896 \
 *         --var ACCOUNT_ORIGINS:http://localhost:8799,http://localhost:8896 --var ALLOWED_ORIGINS:http://localhost:8799,http://localhost:8896
 *     (http://localhost:8799 is that configuration's game origin: the accounts of the run are created in its name,
 *     as the game would; nothing is ever sent to that address)
 *   - the dashboard built for local Workers and served by its Worker (the security headers come from it):
 *       pnpm --filter @vila/dash build:local && (cd apps/dash && pnpm exec wrangler dev --port 8896 --inspector-port 9396)
 *
 * Usage: node apps/dash/scripts/verify-moderation.mjs [dash=http://localhost:8896] [api=http://127.0.0.1:8871]
 * `CHROMIUM_PATH` picks another Chromium build; without it the system Chrome is used. Screenshots go to
 * apps/dash/verify-output/. The seed only creates the synthetic first administrator and its session.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ROOT = { id: "e0000000-0000-4000-8000-000000000001", nickname: "moderation_root", session: "local-moderation-root" };

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
  console.log(`INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${ROOT.id}','Synthetic root','${ROOT.nickname}','${ROOT.nickname}','Local','moderation-root@example.invalid','admin','2026-01-01');
UPDATE users SET role='admin', blocked=0 WHERE id='${ROOT.id}';
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES('${createHash("sha256").update(ROOT.session).digest("hex")}','${ROOT.id}','${expires}');`);
  process.exit(0);
}

const { chromium } = await import("playwright-core");

const dash = new URL(process.argv[2] ?? "http://localhost:8896");
const api = new URL(process.argv[3] ?? "http://127.0.0.1:8871");
for (const url of [dash, api]) {
  assert.equal(url.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local simulators only");
}
/** The API origin a `build:local` bundle calls (src/lib/endpoints.ts). Nothing is ever sent there: the bridge answers. */
const BUNDLE_API = "http://localhost:8787";
/** The game origin of the local API configuration: accounts are created only in the game's name. Never contacted. */
const GAME_ORIGIN = "http://localhost:8799";
const COOKIE = "__Host-vila_session";
const WAIT = 30000;
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const errors = [];
const run = Date.now().toString(36).slice(-6);

/* ------------------------------------------------------------------ the API, from Node (setup and final checks) */

/** One cookie jar per account: `{ session }`. */
const jar = (session = null) => ({ session });
const cookieOf = (j) => (j?.session ? { Cookie: `${COOKIE}=${j.session}` } : {});
function keepCookie(j, response) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const [name, ...value] = pair.split("=");
    if (name.trim() === COOKIE) j.session = value.join("=") || null;
  }
}
async function call(path, { as, body, method = body === undefined ? "GET" : "POST", headers = {}, expect = 200, origin = dash.origin } = {}) {
  const raw = body instanceof Uint8Array;
  const response = await fetch(new URL(path, api), {
    method,
    headers: { Origin: origin, ...cookieOf(as), ...(body === undefined || raw ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
  if (as) keepCookie(as, response);
  const text = await response.text();
  assert.equal(response.status, expect, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

/** A valid CNPJ unique to this run (check digits computed). */
function cnpj() {
  const d = (String(Date.now()).slice(-8).padStart(8, "1") + "0001").split("").map(Number);
  const digit = (weights) => {
    const r = weights.reduce((a, w, i) => a + w * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(digit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(digit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}

/** A real 64 × 64 PNG, built here so the run needs no sample file. */
function png(size = 64) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4), sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const row = size * 3 + 1;
  const pixels = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels.set(x > y ? [0x9e, 0x3b, 0x3b] : [0xff, 0xf9, 0xed], y * row + 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

/** Creates an account the way the game does (registration, then the link), and signs it in to its own jar. */
async function account(prefix, name) {
  const nickname = `${prefix}_${run}`;
  const email = `${prefix}-${run}@example.invalid`;
  const j = jar();
  const { devLink } = await call("/auth/register", { body: { name, nickname, city: "Local", email }, expect: 202, origin: GAME_ORIGIN });
  assert.ok(devLink, "The local API must run with ENVIRONMENT=development (it returns the sign-in link)");
  const { user } = await call("/auth/verify", { as: j, body: { token: new URLSearchParams(new URL(devLink).hash.slice(1)).get("login") } });
  return { id: user.id, nickname, email, name, jar: j };
}

const config = await call("/config");
assert.equal(config.accounts, true, "Start the local API with accounts on");
assert.equal(config.moderation?.block, true, "Start the local API with ACCOUNT_BLOCK_ENABLED:true");
const root = jar(ROOT.session);
assert.equal((await call("/me", { as: root })).user?.role, "admin", "Apply the seed first (--seed): the synthetic first administrator is missing");

// The names and e-mails below must never show up in the dashboard.
const admin = await account("adm", "Synthetic Admin Person");
const second = await account("sec", "Synthetic Second Person");
const player = await account("pla", "Synthetic Player Person");
const owner = await account("ong", "Synthetic Owner Person");
const PERSONAL = [admin, second, player, owner].flatMap((a) => [a.email, a.name]);
// The first administrator grants the role to this run's administrator (the dashboard does the rest).
await call(`/admin/users/${admin.id}/role`, { as: root, body: { accountId: ROOT.id, role: "admin" } });

const lot = (await call("/lots")).lots.find((l) => l.state === "available");
assert.ok(lot, "No available lot left in this database: start from a fresh one");
const NGO_NAME = `Synthetic NGO ${run}`;
const { application } = await call("/ngo/application", {
  as: owner.jar,
  expect: 201,
  body: {
    accountId: owner.id,
    name: NGO_NAME,
    cnpj: cnpj(),
    openedOn: "2020-01-01",
    city: "Local",
    declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
    fundsConfirmation: "Synthetic statement about how funds can be confirmed.",
    summary: "Synthetic summary of a synthetic organisation.",
    description: "Synthetic description of a synthetic organisation, long enough for the form rule.",
    tags: ["education"],
    projects: [],
    lotId: lot.id,
  },
});
const NGO = application.id;
await call("/ngo/application/files?kind=logo", { as: owner.jar, body: png(), headers: { "Content-Type": "image/png", "X-Vila-Account": owner.id }, expect: 201 });

const BLOCK_MESSAGE = `Synthetic message to the blocked person, run ${run}.`;

/* ------------------------------------------------------------------------------------------------ the browser */

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" });

/**
 * A tab with its own cookie jar. `log` keeps every API call it made (`"METHOD /path status"`); `refusals` counts
 * the ones the API refused (Chrome logs each as a console error). `override` answers a route instead of the API.
 */
async function open(name, cookies, { viewport = { width: 1440, height: 900 }, override = () => null } = {}) {
  const context = await browser.newContext({ viewport });
  const tab = { name, log: [], refusals: 0, consoleErrors: [] };
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
      return route.fulfill({ status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    const mocked = override(method, url.pathname);
    if (mocked) {
      tab.log.push(`${method} ${url.pathname} mocked`);
      return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(mocked) });
    }
    const body = request.postDataBuffer();
    const response = await fetch(new URL(url.pathname + url.search, api), {
      method,
      headers: { Origin: dash.origin, ...cookieOf(cookies), ...(body ? { "Content-Type": request.headers()["content-type"] ?? "application/json" } : {}) },
      ...(body ? { body } : {}),
    });
    keepCookie(cookies, response);
    tab.log.push(`${method} ${url.pathname} ${response.status}`);
    if (response.status >= 400) tab.refusals++;
    await route.fulfill({
      status: response.status,
      body: Buffer.from(await response.arrayBuffer()),
      headers: { ...cors, "Content-Type": response.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-store" },
    });
  });
  /** A page of this tab's browser profile (same storage), watched for errors. */
  const newPage = async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(WAIT);
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    page.on("console", (m) => m.type() === "error" && tab.consoleErrors.push(m.text()));
    return page;
  };
  return Object.assign(tab, { context, cookies, newPage, page: await newPage() });
}

/** Chrome reports every refused request as a console error; anything else in the console is a failure. */
function closeTab(tab) {
  const refused = tab.consoleErrors.filter((text) => /^Failed to load resource: the server responded with a status of 4\d\d/.test(text));
  for (const text of tab.consoleErrors) if (!refused.includes(text)) errors.push(`${tab.name}: ${text}`);
  if (refused.length > tab.refusals) errors.push(`${tab.name}: ${refused.length} failed requests in the console, the API refused ${tab.refusals}`);
  return tab.context.close();
}

const writes = (tab, path) => tab.log.filter((line) => line.startsWith(`POST ${path} `)).length;
const fits = async (page, name) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: the page is wider than the viewport`);
const shot = (page, name) => page.screenshot({ path: `${out}moderation-${name}.png`, fullPage: true });
const section = async (page, menu, title = menu) => {
  await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: menu, exact: true }).click();
  await page.getByRole("main").getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
};
/** Asks for the sign-in link in the dashboard; the development API returns it instead of e-mailing it. */
async function askLink(page, email) {
  await page.getByRole("heading", { name: "Entrar", exact: true }).waitFor();
  await page.getByLabel("E-mail da sua conta").fill(email);
  await page.getByRole("button", { name: "Enviar link de acesso" }).click();
  const link = page.getByRole("link", { name: "Abrir link (só em desenvolvimento)" });
  await link.waitFor();
  return link;
}
/** The real sign-in, in the tab that asked for the link. */
const signIn = async (page, email) => (await askLink(page, email)).click();
/** No e-mail and no name of this run's accounts anywhere in the page. */
async function assertNoPersonalData(page, name) {
  const html = await page.content();
  for (const text of PERSONAL) assert.ok(!html.includes(text), `${name}: "${text}" is in the page`);
  assert.ok(!/@example\.invalid/.test(html), `${name}: an e-mail address is in the page`);
}
const rowOf = (page, account) => page.locator(`tr[data-row="${account.id}"]`);
const cell = (page, account, label) => rowOf(page, account).locator(`td[data-label="${label}"]`);
const actionsOf = async (page, account) => (await rowOf(page, account).getByRole("button").allInnerTexts()).join(" | ");
const focusIsOn = (locator) => locator.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));

try {
  /* 1. The link to one application, followed while signed out. */
  const a = await open("admin", jar());
  {
    // The link is followed in one tab; the sign-in link, as from an e-mail, opens in another tab of the same browser.
    await a.page.goto(`${dash.origin}/#applications/${NGO}`, { waitUntil: "networkidle" });
    const link = await (await askLink(a.page, admin.email)).getAttribute("href");
    assert.match(link, /#login=[^&/]+$/, "the sign-in link carries only the token");
    const page = await a.newPage();
    await page.goto(link, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: NGO_NAME, exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, `#/applications/${NGO}`, "after signing in the person lands on the application of the link");
    assert.ok(!page.url().includes("login="), "the sign-in token is not left in the address bar");
    await a.page.close();
    a.page = page;
    await assertNoPersonalData(page, "application");
    await shot(page, "1-application-after-sign-in");

    /* 2. Logo removal. */
    await page.locator('[data-file="logo"] img').waitFor();
    const remove = page.getByRole("button", { name: "Remover logo", exact: true });
    await remove.dblclick();
    const confirmation = page.locator('[data-confirm="remove-logo"]');
    await confirmation.waitFor();
    assert.match(await confirmation.innerText(), new RegExp(`Remover o logo de ${NGO_NAME}\\?`));
    assert.match(await confirmation.innerText(), /O painel não tem como desfazer/);
    assert.equal(await focusIsOn(confirmation.getByRole("heading")), true, "the confirmation takes the focus on its heading");
    const go = confirmation.getByRole("button", { name: "Remover logo", exact: true });
    assert.equal(await go.isDisabled(), true, "the removal must start disabled");
    assert.equal(writes(a, `/admin/ngos/${NGO}/logo/remove`), 0, "a double click must not remove the logo");
    await confirmation.getByRole("button", { name: "Cancelar" }).click();
    assert.equal(await focusIsOn(remove), true, "cancelling gives the focus back to the button");
    await remove.click();
    await confirmation.getByLabel("Entendo que o logo será apagado e que o painel não tem como desfazer").check();
    await shot(page, "2-logo-confirmation");
    await go.click();
    await page.getByRole("status").filter({ hasText: "Logo removido." }).waitFor();
    assert.equal(writes(a, `/admin/ngos/${NGO}/logo/remove`), 1, "exactly one removal request");
    assert.equal(await page.locator('[data-file="logo"]').count(), 0);
    assert.equal(await page.getByRole("button", { name: "Remover logo" }).count(), 0);
    assert.match(await page.locator(".history").innerText(), new RegExp(`Logo removido pela administração · @${admin.nickname}`));
    assert.deepEqual((await call(`/admin/applications/${NGO}`, { as: root })).files, [], "the API holds no file for the application any more");

    /* 1 (continued). Addresses that lead to no application. */
    const before = a.log.length;
    await page.evaluate(() => (location.hash = "#applications/not-an-id"));
    await page.locator('[data-state="not-found"]').waitFor();
    assert.match(await page.getByRole("main").innerText(), /Candidatura não encontrada\./);
    assert.deepEqual(a.log.slice(before), [], "a malformed id is never sent to the API");
    await page.evaluate(() => (location.hash = "#applications/00000000-0000-4000-8000-000000000000"));
    await page.getByRole("heading", { level: 1, name: "Candidatura não encontrada", exact: true }).waitFor();
    await page.locator('[data-state="not-found"]').waitFor();
    await page.getByRole("link", { name: "Voltar à lista" }).click();
    await page.getByRole("heading", { level: 1, name: "Candidaturas de ONGs", exact: true }).waitFor();

    /* 3. Accounts. */
    await section(page, "Usuários");
    await rowOf(page, player).waitFor();
    await assertNoPersonalData(page, "users");
    assert.equal(await cell(page, admin, "Nickname").innerText(), `@${admin.nickname} (você)`);
    assert.equal(await cell(page, admin, "Papel").innerText(), "Administrador");
    assert.equal(await cell(page, player, "Papel").innerText(), "Padrão");
    assert.equal(await rowOf(page, admin).getByRole("button").count(), 0, "nothing is offered on one's own row");
    assert.match(await rowOf(page, admin).innerText(), /Você não pode mudar o próprio papel\./);
    assert.equal(await actionsOf(page, second), "Tornar administrador | Bloquear conta");
    assert.match(await rowOf(page, { id: ROOT.id }).innerText(), /Remova o papel de administrador antes de bloquear esta conta\./);
    assert.equal(await actionsOf(page, { id: ROOT.id }), "Tornar padrão");
    assert.equal(await page.locator('[data-flag-note="on"]').count(), 1);
    await shot(page, "3-users");

    // Promotion, with the keyboard only. Enter held down on the first button must send nothing.
    const role = `/admin/users/${second.id}/role`;
    await rowOf(page, second).getByRole("button", { name: "Tornar administrador" }).focus();
    for (let i = 0; i < 8; i++) await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    const promote = page.locator('[data-confirm="promote"]');
    await promote.waitFor();
    assert.equal(writes(a, role), 0, "Enter held down must not go through the confirmation");
    assert.equal(await focusIsOn(promote.getByRole("heading")), true);
    assert.match(await promote.innerText(), new RegExp(`Tornar @${second.nickname} administrador\\?`));
    assert.match(await promote.innerText(), /terá acesso a este painel e poderes de moderação no jogo/);
    assert.equal(await promote.getByRole("button", { name: "Tornar administrador" }).isDisabled(), true);
    await page.keyboard.press("Tab"); // the sentence to tick
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab"); // the button
    assert.equal(await focusIsOn(promote.getByRole("button", { name: "Tornar administrador" })), true, "the confirmation is reachable with the keyboard");
    for (let i = 0; i < 8; i++) await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await page.getByRole("status").filter({ hasText: `Papel alterado: @${second.nickname} agora é Administrador.` }).waitFor();
    assert.equal(writes(a, role), 1, "exactly one role change, however long Enter was held");
    assert.equal(await cell(page, second, "Papel").innerText(), "Administrador");
    assert.equal(await actionsOf(page, second), "Tornar padrão");
    assert.equal(await focusIsOn(rowOf(page, second)), true, "the focus goes back to the row");

    // Block: a double click sends nothing; a short message is refused here; the right one is sent once.
    const block = `/admin/users/${player.id}/block`;
    await rowOf(page, player).getByRole("button", { name: "Bloquear conta" }).dblclick();
    const blocking = page.locator('[data-confirm="block"]');
    await blocking.waitFor();
    assert.match(await blocking.innerText(), new RegExp(`Bloquear a conta de @${player.nickname}\\?`));
    assert.match(await blocking.innerText(), /só consegue ler a mensagem abaixo, sair e excluir a própria conta/);
    const field = blocking.getByLabel(/^Mensagem para a pessoa \(ela vai ler\)/);
    const tick = blocking.getByRole("checkbox");
    const send = blocking.getByRole("button", { name: "Bloquear conta" });
    assert.equal(await send.isDisabled(), true);
    await field.fill("curta");
    assert.equal(await send.isDisabled(), true, "a message alone must not enable the block");
    await tick.check();
    await send.click();
    await blocking.getByText("Escreva a mensagem para a pessoa (10 a 1000 caracteres). Ela lê este texto.").waitFor();
    assert.equal(await tick.isChecked(), false, "a refusal asks to confirm again");
    assert.equal(writes(a, block), 0, "a message outside the rule is not sent");
    await field.fill(BLOCK_MESSAGE);
    await tick.check();
    await page.setViewportSize({ width: 390, height: 844 });
    await fits(page, "users with a confirmation open, phone size");
    await shot(page, "3-block-confirmation-phone");
    await page.setViewportSize({ width: 1440, height: 900 });
    await send.dblclick();
    await page.getByRole("status").filter({ hasText: `Conta de @${player.nickname} bloqueada.` }).waitFor();
    assert.equal(writes(a, block), 1, "exactly one block request");
    assert.equal(await cell(page, player, "Situação").innerText(), "Bloqueada");
    assert.equal(await actionsOf(page, player), "Desbloquear");
    await assertNoPersonalData(page, "users after the block");
  }

  /* 4. The blocked account signs in to the dashboard. */
  const p = await open("blocked", jar());
  {
    const { page } = p;
    await page.goto(dash.href, { waitUntil: "networkidle" });
    await signIn(page, player.email);
    await page.getByRole("heading", { level: 1, name: "Conta bloqueada", exact: true }).waitFor();
    assert.equal(await page.locator('[data-field="block-message"]').innerText(), BLOCK_MESSAGE);
    assert.deepEqual(await page.getByRole("button").allInnerTexts(), ["Sair"]);
    assert.equal(await page.getByRole("navigation").count(), 0, "a blocked account sees no menu");
    assert.equal(await page.getByRole("link").count(), 0);
    assert.ok(!p.log.some((line) => line.includes("/admin/")), "a blocked session asks for nothing of the dashboard");
    await shot(page, "4-blocked");
    await page.getByRole("button", { name: "Sair" }).click();
    await page.getByRole("heading", { name: "Entrar", exact: true }).waitFor();
  }
  await closeTab(p);

  /* 5. An administrator demoted while using the dashboard. */
  const s = await open("second", jar());
  {
    // The same return, in the tab that asked for the link (the fragment changes, the page does not load again).
    await s.page.goto(`${dash.origin}/#applications/${NGO}`, { waitUntil: "networkidle" });
    await signIn(s.page, second.email);
    await s.page.getByRole("heading", { level: 1, name: NGO_NAME, exact: true }).waitFor();
    assert.equal(new URL(s.page.url()).hash, `#/applications/${NGO}`);
    await section(s.page, "Usuários");
    await rowOf(s.page, second).waitFor();

    const { page } = a;
    await rowOf(page, second).getByRole("button", { name: "Tornar padrão" }).click();
    const demote = page.locator('[data-confirm="demote"]');
    assert.match(await demote.innerText(), /perderá o acesso a este painel/);
    await demote.getByRole("checkbox").check();
    await demote.getByRole("button", { name: "Tornar padrão" }).click();
    await page.getByRole("status").filter({ hasText: `Papel alterado: @${second.nickname} agora é Padrão.` }).waitFor();

    const before = s.log.length;
    await s.page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Auditoria", exact: true }).click();
    await s.page.getByRole("heading", { level: 1, name: "Apenas administradores", exact: true }).waitFor();
    await s.page.locator('[data-state="demoted"]').waitFor();
    assert.deepEqual(await s.page.getByRole("button").allInnerTexts(), ["Sair"]);
    assert.equal(await s.page.getByRole("navigation").count(), 0);
    await s.page.waitForTimeout(1500);
    assert.deepEqual(s.log.slice(before), ["GET /admin/audit 403", "GET /config 200", "GET /me 200"], "one refusal, one session read, no loop");
    await shot(s.page, "5-demoted");
  }
  await closeTab(s);

  /* 6. The block flag reported off: no block, the unblock still there and working. */
  const off = await open("flag-off", a.cookies, { override: (method, path) => (method === "GET" && path === "/config" ? { ...config, moderation: { ...config.moderation, block: false } } : null) });
  {
    const { page } = off;
    await page.goto(`${dash.origin}/#/users`, { waitUntil: "networkidle" });
    await rowOf(page, player).waitFor();
    assert.equal(await page.getByRole("button", { name: "Bloquear conta" }).count(), 0, "no block is offered with the flag off");
    assert.equal(await actionsOf(page, second), "Tornar administrador");
    assert.equal(await page.locator('[data-flag-note="off"]').count(), 1);
    assert.ok(!(await page.getByRole("main").innerText()).includes("Remova o papel de administrador"));
    await rowOf(page, player).getByRole("button", { name: "Desbloquear" }).click();
    const unblock = page.locator('[data-confirm="unblock"]');
    await unblock.getByRole("checkbox").check();
    await unblock.getByRole("button", { name: "Desbloquear" }).click();
    await page.getByRole("status").filter({ hasText: `Conta de @${player.nickname} desbloqueada.` }).waitFor();
    assert.equal(writes(off, `/admin/users/${player.id}/unblock`), 1);
    assert.equal(await cell(page, player, "Situação").innerText(), "—");
    await section(page, "Sistema");
    assert.equal(await page.locator('[data-flag="moderation.block"]').innerText(), "Desligado");
    await shot(page, "6-flag-off");
  }
  await closeTab(off);

  /* 6 (continued) and 7. The system screen and the audit trail, as the API really is. */
  {
    const { page } = a;
    await section(page, "Sistema");
    assert.equal(await page.locator('[data-flag="moderation.block"]').innerText(), "Ligado");
    assert.equal(await page.locator('[data-flag="moderation.presence"]').innerText(), config.moderation.presence ? "Ligado" : "Desligado");
    await section(page, "Auditoria");
    const audit = await page.getByRole("main").innerText();
    for (const label of ["Papel alterado (Padrão → Administrador)", "Papel alterado (Administrador → Padrão)", "Conta bloqueada pela administração", "Bloqueio de conta desfeito", "Logo removido pela administração"])
      assert.ok(audit.includes(label), `audit: "${label}" is missing`);
    assert.ok(!(await page.content()).includes(BLOCK_MESSAGE), "the audit trail never carries the block message");
    await assertNoPersonalData(page, "audit");
    await page.setViewportSize({ width: 390, height: 844 });
    await section(page, "Usuários");
    await rowOf(page, player).waitFor();
    await fits(page, "users, phone size");
    await shot(page, "7-users-phone");
  }
  await closeTab(a);

  /* 8. Accounts reported off: how production runs today. */
  const locked = await open("accounts-off", jar(), { override: (method, path) => (method === "GET" && path === "/config" ? { ...config, accounts: false, moderation: { presence: false, block: false } } : null) });
  {
    const { page } = locked;
    await page.goto(`${dash.origin}/#users`, { waitUntil: "networkidle" });
    const main = page.getByRole("main");
    await main.getByRole("heading", { level: 1, name: "Usuários", exact: true }).waitFor();
    assert.deepEqual([await main.locator('[data-state="accounts-off"]').count(), await main.locator('[data-state="pending"]').count(), await main.getByRole("button").count()], [1, 1, 0]);
    assert.match(await main.innerText(), /PROPOSTA \(IMPL-0021\)[^]*OQ-11/);
    await section(page, "Sistema");
    assert.deepEqual([await page.locator('[data-flag="moderation.presence"]').innerText(), await page.locator('[data-flag="moderation.block"]').innerText()], ["Desligado", "Desligado"]);
    assert.ok(!locked.log.some((line) => /\/(admin|me|auth)\b/.test(line)), `accounts off: an account route was called (${locked.log.join(", ")})`);
  }
  await closeTab(locked);

  // What the API says agrees with the screens.
  const users = (await call("/admin/users", { as: root })).users;
  const state = (account) => {
    const u = users.find((row) => row.id === account.id);
    return [u.role, u.blocked];
  };
  assert.deepEqual([state(admin), state(second), state(player)], [["admin", false], ["player", false], ["player", false]]);
  assert.deepEqual(errors, []);
  console.log(`PASS: link to an application through sign-in, not-found states, logo removal, roles and block with confirmation (keyboard, double click, Enter held), blocked and demoted sessions, flag off, audit labels — screenshots in ${out}`);
} finally {
  await browser.close();
}
