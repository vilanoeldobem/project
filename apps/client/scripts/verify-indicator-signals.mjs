// Exercises the actual panels with a disposable browser profile and in-memory test observations.
// No account, remote API, analytics, or persistent telemetry is used.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, mode: "workers", logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false } });
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    env: { ...process.env, TMPDIR: "/tmp" },
  });
  const context = await browser.newContext({serviceWorkers: "block"});
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.routeWebSocket("**/*", socket => socket.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error(error);
  });
  await page.goto(origin + "/scripts/fixtures/indicator-signals.html");
  const button = name => page.getByRole("button", {name, exact: true});
  const signals = () => page.evaluate(() => window.signalsProbe.calls);
  const catalog = () => page.evaluate(() => window.signalsProbe.catalog());
  const close = () => button("Fechar").click();
  await page.waitForFunction(() => Boolean(window.signalsProbe));

  await page.evaluate(() => window.signalsProbe.presence("online", 1));
  await page.getByRole("status", {name: "2 conexões nesta praça agora"}).waitFor();
  await page.evaluate(() => window.signalsProbe.presence("offline", 0));
  await page.getByRole("status", {name: /conex.* nesta praça/}).waitFor({state: "detached"});

  const games = await page.evaluate(() => window.signalsProbe.games);
  assert.equal(games.length, 9);
  const launchGame = async game => {
    await catalog();
    const card = page.locator(".sheet-card").filter({ has: page.getByRole("heading", {name: game.title}) });
    await card.getByRole("button", {name: "Jogar", exact: true}).click();
    await page.getByRole("dialog", {name: game.title}).waitFor();
  };
  const solve = async puzzle => {
    if (puzzle.kind === "order") {
      for (const id of puzzle.solution) await button(puzzle.tokens.find(t => t.id === id).label).click();
    } else {
      for (const {id, label} of puzzle.left) {
        await button(label).click();
        await button(puzzle.right.find(t => t.id === puzzle.solution[id]).label).click();
      }
    }
    await button("Conferir").click();
    await page.getByRole("dialog").waitFor({state: "detached"});
  };
  for (const game of games) {
    await launchGame(game);
    await button("Voltar aos minijogos").click();
    await launchGame(game);
    await solve(game.puzzle);
  }
  assert.deepEqual(await signals(), [], "free story games emitted a progress event on return or completion");
  await page.evaluate(() => window.signalsProbe.mission());
  await solve(games.find(g => g.id === "treno-na-neve").puzzle);
  assert.deepEqual(await signals(), [["b05-r1-07", "play-treno-na-neve"]]);

  await page.evaluate(() => window.signalsProbe.mission());
  for (let attempt = 0; attempt < 3; attempt++) await button("Conferir").click();
  await button("Pular minijogo").click();
  await page.getByRole("dialog").waitFor({state: "detached"});
  assert.deepEqual(await signals(), Array(2).fill(["b05-r1-07", "play-treno-na-neve"]));

  for (const occupant of ["A", "A", "B"]) {
    await page.evaluate(id => window.signalsProbe.house(id), occupant);
    await button("Jogar gratuitamente").click();
    await page.getByRole("dialog", {name: "Jogo da Memória"}).waitFor();
    await close();
  }
  const visits = (await signals()).filter(([kind]) => kind === "causes-visit-lot");
  assert.deepEqual(visits, Array(3).fill(["causes-visit-lot", "plaza-01"]));
  assert.deepEqual(await page.evaluate(() => window.signalsProbe.seen().filter(k => k.startsWith("causes-visit-lot:"))), ["causes-visit-lot:plaza-01"]);
  assert.ok(!(await signals()).some(([kind]) => kind === "play-memory"));

  await catalog();
  await page.locator(".sheet-card").filter({has: page.getByRole("heading", {name: /Jogo da Memória/})}).getByRole("button").click();
  await button("Calma").click();
  const cards = page.getByRole("grid").getByRole("button");
  const bySymbol = new Map();
  for (let i = 0; i < 8; i += 2) {
    for (const j of [i, i + 1]) {
      await cards.nth(j).click();
      const symbol = await cards.nth(j).getAttribute("aria-label");
      assert.notEqual(symbol, "Carta virada");
      bySymbol.set(symbol, [...(bySymbol.get(symbol) || []), j]);
    }
    await page.waitForFunction(() => !document.querySelector(".card--up:not(.card--ok)"));
  }
  for (const indexes of bySymbol.values()) {
    assert.equal(indexes.length, 2);
    if ((await cards.nth(indexes[0]).getAttribute("class")).includes("card--ok")) continue;
    for (const index of indexes) await cards.nth(index).click();
    await page.waitForFunction(() => !document.querySelector(".card--up:not(.card--ok)"));
  }
  await page.getByText(/Muito bem! Você encontrou todos os pares/).waitFor();
  assert.deepEqual((await signals()).filter(([kind]) => kind === "play-memory"), [["play-memory","win"]]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({freeStoryGames: games.map(g => g.id), freeStoryWins: 9, freeStoryProgressCalls: 0,
    questWinAndSkipSignals: (await signals()).slice(0, 2), houseOpens: 3, distinctLotProgressKeys: 1, memoryAbandons: 3, memoryWins: 1,
    onlineHudConnections: 2, offlineHudCountVisible: false}));
} finally {
  await browser?.close();
  await server.close();
}
