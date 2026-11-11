/**
 * verify-accounts.mjs — real-browser check of 0.4.0 (IMPL-0011) against LOCAL Workers only:
 * sign-up with the magic link (dev link), progress sync, NGO application (4 steps), admin review
 * (changes requested → resubmit → approve) and the published house on the lot. Fails on console errors.
 *
 * Needs: `pnpm --filter @vila/api dev` (ACCOUNTS_ENABLED=true, ENVIRONMENT=development), server and client
 * running locally. The admin role is granted with `wrangler d1 execute --local` (never remote).
 *
 * Usage: node scripts/verify-accounts.mjs [client=http://localhost:8799] [api=http://localhost:8787]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const [url = "http://localhost:8799", apiUrl = "http://localhost:8787"] = process.argv.slice(2);
if (!/localhost|127\.0\.0\.1/.test(url + apiUrl)) {
  console.error("local only (creates accounts and grants admin)");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const run = Date.now().toString(36);
const errors = [];

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

// Local only: drop applications left by earlier runs of this script (they would use up the 8 lots).
const apiDirEarly = new URL("../../api/", import.meta.url).pathname;
execFileSync(
  `${apiDirEarly}node_modules/.bin/wrangler`,
  [
    "d1", "execute", "vilanoeldobem", "--local", "--command",
    "UPDATE lots SET state = 'available', ngo_id = NULL WHERE ngo_id IN (SELECT id FROM ngos WHERE name LIKE 'Associação Teste %'); " +
      "DELETE FROM audit_events WHERE subject IN (SELECT 'ngo:' || id FROM ngos WHERE name LIKE 'Associação Teste %'); " +
      "DELETE FROM ngos WHERE name LIKE 'Associação Teste %';",
  ],
  { cwd: apiDirEarly, stdio: "pipe" }
);

process.on("unhandledRejection", async (e) => {
  console.error(e);
  for (const [i, ctx] of browser.contexts().entries()) for (const p of ctx.pages()) await p.screenshot({ path: `${out}accounts-fail-${i}.png` }).catch(() => {});
  process.exit(1);
});
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function newPage(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Entrar na Vila" }).dispatchEvent("click");
  return page;
}

const click = (locator) => locator.dispatchEvent("click");

async function signUp(page, nickname, email) {
  await click(page.getByRole("button", { name: "Entrar ou criar conta" }));
  await page.getByLabel("Nome *").fill(`Pessoa ${nickname}`);
  await page.getByLabel("Nickname *").fill(nickname);
  await page.getByLabel("Cidade *").fill("Recife");
  await page.getByLabel("E-mail *").fill(email);
  await click(page.getByRole("button", { name: "Criar conta", exact: true }));
  const link = await page.getByRole("link", { name: /Abrir link/ }).getAttribute("href", { timeout: 15000 });
  await page.goto(link, { waitUntil: "load" });
  await page.getByRole("button", { name: `Sua conta: ${nickname}` }).waitFor({ timeout: 20000 });
  if (new URL(page.url()).searchParams.has("login")) errors.push(`${nickname}: login token left in the address bar`);
}

// 1. Applicant: local progress first, then sign-up (progress migrates), then the application.
const a = await newPage("applicant");
await a.evaluate(() => window.__vila.walkTo(-10, 6));
await a.waitForFunction(() => window.__vila.progress().seen["explore-gifts:gift-bench"], null, { timeout: 90000 }).catch(() => errors.push("applicant: gift not collected"));
const nick = `ong_${run}`;
await signUp(a, nick, `${nick}@example.com`);
// The sync runs right after sign-in (in the background): wait for the server to have the local event.
await a
  .waitForFunction(
    async (api) => (await (await fetch(`${api}/progress`, { credentials: "include" })).json()).progress?.seen?.["explore-gifts:gift-bench"] === true,
    apiUrl,
    { timeout: 20000, polling: 500 }
  )
  .catch(() => errors.push("applicant: local progress not migrated to the server"));
await a.screenshot({ path: `${out}accounts-1-signed-in.png` });

await click(a.getByRole("button", { name: `Sua conta: ${nick}` }));
await click(a.getByRole("button", { name: "Minha candidatura de ONG" }));
await a.getByLabel("Nome da organização *").fill(`Associação Teste ${run}`);
await a.getByLabel(/^CNPJ \*/).fill(cnpj());
await a.getByLabel("Data de abertura do CNPJ *").fill("2019-05-20");
await a.getByLabel("Cidade da sede *").fill("Olinda");
await click(a.getByRole("button", { name: "Continuar" }));
// Step 2 must refuse to continue without the three declarations.
await click(a.getByRole("button", { name: "Continuar" }));
if (!(await a.getByText("Confirme os três requisitos").isVisible())) errors.push("applicant: declarations not enforced");
for (const label of ["CNPJ ativo", "Pelo menos 1 ano de existência", "Forma confiável de confirmar os recursos recebidos"]) await a.getByLabel(label).check();
await a.getByLabel("Como os recursos podem ser confirmados? *").fill("Extratos mensais da conta da organização e relatório conciliável.");
await click(a.getByRole("button", { name: "Continuar" }));
await a.getByLabel("Resumo (aparece na casa) *").fill("Oficinas de leitura para crianças do bairro.");
await a.getByLabel("Sobre a organização *").fill("Atendemos crianças de 6 a 12 anos com reforço escolar, leitura e atividades culturais no contraturno escolar.");
await click(a.getByRole("button", { name: "Crianças" }));
await click(a.getByRole("button", { name: "Educação" }));
await click(a.getByRole("button", { name: "Continuar" }));
const lotValue = await a.getByLabel("Terreno desejado *").locator("option").nth(1).getAttribute("value");
await a.getByLabel("Terreno desejado *").selectOption(lotValue);
await a.screenshot({ path: `${out}accounts-2-review-step.png` });
await click(a.getByRole("button", { name: "Enviar candidatura" }));
await a.getByRole("dialog").getByText("Candidatura enviada", { exact: true }).first().waitFor({ timeout: 15000 });
await a.screenshot({ path: `${out}accounts-3-submitted.png` });

// 2. Admin: sign up, get the role locally, review.
const b = await newPage("admin");
const admin = `adm_${run}`;
await signUp(b, admin, `${admin}@example.com`);
const apiDir = new URL("../../api/", import.meta.url).pathname;
execFileSync(`${apiDir}node_modules/.bin/wrangler`, ["d1", "execute", "vilanoeldobem", "--local", "--command", `UPDATE users SET role='admin' WHERE nickname='${admin}'`], {
  cwd: apiDir,
  stdio: "pipe",
});
await b.reload({ waitUntil: "load" });
await click(b.getByRole("button", { name: "Entrar na Vila" }));
await click(b.getByRole("button", { name: `Sua conta: ${admin}` }));
await click(b.getByRole("button", { name: "Análise de ONGs" }));
await click(b.getByRole("button", { name: new RegExp(`Associação Teste ${run}`) }));
await click(b.getByRole("button", { name: "Iniciar análise" }));
await b.getByRole("dialog").getByText("Em análise", { exact: true }).first().waitFor({ timeout: 15000 });
await b.getByLabel(/Mensagem para a organização/).fill("Envie o relatório de recursos de 2025, por favor.");
await click(b.getByRole("button", { name: "Pedir ajustes" }));
await b.getByRole("dialog").getByText("Ajustes solicitados", { exact: true }).first().waitFor({ timeout: 15000 });

// 3. Applicant sees the note and resubmits.
await a.reload({ waitUntil: "load" });
await click(a.getByRole("button", { name: "Entrar na Vila" }));
await click(a.getByRole("button", { name: `Sua conta: ${nick}` }));
await click(a.getByRole("button", { name: "Minha candidatura de ONG" }));
if (!(await a.getByText("Envie o relatório de recursos de 2025").isVisible({ timeout: 10000 }).catch(() => false))) errors.push("applicant: review note not shown");
await click(a.getByRole("button", { name: "Editar e reenviar" }));
for (let i = 0; i < 3; i++) await click(a.getByRole("button", { name: "Continuar" }));
await click(a.getByRole("button", { name: "Enviar candidatura" }));
await a.getByText(/versão 2/).waitFor({ timeout: 15000 });

// 4. Admin approves (only after ticking the three checks).
await click(b.getByRole("button", { name: "Voltar à lista" }));
await click(b.getByRole("button", { name: new RegExp(`Associação Teste ${run}`) }));
if (!(await b.getByRole("button", { name: "Aprovar", exact: true }).isDisabled())) errors.push("admin: approve enabled before the checks");
for (const label of ["CNPJ ativo (consultado na Receita Federal)", "Pelo menos 1 ano de existência", "Forma confiável de confirmar os recursos"]) await b.getByLabel(label).check();
await click(b.getByRole("button", { name: "Aprovar", exact: true }));
await b.getByRole("dialog").getByText("Aprovada e publicada", { exact: true }).first().waitFor({ timeout: 15000 });
await b.screenshot({ path: `${out}accounts-4-admin-approved.png` });

// 5. The house is public: /lots names the NGO, and the village draws its chalet.
const lots = await (await fetch(`${apiUrl}/lots`)).json();
const lot = lots.lots.find((l) => l.id === lotValue);
if (lot?.state !== "published" || !lot.ngo_name?.includes(run)) errors.push(`public: lot ${lotValue} not published (${JSON.stringify(lot)})`);
const c = await newPage("visitor");
await c.waitForTimeout(3000);
await c.screenshot({ path: `${out}accounts-5-village.png` });

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — accounts flow (lot ${lotValue}); screenshots in ${out}`);
