/** Local-only progress smoke: migrate a guest, recover on another browser, isolate accounts. */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { MISSIONS } from "@vila/shared/game/progress";
import { chromium } from "playwright-core";

const client = new URL(process.argv[2] ?? "http://localhost:8799");
const api = new URL(process.argv[3] ?? "http://localhost:8787");
for (const url of [client, api]) assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local origins only");
assert.notEqual(client.origin, api.origin, "Use separate client and API origins");
assert((await (await fetch(`${api.origin}/auth/session`)).json()).available, "Enable local authentication first");
const directory = new URL("../../api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
const files = readdirSync(directory).filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
assert.equal(files.length, 1, "Expected one local API D1 database");
const db = new DatabaseSync(new URL(files[0], directory), { readOnly: true });
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const reward = MISSIONS.find((mission) => mission.id === "causes-global-donation").xp;
const suffix = Date.now();
const emailA = `progress-a-${suffix}@example.test`;
const emailB = `progress-b-${suffix}@example.test`;
const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : { channel: "chrome" }),
  env: { ...process.env, TMPDIR: "/tmp" },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--renderer-process-limit=2"],
});
const pages = [];
function stored(email) {
  const row = db.prepare("SELECT p.state_json FROM player_progress p JOIN auth_users u ON u.id = p.user_id WHERE u.email = ?").get(email);
  assert(row, "Expected persisted account progress");
  return JSON.parse(row.state_json);
}
async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await page.goto(client.href);
  return page;
}
async function account(page) {
  await page.keyboard.press("Escape");
  const welcome = page.getByRole("dialog", { name: "Boas-vindas" });
  if (await welcome.isVisible()) await welcome.getByRole("button", { name: "Entrar na Vila", exact: true }).click();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
}
async function authenticate(page, email, nickname) {
  await account(page);
  if (nickname) {
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Pessoa de Teste");
    await page.getByLabel("Nickname", { exact: true }).fill(nickname);
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade de Teste");
  }
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await page.getByText("Abra o link neste mesmo navegador", { exact: false }).waitFor();
  const row = db.prepare("SELECT link FROM auth_local_outbox WHERE recipient = ? ORDER BY rowid DESC LIMIT 1").get(email);
  assert(row, "Expected a local verification fixture");
  assert.equal(new URL(row.link).origin, client.origin);
  await page.goto(row.link);
  await page.getByRole("button", { name: "Confirmar acesso", exact: true }).click();
  await saved(page);
}
async function saved(page) {
  await page.getByText("Missões e XP salvos na sua conta.", { exact: true }).waitFor({ timeout: 30000 });
}
async function donationPanel(page) {
  await page.keyboard.press("Escape");
  const welcome = page.getByRole("dialog", { name: "Boas-vindas" });
  if (!await welcome.isVisible()) await page.getByRole("button", { name: "Início", exact: true }).click();
  await welcome.getByRole("button", { name: /Doação global/ }).click();
  await page.getByRole("heading", { name: "Doação global", exact: true }).waitFor();
}
async function logout(page) {
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await page.getByRole("button", { name: "Já tenho conta", exact: true }).waitFor();
}
try {
  const a = await newPage({ width: 1440, height: 900 });
  await donationPanel(a);
  await a.waitForFunction((xp) => JSON.parse(localStorage.getItem("vila.progress.v2") ?? "null")?.xp === xp, reward);
  await authenticate(a, emailA, `prog_a_${suffix}`);
  assert.equal(stored(emailA).xp, reward);
  assert.equal(stored(emailA).completed["causes-global-donation"], true);
  await a.screenshot({ path: `${out}progress-desktop-account.png` });
  await a.reload();
  await account(a);
  await saved(a);
  assert.equal(stored(emailA).xp, reward);
  await donationPanel(a);
  await account(a);
  await saved(a);
  assert.equal(stored(emailA).xp, reward, "Reopening a completed mission must not add XP");
  await logout(a);
  assert.equal(await a.evaluate(() => JSON.parse(localStorage.getItem("vila.progress.v2") ?? "null")?.xp), reward);
  await a.context().close();
  const b = await newPage({ width: 390, height: 844 });
  await authenticate(b, emailA);
  assert.equal(stored(emailA).xp, reward);
  await b.keyboard.press("Escape");
  assert.match(await b.getByRole("button", { name: "Abrir Caderno de Missões" }).textContent(), /Missões\s*1\/4/);
  await account(b);
  await saved(b);
  await b.screenshot({ path: `${out}progress-mobile-recovered.png` });
  await logout(b);
  await b.keyboard.press("Escape");
  await b.waitForFunction(() => document.querySelector(".hud__missions")?.textContent.includes("Missões 0/4"));
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem("vila.progress.v2") ?? "null")?.xp ?? 0), 0);
  await authenticate(b, emailB, `prog_b_${suffix}`);
  assert.equal(stored(emailB).xp, 0, "Another account must not inherit the previous account's progress");
  assert.equal(stored(emailA).xp, reward);
  await logout(b);
  assert.deepEqual(errors, []);
  console.log("ok — guest import, persisted reload, duplicate reward rejection, independent browser recovery, logout and account isolation");
} catch (error) {
  for (let index = 0; index < pages.length; index++) {
    if (!pages[index].isClosed()) await pages[index].screenshot({ path: `${out}progress-failure-${index + 1}.png` }).catch(() => {});
  }
  // Error details can include a credential-bearing navigation URL; keep terminal output sanitized.
  console.error(`Progress browser verification failed (${error instanceof Error ? error.name : "unknown"}); inspect progress-failure screenshots.`);
  process.exitCode = 1;
} finally {
  await browser.close();
  db.close();
}
