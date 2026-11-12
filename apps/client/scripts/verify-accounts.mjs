/**
 * verify-accounts.mjs — real-browser check of accounts and NGO review (IMPL-0011, IMPL-0015) against LOCAL
 * Workers only: sign-up with the magic link (dev link), progress sync, shared-browser isolation (the next account
 * does not inherit progress) and the NGO application (4 steps) in the GAME; admin sign-in, review (changes
 * requested → resubmit → approve) and the read-only sections in the DASHBOARD; then the published house on the
 * lot. Fails on console errors.
 *
 * Files of the application (IMPL-0017), only when `/config` of the API in use says `files: true` (otherwise the
 * steps are skipped with a note): in the GAME the applicant sends a logo and documents, sees them listed, gets the
 * pt-BR refusal for a wrong file (nothing stored), sends a real JPEG with EXIF as the logo (previewed, stored
 * without EXIF), downloads and removes a document; in the DASHBOARD the admin
 * sees the logo previewed, downloads the document (the read shows in the audit trail); after the approval the
 * published lot panel shows the logo and the applicant's files are read-only. The file names used here never
 * appear on screen, in the console or in a URL.
 *
 * Needs, all running locally:
 *   pnpm --filter @vila/api dev            (:8787; ACCOUNTS_ENABLED=true, ENVIRONMENT=development, DASH_ORIGIN=:8797)
 *   pnpm --filter @vila/server dev         (:8788)
 *   pnpm --filter @vila/client dev:worker  (:8799)
 *   pnpm --filter @vila/dash dev:worker    (:8797)
 * The admin role is granted with `wrangler d1 execute --local` (never remote).
 *
 * An API on another port: local builds of the game and the dashboard always call http://localhost:8787. When the
 * `api` argument is another origin, the browser's requests to :8787 are sent to it instead (the pages do not
 * notice), so nothing has to be rebuilt. If that API keeps its data elsewhere (`wrangler dev --persist-to <dir>`),
 * give the same directory in VILA_API_PERSIST_TO, so the admin role is granted in its database:
 *   VILA_API_PERSIST_TO=/path/to/state node scripts/verify-accounts.mjs http://localhost:8799 http://localhost:8791
 * Without the variable, wrangler's default local state of apps/api is used.
 *
 * Rate limit: the API allows 10 `/auth/*` requests per 60 s per IP (`AUTH_LIMITER`) and one run makes 11 of them
 * (3 sign-ups, 4 link confirmations, 2 link requests, 2 sign-outs). The run paces itself: before each of those it
 * waits until fewer than 9 fell in the last 60 s, so one pause of up to a minute is normal. It cannot see requests
 * of an earlier run: wait 60 s between runs. A run that still hits the limit stops with "rate limited: wait 60 s
 * and run again" instead of a locator timeout.
 *
 * Usage: node scripts/verify-accounts.mjs [client=http://localhost:8799] [api=http://localhost:8787] [dash=http://localhost:8797]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

import { chromium } from "playwright-core";

const [url = "http://localhost:8799", apiUrl = "http://localhost:8787", dashUrl = "http://localhost:8797"] = process.argv.slice(2);
if (![url, apiUrl, dashUrl].every((u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u))) {
  console.error("local only (creates accounts and grants admin)");
  process.exit(1);
}
/** The API origin every local build of the game and of the dashboard calls (`src/lib/endpoints.ts` of each app). */
const BUILD_API = "http://localhost:8787";
const apiOrigin = new URL(apiUrl).origin;
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const run = Date.now().toString(36);
const errors = [];
/** Wait for anything that follows an API call (the UI does update under CPU load, just slowly). */
const API_WAIT = 30000;
/** Set when the API answers 429: the auth rate limit was hit (see the header). */
let rateLimited = false;
/** When this run sent each `/auth/*` request (preflights are not rate limited). */
const authCalls = [];

/**
 * Before a step that sends `n` requests to `/auth/*`: waits until at most 9 of them (the limit is 10) fall in any
 * 60 s, whichever way the limiter cuts its windows.
 */
async function authBudget(n = 1) {
  for (;;) {
    const now = Date.now();
    const recent = authCalls.filter((t) => now - t < 61000);
    if (recent.length + n <= 9) return;
    const wait = recent[0] + 61000 - now;
    console.log(`pacing: ${recent.length} /auth requests in the last minute; waiting ${Math.ceil(wait / 1000)} s (rate limit)`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** A valid CNPJ unique to this run (check digits computed). */
function cnpj() {
  const base = String(Date.now()).slice(-8).padStart(8, "1") + "0001";
  const d = base.split("").map(Number);
  const dig = (w) => {
    const r = w.reduce((a, x, i) => a + x * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dig([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(dig([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}

/** A real PNG of the given size (a red field with a cream square), built here so the run needs no sample files. */
function png(width, height) {
  const row = width * 3 + 1;
  const pixels = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = Math.abs(x - width / 2) < width / 4 && Math.abs(y - height / 2) < height / 4;
      pixels.set(inside ? [0xff, 0xf9, 0xed] : [0x9e, 0x3b, 0x3b], y * row + 1 + x * 3);
    }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([size, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
/** Part of every file name this run uploads: it must never show up on screen, in the console or in a URL. */
const FILE_NAME = `nome-da-pessoa-${run}`;
const upload = (extension, mimeType, buffer) => ({ name: `${FILE_NAME}.${extension}`, mimeType, buffer });

const apiDir = new URL("../../api/", import.meta.url).pathname;
/** Where the API under test keeps its local data, when not in wrangler's default place (see the header). */
const persistTo = process.env.VILA_API_PERSIST_TO;
/** Runs SQL on the LOCAL D1 of the API (never remote). */
const localSql = (command) =>
  execFileSync(`${apiDir}node_modules/.bin/wrangler`, ["d1", "execute", "vilanoeldobem", "--local", ...(persistTo ? ["--persist-to", persistTo] : []), "--command", command], {
    cwd: apiDir,
    stdio: "pipe",
  });

/**
 * A real 128 × 80 JPEG written by an image tool, with an EXIF block: the browser must decode what the game sends
 * after cleaning it, and what the API stores must carry no EXIF.
 */
const JPEG_WITH_EXIF = Buffer.from(
  [
    "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",
  ].join(""),
  "base64"
);

/** Uploads on in the API in use (IMPL-0017)? An API that does not know them has no `files` in `/config`. */
const filesOn = (await (await fetch(`${apiUrl}/config`)).json()).files === true;
if (!filesOn) console.log("note: /config says files are off in this API; the upload steps are skipped");

// Local only: drop applications left by earlier runs of this script (they would use up the 8 lots). Their file
// rows go first (the table exists from migration 0006 on); the bytes stay, unreachable, in the local bucket.
try {
  localSql("DELETE FROM ngo_files WHERE ngo_id IN (SELECT id FROM ngos WHERE name LIKE 'Associação Teste %')");
} catch {
  /* a local database without the ngo_files table */
}
localSql(
  "UPDATE lots SET state = 'available', ngo_id = NULL WHERE ngo_id IN (SELECT id FROM ngos WHERE name LIKE 'Associação Teste %'); " +
    "DELETE FROM audit_events WHERE subject IN (SELECT 'ngo:' || id FROM ngos WHERE name LIKE 'Associação Teste %'); " +
    "DELETE FROM ngos WHERE name LIKE 'Associação Teste %';"
);

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

/** Stops the run: screenshots of every open page, the reason, exit 1. */
let failing = false;
async function fail(reason) {
  if (failing) return;
  failing = true;
  for (const [i, ctx] of browser.contexts().entries())
    for (const [j, p] of ctx.pages().entries()) await p.screenshot({ path: `${out}accounts-fail-${i}-${j}.png` }).catch(() => {});
  console.error(rateLimited ? "rate limited: wait 60 s and run again (the API allows 10 /auth/* requests per 60 s per IP)" : reason);
  if (rateLimited) console.error(`(step that failed: ${reason instanceof Error ? reason.message.split("\n")[0] : reason})`);
  if (errors.length) console.error(errors.join("\n"));
  await browser.close().catch(() => {});
  process.exit(1);
}
// A rejected top-level `await` reaches `uncaughtException` (not `unhandledRejection`): both stop the run.
process.on("uncaughtException", (e) => void fail(e));
process.on("unhandledRejection", (e) => void fail(e));

/**
 * A browser context. When the API under test is not the one the builds call, their requests go to it instead
 * (see the header); the pages still see the build's API origin.
 */
async function newContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  if (apiOrigin !== BUILD_API) await ctx.route(`${BUILD_API}/**`, (route) => route.continue({ url: apiOrigin + route.request().url().slice(BUILD_API.length) }));
  return ctx;
}

/**
 * Collects console/page errors of a page under `name`, notices a 429 from `/auth/*` (the rate limit) and an
 * uploaded file's name in the console or in a URL.
 */
function watch(page, name) {
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${name}: ${m.text()}`);
    if (m.text().includes(FILE_NAME)) errors.push(`${name}: a file name was written to the console`);
  });
  page.on("request", (r) => {
    const target = new URL(r.url());
    if (r.method() !== "OPTIONS" && target.origin === BUILD_API && target.pathname.startsWith("/auth/")) authCalls.push(Date.now());
    if (decodeURIComponent(r.url()).includes(FILE_NAME)) errors.push(`${name}: a file name was sent in a URL`);
  });
  page.on("response", (r) => {
    if (r.status() === 429 && new URL(r.url()).pathname.startsWith("/auth/")) rateLimited = true;
  });
}

/** Opens the game (low quality, no multiplayer) and enters the Vila. `ctx`: reuse a browser context (its cookies). */
async function newPage(name, ctx) {
  ctx ??= await newContext();
  const page = await ctx.newPage();
  watch(page, name);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false }));
    } catch {
      /* about:blank has no storage */
    }
  });
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Entrar na Vila" }).dispatchEvent("click");
  return page;
}

/** Opens the backoffice dashboard in its own browser context. */
async function newDashPage(name) {
  const ctx = await newContext();
  const page = await ctx.newPage();
  watch(page, name);
  await page.goto(dashUrl, { waitUntil: "load" });
  return page;
}

const click = (locator) => locator.dispatchEvent("click");

/** Waits for the locator to be visible; false on timeout. (`locator.isVisible()` returns at once: it never waits.) */
const visible = (locator, timeout = API_WAIT) =>
  locator.waitFor({ state: "visible", timeout }).then(
    () => true,
    () => false
  );

/**
 * A step that depends on `/auth/*` (sign-up, link, verify). When it fails and the API answered 429, the run stops
 * with the rate-limit message instead of a locator timeout.
 */
async function authStep(what, step) {
  try {
    return await step();
  } catch (e) {
    await fail(`${what}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

/** The dev link shown after asking for a sign-in link (game or dashboard). The token must be in the fragment. */
async function devLink(page, who) {
  const link = await authStep(`${who}: sign-in link`, () => page.getByRole("link", { name: /Abrir link/ }).getAttribute("href", { timeout: API_WAIT }));
  if (new URL(link).search) errors.push(`${who}: token in the query string (must be in the fragment)`);
  return link;
}

/** Opens a sign-in link like a link from the inbox and waits for `signedIn`; the token must leave the address bar. */
async function openLink(page, link, signedIn, who) {
  // Same URL apart from the fragment would not reload the page: open it fresh.
  await page.goto("about:blank");
  await authBudget();
  await page.goto(link, { waitUntil: "load" });
  await authStep(`${who}: sign-in with the link`, () => signedIn.waitFor({ timeout: API_WAIT }));
  if (new URL(page.url()).hash.includes("login")) errors.push(`${who}: login token left in the address bar`);
}

/** Fills the game's sign-up form; returns the dev link without opening it. Accounts are created in the game only. */
async function register(page, nickname, email) {
  await click(page.getByRole("button", { name: "Entrar ou criar conta" }));
  await page.getByLabel("Nome *").fill(`Pessoa ${nickname}`);
  await page.getByLabel("Nickname *").fill(nickname);
  await page.getByLabel("Cidade *").fill("Recife");
  await page.getByLabel("E-mail *").fill(email);
  await authBudget();
  await click(page.getByRole("button", { name: "Criar conta", exact: true }));
  const link = await devLink(page, nickname);
  if (new URL(link).origin !== new URL(url).origin) errors.push(`${nickname}: the game's sign-up link opens ${new URL(link).origin}, not the game`);
  return link;
}

async function signUp(page, nickname, email) {
  await openLink(page, await register(page, nickname, email), page.getByRole("button", { name: `Sua conta: ${nickname}` }), nickname);
}

// 1. Applicant (game): local progress first, then sign-up (progress migrates), then the application.
const a = await newPage("applicant");
await a.evaluate(() => window.__vila.walkTo(-10, 6));
await a.waitForFunction(() => window.__vila.progress().seen["explore-gifts:gift-bench"], null, { timeout: 90000 }).catch(() => errors.push("applicant: gift not collected"));
const nick = `ong_${run}`;
await signUp(a, nick, `${nick}@example.com`);
// The sync runs right after sign-in (in the background): wait for the server to have the local event.
await a
  .waitForFunction(
    async (api) => (await (await fetch(`${api}/progress`, { credentials: "include" })).json()).progress?.seen?.["explore-gifts:gift-bench"] === true,
    BUILD_API,
    { timeout: API_WAIT, polling: 500 }
  )
  .catch(() => errors.push("applicant: local progress not migrated to the server"));
await a.screenshot({ path: `${out}accounts-1-signed-in.png` });

// 1b. Shared browser: after signing out, the guest starts empty and the next account inherits nothing.
const serverXp = (page) => page.evaluate(async (api) => (await (await fetch(`${api}/progress`, { credentials: "include" })).json()).progress, BUILD_API);
await click(a.getByRole("button", { name: `Sua conta: ${nick}` }));
await authBudget();
await click(a.getByRole("button", { name: "Sair" }));
await a.getByRole("button", { name: "Entrar ou criar conta" }).waitFor({ timeout: API_WAIT });
if (Object.keys(await a.evaluate(() => window.__vila.progress().seen)).length) errors.push("shared browser: guest progress kept the account's events after sign-out");
const other = `out_${run}`;
await signUp(a, other, `${other}@example.com`);
await a.waitForTimeout(1500);
const otherProgress = await serverXp(a);
if (otherProgress?.seen?.["explore-gifts:gift-bench"] || otherProgress?.xp) errors.push(`shared browser: second account inherited progress (${JSON.stringify(otherProgress)})`);
// Back to the applicant (sign in with a fresh link).
await click(a.getByRole("button", { name: `Sua conta: ${other}` }));
await authBudget();
await click(a.getByRole("button", { name: "Sair" }));
await click(a.getByRole("button", { name: "Entrar ou criar conta" }));
await click(a.getByRole("tab", { name: "Já tenho conta" }));
await a.getByLabel("E-mail da sua conta").fill(`${nick}@example.com`);
await authBudget();
await click(a.getByRole("button", { name: "Enviar link de acesso" }));
await openLink(a, await devLink(a, `${nick} (again)`), a.getByRole("button", { name: `Sua conta: ${nick}` }), `${nick} (again)`);
if (!(await serverXp(a))?.seen?.["explore-gifts:gift-bench"]) errors.push("applicant: progress lost after signing in again");

await click(a.getByRole("button", { name: `Sua conta: ${nick}` }));
await click(a.getByRole("button", { name: "Minha candidatura de ONG" }));
await a.getByLabel("Nome da organização *").fill(`Associação Teste ${run}`);
await a.getByLabel(/^CNPJ \*/).fill(cnpj());
await a.getByLabel("Data de abertura do CNPJ *").fill("2019-05-20");
await a.getByLabel("Cidade da sede *").fill("Olinda");
await click(a.getByRole("button", { name: "Continuar" }));
// Step 2 must refuse to continue without the three declarations.
await click(a.getByRole("button", { name: "Continuar" }));
if (!(await visible(a.getByText("Confirme os três requisitos"), 10000))) errors.push("applicant: declarations not enforced");
for (const label of ["CNPJ ativo", "Pelo menos 1 ano de existência", "Forma confiável de confirmar os recursos recebidos"]) await a.getByLabel(label).check();
await a.getByLabel("Como os recursos podem ser confirmados? *").fill("Extratos mensais da conta da organização e relatório conciliável.");
await click(a.getByRole("button", { name: "Continuar" }));
await a.getByLabel("Resumo (aparece na casa) *").fill("Oficinas de leitura para crianças do bairro.");
await a.getByLabel("Sobre a organização *").fill("Atendemos crianças de 6 a 12 anos com reforço escolar, leitura e atividades culturais no contraturno escolar.");
await click(a.getByRole("button", { name: "Crianças" }));
await click(a.getByRole("button", { name: "Educação" }));
await click(a.getByRole("button", { name: "Continuar" }));
const lotValue = await a.getByLabel("Terreno desejado *").locator("option").nth(1).getAttribute("value", { timeout: API_WAIT });
await a.getByLabel("Terreno desejado *").selectOption(lotValue);
await a.screenshot({ path: `${out}accounts-2-review-step.png` });
await click(a.getByRole("button", { name: "Enviar candidatura" }));
await a.getByRole("dialog").getByText("Candidatura enviada", { exact: true }).first().waitFor({ timeout: API_WAIT });
await a.screenshot({ path: `${out}accounts-3-submitted.png` });

/** The applicant's application as the API has it: `{application, files}` (the page's own session). */
const ownApplication = (page) => page.evaluate(async (api) => (await fetch(`${api}/ngo/application`, { credentials: "include" })).json(), BUILD_API);
/** "logo:image/png document:application/pdf": what the API holds for the applicant, in order. */
const storedFiles = async (page) => ((await ownApplication(page)).files ?? []).map((f) => `${f.kind}:${f.contentType}`).join(" ");
/** The files section of the applicant's application panel. */
const filesOf = (page) => page.getByRole("region", { name: "Arquivos da candidatura" });

// 1c. Files of the application (IMPL-0017): logo, documents, refusals, download and removal.
if (filesOn) {
  const files = filesOf(a);
  const said = (text) => visible(files.getByText(text, { exact: true }));
  await files.getByLabel("Enviar logo").setInputFiles(upload("png", "image/png", png(256, 256)));
  if (!(await said("Logo enviado."))) errors.push("files: the logo upload was not confirmed");
  const preview = files.getByRole("img", { name: "Logo enviado" });
  if (!(await visible(preview)) || !(await preview.evaluate((img) => img.src.startsWith("blob:") && img.naturalWidth === 256))) errors.push("files: no preview of the stored logo");
  await files.getByLabel("Adicionar documento").setInputFiles(upload("pdf", "application/pdf", PDF));
  if (!(await said("Documento 1 enviado."))) errors.push("files: the document upload was not confirmed");
  if ((await storedFiles(a)) !== "logo:image/png document:application/pdf") errors.push(`files: after two uploads the API holds "${await storedFiles(a)}"`);

  // A wrong file is refused in pt-BR before anything is sent, and what was stored stays as it was.
  const before = JSON.stringify((await ownApplication(a)).files);
  await files.getByLabel("Trocar logo").setInputFiles(upload("png", "image/png", png(1440, 900)));
  if (!(await said("A imagem pode ter no máximo 1024 × 1024 pixels."))) errors.push("files: an image too large for a logo was not refused");
  await a.screenshot({ path: `${out}accounts-3a-file-refused.png` });
  await files.getByLabel("Trocar logo").setInputFiles(upload("pdf", "application/pdf", PDF));
  if (!(await said("Envie o logo em PNG ou JPEG."))) errors.push("files: a PDF as logo was not refused");
  if (JSON.stringify((await ownApplication(a)).files) !== before) errors.push("files: a refused file changed what the API holds");

  // A real JPEG with EXIF as the logo: it is cleaned in the browser, still decodes, and is stored without EXIF.
  if (!JPEG_WITH_EXIF.includes("Exif")) errors.push("files: the JPEG sample has no EXIF block (the check below would prove nothing)");
  await files.getByLabel("Trocar logo").setInputFiles(upload("jpg", "image/jpeg", JPEG_WITH_EXIF));
  await a.waitForFunction(() => document.querySelector('img[alt^="Logo enviado"]')?.naturalWidth === 128, null, { timeout: API_WAIT }).catch(() => errors.push("files: the JPEG logo is not previewed at its real size"));
  const storedLogo = await a.evaluate(async (api) => {
    const { files } = await (await fetch(`${api}/ngo/application`, { credentials: "include" })).json();
    const logo = files.find((f) => f.kind === "logo");
    const bytes = new Uint8Array(await (await fetch(`${api}/ngo/application/files/${logo.id}`, { credentials: "include" })).arrayBuffer());
    return { type: logo.contentType, size: logo.size, exif: new TextDecoder("latin1").decode(bytes).includes("Exif") };
  }, BUILD_API);
  if (storedLogo.type !== "image/jpeg" || storedLogo.exif || storedLogo.size >= JPEG_WITH_EXIF.length) errors.push(`files: the stored JPEG logo still carries EXIF or was not cleaned (${JSON.stringify(storedLogo)})`);
  // Back to the PNG logo the rest of the run expects.
  await files.getByLabel("Trocar logo").setInputFiles(upload("png", "image/png", png(256, 256)));
  await a.waitForFunction(() => document.querySelector('img[alt^="Logo enviado"]')?.naturalWidth === 256, null, { timeout: API_WAIT }).catch(() => errors.push("files: the PNG logo did not replace the JPEG one"));

  await files.getByLabel("Adicionar documento").setInputFiles(upload("png", "image/png", png(640, 480)));
  if (!(await said("Documento 2 enviado."))) errors.push("files: the second document was not confirmed");
  const [download] = await Promise.all([a.waitForEvent("download", { timeout: API_WAIT }), click(files.getByRole("button", { name: "Baixar documento 2" }))]);
  if (download.suggestedFilename() !== "documento-2.png") errors.push(`files: document 2 downloads as "${download.suggestedFilename()}"`);
  await download.cancel();
  await click(files.getByRole("button", { name: "Remover documento 1" }));
  if (!(await said("Documento 1 removido."))) errors.push("files: the removal was not confirmed");
  if ((await storedFiles(a)) !== "logo:image/png document:image/png") errors.push(`files: after removing document 1 the API holds "${await storedFiles(a)}"`);
  if ((await files.getByRole("listitem").count()) !== 1 || !(await files.getByRole("listitem").innerText()).includes("PNG")) errors.push("files: the list does not show the one document left");
  if ((await a.getByRole("dialog").innerText()).includes(FILE_NAME)) errors.push("files: a file name is shown");
  if (await files.locator('input[type="file"]').evaluateAll((inputs) => inputs.some((i) => i.value))) errors.push("files: a file input still holds the chosen file (its name shows)");
  await a.screenshot({ path: `${out}accounts-3b-files.png` });
} else if (await filesOf(a).count()) errors.push("files: the files section is shown although the API has uploads off");

// 2. Admin. The account is created in the game (the dashboard has no sign-up); its link is left unused, because
// the admin signs in on the dashboard, whose link must open the dashboard.
const admin = `adm_${run}`;
const g = await newPage("admin (game sign-up)");
await register(g, admin, `${admin}@example.com`);
await g.context().close();

const b = await newDashPage("admin (dashboard)");
await b.getByLabel("E-mail da sua conta").fill(`${admin}@example.com`);
await authBudget();
await b.getByRole("button", { name: "Enviar link de acesso" }).click();
const dashLink = await devLink(b, "admin (dashboard)");
if (new URL(dashLink).origin !== new URL(dashUrl).origin)
  await fail(`admin: the link asked from the dashboard opens ${new URL(dashLink).origin}, not ${new URL(dashUrl).origin} (is the API's DASH_ORIGIN this dashboard?)`);
// Signed in, but not an admin yet: the refusal and a way out, nothing else.
await openLink(b, dashLink, b.getByRole("heading", { name: "Apenas administradores" }), "admin (dashboard)");
if (await b.getByRole("navigation").count()) errors.push("dashboard: menu shown to an account without the admin role");
if (!(await b.getByRole("button", { name: "Sair" }).count())) errors.push("dashboard: no sign-out button on the admins-only screen");
await b.screenshot({ path: `${out}accounts-4a-dash-not-admin.png` });
localSql(`UPDATE users SET role='admin' WHERE nickname='${admin}'`);
await b.reload({ waitUntil: "load" });
const menu = b.getByRole("navigation", { name: "Seções" });
await menu.waitFor({ timeout: API_WAIT });

/** The status pill of the application open in the dashboard (`data-status` carries the state code). */
const reviewStatus = (code) => b.locator(`.detail [data-status="${code}"]`).waitFor({ timeout: API_WAIT });
const application = b.getByRole("link", { name: new RegExp(`Associação Teste ${run}`) });
await application.click({ timeout: API_WAIT });
await b.getByRole("button", { name: "Iniciar análise" }).click({ timeout: API_WAIT });
await reviewStatus("under_review");
await b.getByLabel(/Mensagem para a organização/).fill("Envie o relatório de recursos de 2025, por favor.");
await b.getByRole("button", { name: "Pedir ajustes" }).click();
await reviewStatus("changes_requested");

// 3. Applicant (game) sees the note and resubmits.
await a.reload({ waitUntil: "load" });
await click(a.getByRole("button", { name: "Entrar na Vila" }));
await click(a.getByRole("button", { name: `Sua conta: ${nick}` }));
await click(a.getByRole("button", { name: "Minha candidatura de ONG" }));
if (!(await visible(a.getByText("Envie o relatório de recursos de 2025")))) errors.push("applicant: review note not shown");
// Sending again makes a new version (file changes made versions too, so the number is read, not assumed).
const { revision } = (await ownApplication(a)).application;
await click(a.getByRole("button", { name: "Editar e reenviar" }));
for (let i = 0; i < 3; i++) await click(a.getByRole("button", { name: "Continuar" }));
await click(a.getByRole("button", { name: "Enviar candidatura" }));
await a.getByText(`versão ${revision + 1}`, { exact: false }).waitFor({ timeout: API_WAIT });
if (filesOn && (await storedFiles(a)) !== "logo:image/png document:image/png") errors.push(`files: sending the application again changed its files ("${await storedFiles(a)}")`);

// 4. Admin (dashboard) approves the new version, only after ticking the three checks.
await b.getByRole("link", { name: "Voltar à lista" }).click();
await application.click({ timeout: API_WAIT });
await reviewStatus("submitted");
// 4a. The admin sees the files of the version under review: the logo previewed, the document only as a download.
await b.getByRole("heading", { name: "Arquivos", exact: true }).waitFor({ timeout: API_WAIT });
if (filesOn) {
  const logo = b.getByRole("img", { name: "Logo enviado pela organização" });
  if (!(await visible(logo)) || !(await logo.evaluate((img) => img.src.startsWith("blob:") && img.naturalWidth === 256))) errors.push("admin: no preview of the application's logo");
  if ((await b.locator('[data-file="document"]').count()) !== 1) errors.push("admin: the review does not list exactly the one document the application holds");
  const [download] = await Promise.all([b.waitForEvent("download", { timeout: API_WAIT }), b.getByRole("button", { name: "Baixar documento 1" }).click()]);
  if (download.suggestedFilename() !== "documento-1.png") errors.push(`admin: document 1 downloads as "${download.suggestedFilename()}"`);
  await download.cancel();
  if ((await b.locator(".detail").innerText()).includes(FILE_NAME)) errors.push("admin: a file name is shown in the review");
  await b.screenshot({ path: `${out}accounts-4a-admin-files.png`, fullPage: true });
} else if (!(await b.locator('[data-state="files-off"]').count())) errors.push("admin: no notice that file uploads are off in this API");
const approve = b.getByRole("button", { name: "Aprovar", exact: true });
if (!(await approve.isDisabled({ timeout: API_WAIT }))) errors.push("admin: approve enabled before the checks");
for (const label of ["CNPJ ativo (consultado na Receita Federal)", "Pelo menos 1 ano de existência", "Forma confiável de confirmar os recursos"]) await b.getByLabel(label).check();
await approve.click();
await reviewStatus("published");
await b.screenshot({ path: `${out}accounts-4-admin-approved.png`, fullPage: true });

// 4b. The read-only sections of the dashboard show what just happened, and no personal data beyond nicknames.
const lotLabel = `Terreno ${Number(lotValue.split("-")[1])}`;
await menu.getByRole("link", { name: "ONGs e terrenos" }).click();
if (!(await visible(b.getByRole("row").filter({ hasText: lotLabel }).filter({ hasText: `Associação Teste ${run}` })))) errors.push(`dashboard: ${lotLabel} does not show the approved organisation`);
await menu.getByRole("link", { name: "Auditoria" }).click();
if (!(await visible(b.getByRole("row").filter({ hasText: "ngo.approve" }).filter({ hasText: `@${admin}` }).first()))) errors.push("dashboard: the approval is not in the audit trail");
// Reading a document is on record, with the admin who read it.
if (filesOn && !(await visible(b.getByRole("row").filter({ hasText: "ngo.file_read" }).filter({ hasText: `@${admin}` }).first()))) errors.push("dashboard: the document download is not in the audit trail");
await menu.getByRole("link", { name: "Usuários" }).click();
if (!(await visible(b.getByRole("row").filter({ hasText: `@${admin}` }).filter({ hasText: "Administrador" })))) errors.push("dashboard: the admin is not in the users list");
if (/@example\.com|Pessoa (ong|out|adm)_/.test(await b.getByRole("main").innerText())) errors.push("dashboard: the users list shows an e-mail or a name");
await b.screenshot({ path: `${out}accounts-4b-dash-users.png`, fullPage: true });

// 5. The house is public: /lots names the NGO, and the village draws its chalet.
const lots = await (await fetch(`${apiUrl}/lots`)).json();
const lot = lots.lots.find((l) => l.id === lotValue);
if (lot?.state !== "published" || !lot.ngo_name?.includes(run)) errors.push(`public: lot ${lotValue} not published (${JSON.stringify(lot)})`);
if (filesOn && !lot?.ngo_logo) errors.push(`public: lot ${lotValue} has no logo path`);
// Close the applicant and admin pages first: three software-rendered WebGL canvases at once starve the
// renderer here (frame p95 over 300 ms on SwiftShader) and the final screenshot times out.
// Only the pages close: steps 6 and 7 reuse the two contexts for their session cookies.
await a.close();
await b.close();
const c = await newPage("visitor");
await c.waitForTimeout(3000);
await c.screenshot({ path: `${out}accounts-5-village.png` });
if (filesOn) {
  // 5b. A visitor walks to the front of the house (5.5 u from the lot's centre) and opens it: the logo is there.
  const angle = (2 * Math.PI * (Number(lotValue.split("-")[1]) - 1)) / 8 + Math.PI / 8;
  await c.evaluate(([x, z]) => window.__vila.walkTo(x, z), [16.5 * Math.cos(angle), 16.5 * Math.sin(angle)]);
  const enter = c.getByRole("button", { name: /Ver terreno/ });
  if (!(await visible(enter, 90000))) errors.push("visitor: did not reach the published lot");
  else {
    await click(enter);
    const logo = c.getByRole("dialog", { name: `Associação Teste ${run}` }).getByRole("img", { name: `Logo de Associação Teste ${run}` });
    if (!(await visible(logo)) || !(await logo.evaluate((img) => img.src.startsWith("blob:") && img.naturalWidth === 256))) errors.push("visitor: the published lot panel does not show the logo");
    await c.screenshot({ path: `${out}accounts-5b-lot-logo.png` });
  }
}
await c.context().close();

// 6. The game no longer reviews: with the same session (the cookie belongs to the API host), an admin gets a
// plain link to the dashboard in the account panel.
const ga = await newPage("admin (game)", b.context());
await click(ga.getByRole("button", { name: `Sua conta: ${admin}` }));
const toDash = ga.getByRole("link", { name: "Abrir painel administrativo" });
if (!(await visible(toDash))) errors.push("game: admins have no link to the dashboard");
else {
  const [href, target, rel] = await Promise.all(["href", "target", "rel"].map((attr) => toDash.getAttribute(attr)));
  if (new URL(href).origin !== new URL(dashUrl).origin) errors.push(`game: the dashboard link points to ${href}`);
  if (target !== "_blank" || !/\bnoopener\b/.test(rel ?? "")) errors.push(`game: the dashboard link must open a new tab with rel=noopener (target=${target}, rel=${rel})`);
}
if (await ga.getByRole("button", { name: "Análise de ONGs" }).count()) errors.push("game: the admin review is still in the game");
await ga.close();
// 7. The applicant, who is not an admin, has no such link.
const ap = await newPage("applicant (game)", a.context());
await click(ap.getByRole("button", { name: `Sua conta: ${nick}` }));
await ap.getByRole("button", { name: "Minha candidatura de ONG" }).waitFor({ timeout: API_WAIT });
if (await ap.getByRole("link", { name: "Abrir painel administrativo" }).count()) errors.push("game: the dashboard link is shown to a non-admin");
if (filesOn) {
  // 7b. Published: the applicant still sees the files and can read them, but no longer change them.
  await click(ap.getByRole("button", { name: "Minha candidatura de ONG" }));
  const files = filesOf(ap);
  if (!(await visible(files.getByText(/os arquivos não podem mais ser alterados/)))) errors.push("files: no note that a published application's files are frozen");
  if (!(await visible(files.getByRole("img", { name: "Logo enviado" }))) || !(await visible(files.getByRole("button", { name: "Baixar documento 1" })))) errors.push("files: a published application does not show its files");
  if ((await files.locator('input[type="file"]').count()) || (await files.getByRole("button", { name: /Remover/ }).count())) errors.push("files: a published application still offers to change its files");
  await ap.screenshot({ path: `${out}accounts-7b-files-frozen.png` });
}

await browser.close();
if (errors.length) {
  console.error(rateLimited ? "rate limited: wait 60 s and run again (the API allows 10 /auth/* requests per 60 s per IP)" : "failed");
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — accounts flow (lot ${lotValue}); screenshots in ${out}`);
