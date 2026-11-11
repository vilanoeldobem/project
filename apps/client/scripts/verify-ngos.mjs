/** Local-only, real-UI proposal and review smoke; all fixture writes stay in local D1. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const client = new URL(process.argv[2] ?? "http://localhost:8799");
const api = new URL(process.argv[3] ?? "http://localhost:8787");
for (const url of [client, api]) assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local origins only");
assert.notEqual(client.origin, api.origin);
assert((await (await fetch(`${api.origin}/auth/session`)).json()).available, "Enable local authentication first");
const adminId = "88ff0000-0000-4000-8000-000000000004"; // Launch local API with ADMIN_USER_IDS set to this fixture UUID.
const directory = new URL("../../api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
const files = readdirSync(directory).filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
assert.equal(files.length, 1);
const db = new DatabaseSync(new URL(files[0], directory));
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
assert(!db.prepare("SELECT id FROM auth_users WHERE id = ?").get(adminId), "Fixture reviewer already exists; preserve it and stop");
const suffix = Date.now();
const email = `ngo-owner-${suffix}@example.test`;
const name = `Organização de teste local ${suffix}`;
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const now = Math.floor(Date.now() / 1000);
const lot = db.prepare("SELECT id FROM lots WHERE state = 'available' AND ngo_id IS NULL ORDER BY slot LIMIT 1").get();
assert(lot, "Need one available local lot");
const cnpjBase = String(suffix).slice(-12).padStart(12, "0");
function checkDigit(base) { let weight = base.length - 7; const sum = [...base].reduce((s, n) => { const next = s + Number(n) * weight; weight = weight === 2 ? 9 : weight - 1; return next; }, 0); return sum % 11 < 2 ? "0" : String(11 - sum % 11); }
const first = cnpjBase + checkDigit(cnpjBase);
const cnpj = first + checkDigit(first);
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
let browser;
let reviewerCreated = false;
const pages = [];
const errors = [];
function application() { return db.prepare("SELECT a.id, a.ngo_id, n.status, n.revision FROM ngo_applications a JOIN ngos n ON n.id=a.ngo_id JOIN auth_users u ON u.id=a.owner_id WHERE u.email = ?").get(email); }
async function pageFor(context) {
  const page = await context.newPage(); pages.push(page);
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(client.href); return page;
}
async function account(page) {
  await page.keyboard.press("Escape");
  const welcome = page.getByRole("dialog", { name: "Boas-vindas" });
  if (await welcome.isVisible()) await welcome.getByRole("button", { name: "Entrar na Vila", exact: true }).click();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
}
async function ownerList(page) { await account(page); await page.getByRole("button", { name: "Minhas candidaturas", exact: true }).click(); await page.getByRole("button", { name: "Atualizar lista", exact: true }).waitFor(); }
async function reviewDetail(page) {
  await ownerList(page); await page.getByRole("button", { name: "Revisar candidaturas", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Ver candidatura" }).click();
}
async function status(page, value) { await page.getByRole("listitem").filter({ hasText: name }).getByText(value, { exact: true }).waitFor(); }
try {
  db.prepare("INSERT INTO auth_users (id,email,name,nickname,city,verified_at) VALUES (?,?,?,?,?,?)").run(adminId, `ngo-reviewer-${suffix}@example.test`, "Pessoa revisora de teste", `review_${suffix}`, "Cidade de teste", now);
  reviewerCreated = true;
  db.prepare("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").run(hash, adminId, now + 3600);
  browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : { channel: "chrome" }), env: { ...process.env, TMPDIR: "/tmp" }, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--renderer-process-limit=2"] });
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reviewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const context of [owner, reviewer]) await context.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await reviewer.addCookies([{ name: "vila_session", value: token, url: api.origin, httpOnly: true, sameSite: "Lax" }]);
  let page = await pageFor(owner); await account(page);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Pessoa de teste");
  await page.getByLabel("Nickname", { exact: true }).fill(`ngo_${suffix}`);
  await page.getByLabel("Cidade", { exact: true }).fill("Cidade de teste");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await page.getByText("Abra o link neste mesmo navegador", { exact: false }).waitFor();
  const row = db.prepare("SELECT link FROM auth_local_outbox WHERE recipient=? ORDER BY rowid DESC LIMIT 1").get(email);
  assert(row); assert.equal(new URL(row.link).origin, client.origin);
  await page.goto(row.link); await page.getByRole("button", { name: "Confirmar acesso", exact: true }).click();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).waitFor();
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Explorar ONGs", exact: true }).click();
  const publicLot = page.getByRole("listitem").filter({ hasText: `Terreno ${Number(lot.id.split("-")[1])}` }).first();
  await publicLot.getByRole("button", { name: "Ver terreno", exact: true }).click();
  await page.getByRole("button", { name: "Candidatar minha ONG" }).click();
  await page.getByLabel("Nome da organização", { exact: true }).fill(name);
  await page.getByLabel("CNPJ", { exact: true }).fill(cnpj);
  await page.getByLabel("Data de abertura", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await page.getByText("Esta versão não coleta arquivos", { exact: false }).waitFor();
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await page.getByLabel("Apresentação da organização", { exact: false }).fill("Causa sintética para verificar o fluxo local de candidatura.");
  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await page.getByRole("button", { name: "Enviar candidatura", exact: true }).click();
  await status(page, "Candidatura enviada");
  assert.equal(application().status, "submitted"); assert.equal(db.prepare("SELECT state FROM lots WHERE id=?").get(lot.id).state, "available");
  assert.equal(await page.getByRole("button", { name: "Revisar candidaturas", exact: true }).count(), 0, "Owner must not see reviewer controls");
  await page.screenshot({ path: `${out}ngo-owner-submitted.png` }); await page.close();
  page = await pageFor(reviewer); await reviewDetail(page);
  await page.getByRole("button", { name: "Iniciar análise", exact: true }).click(); await status(page, "Em análise");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Ver candidatura" }).click();
  await page.getByLabel("Retorno para a organização").fill("Detalhe o trabalho realizado pela organização no resumo.");
  await page.getByRole("button", { name: "Solicitar ajustes", exact: true }).click(); await status(page, "Ajustes solicitados"); await page.close();
  page = await pageFor(owner); await ownerList(page);
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Ver candidatura" }).click();
  await page.getByText("Detalhe o trabalho realizado pela organização no resumo.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Ajustar e reenviar" }).click();
  await page.getByRole("button", { name: "Próxima etapa" }).click(); await page.getByRole("button", { name: "Próxima etapa" }).click();
  await page.getByLabel("Apresentação da organização", { exact: false }).fill("Apresentação sintética revisada com atividades comunitárias locais.");
  await page.getByRole("button", { name: "Próxima etapa" }).click(); await page.getByRole("button", { name: "Reenviar candidatura" }).click();
  await status(page, "Candidatura enviada"); assert.equal(application().revision, 4); await page.close();
  page = await pageFor(reviewer); await reviewDetail(page); await page.getByRole("button", { name: "Iniciar análise" }).click(); await status(page, "Em análise");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Ver candidatura" }).click();
  assert(await page.getByRole("button", { name: "Aprovar e publicar casa" }).isDisabled());
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  const freshLots = page.waitForResponse((response) => new URL(response.url()).origin === api.origin && new URL(response.url()).pathname === "/lots");
  await page.getByRole("button", { name: "Aprovar e publicar casa" }).click(); await status(page, "Casa publicada");
  assert.equal((await (await freshLots).json()).lots.find((item) => item.id === lot.id)?.ngo_name, name, "Same-page public refresh must bypass the pre-approval cache");
  assert.equal(application().status, "published"); assert.equal(db.prepare("SELECT ngo_id FROM lots WHERE id=? AND state='published'").get(lot.id).ngo_id, application().ngo_id);
  assert.equal(db.prepare("SELECT count(*) AS count FROM audit_events WHERE subject=?").get(`ngo:${application().ngo_id}`).count, 4);
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Explorar ONGs", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Ver terreno" }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.getByText("Apresentação sintética revisada com atividades comunitárias locais.", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Doar para esta ONG", exact: true }).isDisabled());
  await page.screenshot({ path: `${out}ngo-mobile-published.png` }); assert.deepEqual(errors, []);
  console.log("ok — applicant submission, restricted reviewer access, adjustments, resubmission, manual approval, audit and public lot refresh");
} catch (error) {
  for (let index = 0; index < pages.length; index++) if (!pages[index].isClosed()) await pages[index].screenshot({ path: `${out}ngo-failure-${index + 1}.png` }).catch(() => {});
  console.error(`NGO browser verification failed (${error instanceof Error ? error.name : "unknown"}); inspect ngo-failure screenshots.`); process.exitCode = 1;
} finally {
  await browser?.close();
  const fixture = application();
  if (fixture) {
    db.prepare("UPDATE lots SET state='available',ngo_id=NULL WHERE id=? AND ngo_id=?").run(lot.id, fixture.ngo_id);
    db.prepare("DELETE FROM audit_events WHERE subject=?").run(`ngo:${fixture.ngo_id}`);
    db.prepare("DELETE FROM ngo_applications WHERE id=?").run(fixture.id);
    db.prepare("DELETE FROM ngos WHERE id=?").run(fixture.ngo_id);
  }
  db.prepare("DELETE FROM auth_users WHERE email=?").run(email);
  if (reviewerCreated) db.prepare("DELETE FROM auth_users WHERE id=?").run(adminId);
  db.prepare("DELETE FROM auth_links WHERE email=?").run(email);
  db.prepare("DELETE FROM auth_local_outbox WHERE recipient=?").run(email);
  db.close();
}
