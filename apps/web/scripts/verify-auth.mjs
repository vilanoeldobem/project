/** Local-only account smoke test. Run after local migrations, build and wrangler dev. */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const origin = new URL(process.argv[2] ?? "http://localhost:8787");
assert(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "This test only runs locally");
const directory = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
const files = readdirSync(directory).filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
assert.equal(files.length, 1, "Expected one local D1 database after migrations");
const db = new DatabaseSync(new URL(files[0], directory), { readOnly: true });
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : { channel: "chrome" }),
  env: { ...process.env, TMPDIR: "/tmp" },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--renderer-process-limit=2"],
});
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low" })));
    const suffix = `${Date.now()}${name === "desktop" ? "d" : "m"}`;
    const email = `auth-${suffix}@example.test`;
    const nickname = `test_${suffix}`;
    const link = () => {
      const row = db.prepare("SELECT link FROM auth_local_outbox WHERE recipient = ? ORDER BY created_at DESC LIMIT 1").get(email);
      assert(row, "Expected a local test email");
      return row.link;
    };
    await page.goto(origin.href);
    await page.getByRole("button", { name: "Criar conta ou entrar" }).click();
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Pessoa de Teste");
    await page.getByLabel("Nickname", { exact: true }).fill(nickname);
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade de Teste");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.screenshot({ path: `${out}auth-${name}-signup.png` });
    await page.getByRole("button", { name: "Receber link de acesso" }).click();
    await page.getByText("Abra o link neste mesmo navegador", { exact: false }).waitFor();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_users WHERE email = ?").get(email).n, 0);
    const signupLink = link();
    // Same-document navigation must capture the fragment too, without consuming the link.
    await page.evaluate((value) => { window.location.hash = new URL(value).hash; }, signupLink);
    await page.getByRole("button", { name: "Confirmar acesso", exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_users WHERE email = ?").get(email).n, 0);
    await page.getByRole("button", { name: "Confirmar acesso", exact: true }).click();
    await page.getByText("Seu e-mail está verificado.", { exact: false }).waitFor();
    const session = (await context.cookies()).find((cookie) => cookie.name === "vila_session");
    assert(session?.httpOnly && session.sameSite === "Lax");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_local_outbox WHERE recipient = ?").get(email).n, 0);
    await page.screenshot({ path: `${out}auth-${name}-verified.png` });
    await page.reload();
    await page.getByRole("button", { name: "Criar conta ou entrar" }).click();
    await page.getByText("Seu e-mail está verificado.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await page.getByRole("button", { name: "Já tenho conta", exact: true }).waitFor();
    assert(!(await context.cookies()).some((cookie) => cookie.name === "vila_session"));
    await page.goto(signupLink);
    await page.getByRole("button", { name: "Confirmar acesso", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Esse link expirou" }).waitFor();
    await page.getByRole("button", { name: "Pedir outro link" }).click();
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Receber link de acesso" }).click();
    await page.getByText("Abra o link neste mesmo navegador", { exact: false }).waitFor();
    await page.goto(link());
    await page.getByRole("button", { name: "Confirmar acesso", exact: true }).click();
    await page.getByText("Seu e-mail está verificado.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await page.getByRole("button", { name: "Já tenho conta", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok — ${name}: signup, confirmation, persisted session, logout, replay rejection, login`);
  }
} finally {
  await browser.close();
  db.close();
}
