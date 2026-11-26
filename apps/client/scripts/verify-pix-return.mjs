// GAME-01: run the compiled game in Chromium, with a synthetic mailbox and payment API.
// Build with: pnpm --filter @vila/client exec vite build --mode workers
// Then run: CHROMIUM_PATH=/usr/bin/chromium node apps/client/scripts/verify-pix-return.mjs
// All pages, HTTP requests and WebSockets are intercepted. No server, account, provider or token is needed.
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const game = "http://localhost:8799";
const api = "http://localhost:8787";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const first = { id: "fixture-a", nickname: "TesteA", name: "Pessoa A", email: "a@example.invalid", city: "Vila", role: "player" };
const second = { ...first, id: "fixture-b", nickname: "TesteB", email: "b@example.invalid" };
const a = { id: "ngo-a", name: "ONG Alfa de Teste" };
const b = { id: "ngo-b", name: "ONG Beta de Teste" };
const plaza = "plaza-01";
const partner = "Parceira Global de Teste";
const terms = { enabled: true, ngoPercentBps: 9000, fixedFeeCents: 80, minAmountCents: 200 };
const progress = { xp: 0, counters: {}, completed: {}, seen: {} };

await access(resolve(dist, "index.html"));
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }),
  env: { ...process.env, TMPDIR: "/tmp" },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--renderer-process-limit=2", "--disable-background-networking"],
});

async function withProfile(name, state, run) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 680 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  try {
    const pageErrors = [];
    ctx.on("page", p => p.on("pageerror", e => pageErrors.push(e.message)));
    ctx.setDefaultTimeout(25000);
    await ctx.addInitScript(origin => {
      if (location.origin === origin) localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false }));
    }, game);
    await ctx.routeWebSocket("**/*", socket => socket.close());
    await ctx.route("**/*", async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === game) {
        const file = resolve(dist, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
        if (!file.startsWith(resolve(dist) + sep) || req.method() !== "GET") return route.abort();
        return route.fulfill({ path: file }).catch(() => route.fulfill({ status: 404, body: "" }));
      }
      if (url.origin !== api) return route.abort();
      const headers = { "access-control-allow-origin":game, "access-control-allow-credentials":"true",
        "access-control-allow-methods":"GET, POST, OPTIONS", "access-control-allow-headers":"content-type, x-vila-account",
        "cache-control":"no-store" };
      const answer = (json, status = 200) => route.fulfill({ status, headers, json });
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = url.pathname;
      if (path === "/config") return answer({ accounts: true, donations: true });
      if (path === "/me") return answer({ user: state.user });
      if (path === "/progress" || path === "/progress/events") return answer({ progress });
      if (path === "/lots") return answer({ lots: [{ id: plaza, state: "published", ngo_id: state.tenant.id, ngo_name: state.tenant.name, ngo_summary: "Causa fictícia" }] });
      if (path === "/ngo/application") return answer({ application: null });
      if (path === "/residential-plots") return answer({ enabled: false, plots: [] });
      if (path === "/donations/config") return answer({ global: { ...terms, recipientName: partner } });
      if (path === `/ngos/${state.tenant.id}/donation-info`) return answer({ ...terms, ngoId: state.tenant.id, name: state.tenant.name,
        method: "abacatepay", confirmedDonations: 0, confirmedAmountCents: 0 });
      if (path === `/ngos/${state.tenant.id}`) return answer({ ngo: { id: state.tenant.id, name: state.tenant.name, photos: [] } });
      if (path === "/auth/link") {
        const token = crypto.randomUUID();
        state.mailbox.set(token, req.postDataJSON().email === second.email ? second : first);
        return answer({ ok: true, devLink: game + "/#login=" + token });
      }
      if (path === "/auth/verify") {
        const { token } = req.postDataJSON();
        if (!state.mailbox.has(token)) return answer({ error: "invalid_token" }, 400);
        state.user = state.mailbox.get(token);
        state.mailbox.delete(token);
        return answer({ user: state.user });
      }
      if (path === "/donations/pix" && req.method() === "POST") {
        const body = req.postDataJSON();
        state.posts.push({ ...body, user: state.user?.id });
        if (!state.user) return answer({ error: "not_signed_in" }, 401);
        if (body.accountId !== state.user.id) return answer({ error: "account_changed" }, 409);
        let charge = state.issued.get(body.idempotencyKey);
        if (!charge) {
          charge = {
            id: "fixture-pix-" + (state.issued.size + 1),
            targetKind: body.targetKind,
            ngoId: body.ngoId ?? null,
            recipientName: body.targetKind === "global" ? partner : state.tenant.name,
            amountCents: body.amountCents,
            ngoPercentBps: terms.ngoPercentBps, fixedFeeCents: terms.fixedFeeCents,
            ngoShareCents: 1030, vilaShareCents: 204,
            status: "pending", brCode: "FIXTURE-LOCAL-SEM-VALOR", brCodeBase64: null,
            receiptUrl: null, expiresAt: null, devMode: false, titleCredited: false,
            paidAt: null, createdAt: new Date().toISOString(),
          };
          state.issued.set(body.idempotencyKey, charge);
        }
        if (state.dropNext) {
          state.dropNext = false;
          return route.abort("connectionfailed"); // Issued by the fake provider, response lost on the way back.
        }
        return answer({ donation: charge });
      }
      return answer({ error: "not_found" }, 404);
    });
    await run(ctx, state);
    assert.deepEqual(pageErrors, [], "application errors");
  } catch (error) {
    for (const p of ctx.pages()) console.error(name, await p.locator("body").innerText().catch(() => "Page closed"));
    throw error;
  } finally { await ctx.close(); }
}

async function scenario(name, run) {
  const state = { user: null, tenant: a, mailbox: new Map(), posts: [], issued: new Map(), dropNext: false };
  await withProfile(name, state, run);
  console.log(`PASS ${name}: ${state.posts.length} POST(s), ${state.issued.size} distinct charge(s).`);
}

async function open(ctx, href = game) {
  assert.equal(new URL(href).origin, game);
  const page = await ctx.newPage();
  await page.goto(href);
  await page.getByRole("button", { name: "Menu", exact: true }).waitFor();
  return page;
}

async function openDestination(page, target) {
  if (target === "global") await page.getByRole("button", { name:"Doação global", exact:true }).click();
  else {
    // Existing loopback-only QA hook opens the same house panel as reaching plaza-01 from the square.
    await page.waitForFunction(() => typeof window.__vila?.extra.panel === "function");
    await page.evaluate(lot => window.__vila.extra.panel("lot", lot), plaza);
  }
}

async function requestLink(page, target) {
  await openDestination(page, target);
  await page.getByPlaceholder("0,00").fill("12,34");
  await page.getByRole("button", { name:"Entrar para doar por Pix" }).click();
  return requestSignInLink(page);
}

async function requestSignInLink(page) {
  await page.getByRole("tab", { name:"Já tenho conta" }).click();
  await page.getByLabel("E-mail da sua conta").fill(first.email);
  await page.getByRole("button", { name:"Enviar link de acesso" }).click();
  const devLink = await page.getByRole("link", { name:/Abrir link/ }).getAttribute("href");
  assert.ok(devLink, "the local mailbox received a link");
  await page.close();
  return devLink;
}

async function savedDrafts(ctx) {
  const { origins } = await ctx.storageState();
  return (origins.find(origin => origin.origin === game)?.localStorage ?? []).filter(entry => entry.name.startsWith("vila.pix.draft.v1:"));
}

async function expectFreshSelection(ctx, state, link) {
  const page = await open(ctx, link);
  await page.getByRole("button", { name: `Sua conta: ${first.nickname}` }).waitFor();
  await page.getByText(`Bem-vindo(a), ${first.nickname}!`, { exact: false }).waitFor();
  assert.equal(state.user?.id, first.id);
  assert.equal(await page.getByRole("dialog", { name: "Confirmar doação por Pix" }).count(), 0);
  await openDestination(page, "ngo");
  const generate = page.getByRole("button", { name: "Gerar Pix de doação" });
  await generate.waitFor();
  assert.equal(await page.getByPlaceholder("0,00").inputValue(), "");
  assert.ok(await generate.isDisabled());
  assert.equal(state.posts.length, 0);
  assert.equal(state.issued.size, 0);
}

const confirm = page => page.getByRole("button", { name:"Confirmar e gerar Pix" });
async function expectReview(page, name) {
  const panel = page.getByRole("dialog", { name:"Confirmar doação por Pix" });
  await confirm(page).waitFor();
  const description = (await panel.innerText()).replaceAll("\u00a0", " ");
  assert.ok(description.includes(name), "recipient must be shown again");
  assert.ok(description.includes("@" + first.nickname), "the person must see which account will be used");
  assert.match(description, /12,34/, "amount must be shown again");
  assert.match(description, /10,30/, "recipient share in reais");
  assert.match(description, /2,04/, "Vila share in reais");
}
function assertPosts(state, target, count) {
  assert.equal(state.posts.length, count);
  assert.equal(state.issued.size, 1);
  for (const post of state.posts) {
    assert.equal(post.targetKind, target);
    assert.equal(post.amountCents, 1234);
    assert.equal(post.ngoId, target === "ngo" ? a.id : undefined);
    assert.equal(post.user, first.id);
    assert.equal(post.accountId, first.id);
    assert.deepEqual(post.expectedTerms, { recipientName: target === "global" ? partner : a.name, ngoPercentBps: terms.ngoPercentBps, fixedFeeCents: terms.fixedFeeCents });
    assert.match(post.idempotencyKey, /^[\da-f-]{36}$/i);
    assert.equal(post.idempotencyKey, state.posts[0].idempotencyKey);
  }
}

try {
  for (const target of ["global", "ngo"]) {
    await scenario(`${target}: e-mail in another tab and explicit confirmation`, async (ctx, state) => {
      const link = await requestLink(await open(ctx), target);
      assert.equal(state.posts.length, 0);
      const page = await open(ctx, link);
      await expectReview(page, target === "global" ? partner : a.name);
      assert.equal(state.posts.length, 0);
      await confirm(page).click();
      await page.locator('[data-donation-status="pending"]').waitFor();
      await page.getByText("FIXTURE-LOCAL-SEM-VALOR", { exact: true }).waitFor();
      assertPosts(state, target, 1);
    });
  }
  await scenario("two tabs confirming the same draft", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    const other = await open(ctx);
    await expectReview(other, partner);
    assert.equal(state.posts.length, 0);
    await Promise.all([confirm(page).click(), confirm(other).click()]);
    await Promise.any([page, other].map(p => p.locator('[data-donation-status="pending"]').waitFor()));
    assert.ok(state.posts.length === 1 || state.posts.length === 2);
    assertPosts(state, "global", state.posts.length);
  });
  await scenario("rapid double confirmation", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    await confirm(page).evaluate(button => { button.click(); button.click(); });
    await page.locator('[data-donation-status="pending"]').waitFor();
    assert.ok(state.posts.length === 1 || state.posts.length === 2);
    assertPosts(state, "global", state.posts.length);
  });
  await scenario("cancel before confirming", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    await page.getByRole("button", { name:"Cancelar e voltar à Vila" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.reload();
    await page.getByRole("button", { name:"Sua conta: TesteA" }).waitFor();
    assert.equal(await confirm(page).count(), 0);
    assert.equal(state.posts.length, 0);
  });
  await scenario("the lot has changed occupant", async (ctx, state) => {
    const link = await requestLink(await open(ctx), "ngo");
    state.tenant = b;
    const page = await open(ctx, link);
    await page.getByText(/Não foi possível retomar esta doação/i).first().waitFor();
    assert.equal(await confirm(page).count(), 0);
    assert.equal(state.posts.length, 0);
  });
  await scenario("indeterminate response and retry after reload", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    state.dropNext = true;
    await confirm(page).click();
    await page.getByRole("alert").waitFor();
    await page.reload();
    await expectReview(page, partner);
    assertPosts(state, "global", 1);
    await confirm(page).click();
    await page.locator('[data-donation-status="pending"]').waitFor();
    assertPosts(state, "global", 2);
  });
  await scenario("reopening the original panel after a lost response", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    state.dropNext = true;
    await confirm(page).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Fechar e voltar à Vila" }).click();
    await page.getByRole("button", { name: "Doação global", exact: true }).click();
    await page.getByPlaceholder("0,00").fill("12,34");
    await page.getByRole("button", { name: "Gerar Pix de doação" }).click();
    await expectReview(page, partner);
    assertPosts(state, "global", 1);
    await confirm(page).click();
    await page.locator('[data-donation-status="pending"]').waitFor();
    assertPosts(state, "global", 2);
  });
  await scenario("different account after an uncertain response", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    state.dropNext = true;
    await confirm(page).click();
    await page.getByRole("alert").waitFor();
    // A sign-in to a second account replaces the shared session just as opening another mailbox would.
    const token = crypto.randomUUID();
    state.mailbox.set(token, second);
    await page.goto(game + "/?mail=2#login=" + token);
    await page.getByRole("button", { name:"Sua conta: TesteB" }).waitFor();
    assert.equal(await confirm(page).count(), 0);
    assertPosts(state, "global", 1);
  });
  await scenario("session switched while review stayed on screen", async (ctx, state) => {
    const page = await open(ctx, await requestLink(await open(ctx), "global"));
    await expectReview(page, partner);
    state.user = second; // The page has not yet re-read the session changed by another tab.
    await confirm(page).click();
    await page.getByRole("alert").waitFor();
    assert.equal(state.posts.length, 1);
    assert.equal(state.posts[0].accountId, first.id);
    assert.equal(state.issued.size, 0);
  });
  await scenario("the emailed link opened in a different profile starts a fresh selection", async (source, state) => {
    const link = await requestLink(await open(source), "ngo");
    const original = await savedDrafts(source);
    assert.equal(original.length, 1);
    // Profiles have separate sessions and storage against the same mailbox and payment API.
    await withProfile("receiving profile", { ...state, user: null }, async (other, recipient) => {
      assert.deepEqual(await savedDrafts(other), []);
      await expectFreshSelection(other, recipient, link);
      assert.deepEqual(await savedDrafts(other), []);
    });
    assert.deepEqual(await savedDrafts(source), original);
    assert.equal(state.user, null);
  });
  await scenario("an expired draft in the original profile is removed before a fresh selection", async (ctx, state) => {
    const firstLink = await requestLink(await open(ctx), "ngo");
    const drafts = await savedDrafts(ctx);
    assert.equal(drafts.length, 1);
    const { expires } = JSON.parse(drafts[0].value);
    assert.ok(Number.isSafeInteger(expires));
    await ctx.clock.setFixedTime(new Date(expires + 1));
    // The first email link expires before the Pix draft. Request a new one from the account panel.
    const login = await open(ctx);
    assert.ok(await login.evaluate(deadline => Date.now() > deadline, expires));
    await login.getByRole("button", { name: "Entrar ou criar conta" }).click();
    const freshLink = await requestSignInLink(login);
    assert.notEqual(freshLink, firstLink);
    assert.deepEqual(await savedDrafts(ctx), drafts);
    await expectFreshSelection(ctx, state, freshLink);
    assert.deepEqual(await savedDrafts(ctx), []);
  });
} finally { await browser.close(); }
