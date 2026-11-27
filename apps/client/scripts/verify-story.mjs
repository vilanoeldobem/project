/**
 * verify-story.mjs: real-browser smoke of a story-v2 slice against LOCAL Workers only.
 *
 * Usage: node apps/client/scripts/verify-story.mjs http://localhost:5173 <book-01..book-10|epilogue|postgame|all> [api]
 *
 * It opens the game with both flags, seeds the prerequisite closure of a standalone book (the previous books
 * may not be merged), then plays the book's 33 narrative entries through the HUD and the NPC panels. Minigame
 * objectives need the game's skip control; a missing target is reported with its id.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { analyticsNoise, frameworkNoise, isolateAnalytics } from "./analytics.mjs";
import { arrive } from "./arrive.mjs";

const [url = "http://localhost:5173", slice = "all", apiUrl = "http://localhost:8787"] = process.argv.slice(2);
if (!/localhost|127\.0\.0\.1/.test(url + apiUrl)) {
  console.error("local only");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const errors = [];
const fail = (message) => {
  errors.push(message);
  console.error(`error: ${message}`);
};

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
process.on("unhandledRejection", async (error) => {
  console.error(error);
  await browser.close().catch(() => {});
  process.exit(1);
});

async function newPage(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && !analyticsNoise(message.text()) && !frameworkNoise(message.text()) && errors.push(`${name}: ${message.text()}`));
  await isolateAnalytics(page);
  await page.addInitScript(() => localStorage.setItem("vila.environment.v1", JSON.stringify({ quality: "low", multiplayer: false })));
  return page;
}

async function enter(page) {
  await page.goto(`${url}/?quests=1&quests2=1`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  await arrive(page, errors, "enter");
  await page.waitForFunction(() => window.__vila?.extra?.questsV2On?.() === true, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

const story = (page) => page.evaluate(() => window.__vila.extra.story());
const world = (page) => page.evaluate(() => window.__vila.extra.storyWorld());
const teleport = (page, x, z) => page.evaluate(([px, pz]) => window.__vila.extra.teleport(px, pz), [x, z]);
const stateOf = async (page, id) => (await story(page)).find((entry) => entry.id === id)?.state;
const EPILOGUE_GATE = "b05-c3-04";
const EPILOGUE_ROOTS = ["harness-bells", "market-invitations", "frozen-mailbox", "lake-lanterns", "tree-promise-visit"];

async function expectEpilogueLocked(page) {
  const entries = await story(page);
  if (entries.find((entry) => entry.id === EPILOGUE_GATE)?.state === "completed") fail(`epilogue gate: ${EPILOGUE_GATE} completed before Book V`);
  for (const id of EPILOGUE_ROOTS) {
    const state = entries.find((entry) => entry.id === id)?.state;
    if (state !== "locked") fail(`epilogue ${id}: expected locked before ${EPILOGUE_GATE}, got ${state}`);
  }
}

async function expectEpilogueOpen(page) {
  const entries = await story(page);
  if (entries.find((entry) => entry.id === EPILOGUE_GATE)?.state !== "completed") fail(`epilogue gate: ${EPILOGUE_GATE} not completed after Book V`);
  for (const id of EPILOGUE_ROOTS) {
    const state = entries.find((entry) => entry.id === id)?.state;
    if (state !== "available") fail(`epilogue ${id}: expected available after ${EPILOGUE_GATE}, got ${state}`);
  }
  const bough = entries.find((entry) => entry.id === "bough-ribbon")?.state;
  if (bough !== "locked") fail(`epilogue bough-ribbon: expected locked before story-page-delivery, got ${bough}`);
}

const seen = (page, questId, eventId) => page.evaluate(([q, e]) => Boolean(window.__vila.progress().seen[`${q}:${e}`]), [questId, eventId]);
const waitSeen = (page, questId, eventId) =>
  page.waitForFunction(([q, e]) => Boolean(window.__vila.progress().seen[`${q}:${e}`]), [questId, eventId], { timeout: 15000 });
const waitState = (page, id, state) =>
  page.waitForFunction(([q, s]) => window.__vila.extra.story().some((entry) => entry.id === q && entry.state === s), [id, state], { timeout: 15000 });

async function action(page) {
  await page.waitForSelector(".hud__action", { timeout: 10000 });
  await page.click(".hud__action");
}

async function dialogButton(page, name) {
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.getByRole("dialog").getByRole("button", { name }).click();
}

async function openNpc(page, npcId, storyWorld) {
  const npc = storyWorld.npcs.find((entry) => entry.id === npcId);
  if (!npc) throw new Error(`NPC ${npcId} is not in storyWorld()`);
  await teleport(page, npc.x, npc.z);
  await page.waitForTimeout(250);
  await action(page);
}

/** A reused v1 NPC is drawn and labelled once, with a marker that matches the dialogue. */
async function expectOneNpc(page, id, marked) {
  const npc = (await world(page)).npcs.find((entry) => entry.id === id);
  if (!npc) return fail(`NPC ${id} is not in storyWorld()`);
  await teleport(page, npc.x, npc.z + 1.6);
  await page.waitForTimeout(400);
  const labels = (await page.locator(".label3d").allTextContents()).map((text) => text.trim());
  const own = labels.filter((text) => text.includes(npc.name));
  if (own.length !== 1) fail(`NPC ${id}: expected one label, got ${JSON.stringify(own)}`);
  if (marked && !own[0]?.startsWith("!")) fail(`NPC ${id}: expected an available marker, got ${JSON.stringify(own)}`);
  if (!marked && own.some((text) => text.startsWith("!"))) fail(`NPC ${id}: phantom available marker ${JSON.stringify(own)}`);
  await action(page);
  await page.getByRole("dialog").waitFor({ timeout: 5000 }).catch(() => fail(`NPC ${id}: its dialogue did not open`));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

async function accept(page, quest, storyWorld) {
  await openNpc(page, quest.giverNpcId, storyWorld);
  await dialogButton(page, /Aceitar missão/);
  await waitState(page, quest.id, "active").catch(() => waitState(page, quest.id, "ready_to_turn_in"));
}

async function doObjective(page, quest, eventId, storyWorld) {
  if (quest.objectiveType === "deliver") return;
  const spawn = storyWorld.spawns.find((entry) => entry.questId === quest.id && entry.id === eventId);
  if (spawn) {
    await teleport(page, spawn.x, spawn.z);
    await page.waitForTimeout(300);
    await waitSeen(page, quest.id, eventId);
    return;
  }
  const interaction = storyWorld.interactions.find((entry) => entry.questId === quest.id && entry.id === eventId);
  if (!interaction) throw new Error(`${quest.id}: no spawn/interaction for objective ${eventId}`);
  await teleport(page, interaction.x, interaction.z);
  await page.waitForTimeout(250);
  if (interaction.kind === "talk") {
    await action(page);
    await dialogButton(page, /Continuar/);
  } else if (interaction.kind === "minigame") {
    await action(page);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 10000 });
    const check = dialog.getByRole("button", { name: /^Conferir$/ });
    if (await check.count()) {
      for (let attempt = 0; attempt < 3; attempt++) await check.click();
    } else {
      const retry = dialog.getByRole("button", { name: /Recomeçar|Tentar outra vez/ });
      for (let attempt = 0; attempt < 3; attempt++) await retry.click();
    }
    await dialog.getByRole("button", { name: /^Pular minijogo$/ }).click();
    await page.waitForTimeout(300);
  } else {
    await action(page);
  }
  await waitSeen(page, quest.id, eventId);
}

async function turnIn(page, quest, storyWorld) {
  await openNpc(page, quest.turnInNpcId, storyWorld);
  await dialogButton(page, /Concluir missão/);
  await waitState(page, quest.id, "completed");
}

async function playQuest(page, quest, storyWorld) {
  let current = quest;
  if (current.state === "available") {
    await accept(page, current, storyWorld);
    current = (await story(page)).find((entry) => entry.id === quest.id);
  }
  if (current.state === "active") {
    for (const eventId of current.objectiveEventIds) {
      if (await seen(page, current.id, eventId)) continue;
      await doObjective(page, current, eventId, storyWorld);
    }
    await waitState(page, current.id, "ready_to_turn_in").catch(() => {});
    current = (await story(page)).find((entry) => entry.id === quest.id);
  }
  if (current.state === "ready_to_turn_in") await turnIn(page, current, storyWorld);
  const state = await stateOf(page, quest.id);
  if (state !== "completed") fail(`${quest.id}: ended as ${state}`);
}

async function playBook(page, book, seed) {
  let entries = (await story(page)).filter((entry) => entry.book === book);
  if (entries.length !== 45) {
    fail(`book-${book}: expected 45 catalog entries, got ${entries.length}`);
    return;
  }
  const narrative = entries.filter((entry) => ["main", "regional", "side"].includes(entry.kind));
  if (narrative.length !== 33) fail(`book-${book}: expected 33 narrative entries, got ${narrative.length}`);
  const first = narrative.filter((entry) => entry.kind === "main").sort((a, b) => a.order - b.order)[0];
  if (seed) {
    const all = await story(page);
    const byId = new Map(all.map((entry) => [entry.id, entry]));
    const needed = new Set();
    const visit = (id) => {
      if (needed.has(id) || !byId.has(id)) return;
      needed.add(id);
      for (const prerequisite of byId.get(id).prerequisiteIds) visit(prerequisite);
    };
    for (const prerequisite of first.prerequisiteIds) visit(prerequisite);
    if (needed.size > 0) await page.evaluate((ids) => window.__vila.extra.seedStory(ids), [...needed]);
    await page.waitForTimeout(300);
  }
  const baseline = await page.evaluate(() => window.__vila.progress());
  let storyWorld = await world(page);
  for (let step = 0; step < 200; step++) {
    entries = await story(page);
    const bookNarrative = entries.filter((entry) => entry.book === book && ["main", "regional", "side"].includes(entry.kind));
    const active = bookNarrative.find((entry) => entry.state === "active" || entry.state === "ready_to_turn_in");
    if (active) {
      try {
        await playQuest(page, active, storyWorld);
      } catch (error) {
        fail(`${active.id}: ${error.message}`);
        return;
      }
      storyWorld = await world(page);
      continue;
    }
    const available = bookNarrative.find((entry) => entry.state === "available");
    if (available) {
      try {
        await accept(page, available, storyWorld);
      } catch (error) {
        fail(`${available.id}: ${error.message}`);
        return;
      }
      storyWorld = await world(page);
      continue;
    }
    break;
  }
  const final = await story(page);
  const incomplete = final.filter((entry) => entry.book === book && ["main", "regional", "side"].includes(entry.kind) && entry.state !== "completed");
  if (incomplete.length > 0) fail(`book-${book}: unfinished ${incomplete.map((entry) => `${entry.id}:${entry.state}`).join(", ")}`);
  const finalProgress = await page.evaluate(() => window.__vila.progress());
  const xp = finalProgress.xp - baseline.xp;
  const granted = await page.evaluate(
    ([before, after]) => window.__vila.extra.newlyCompletedXp(before, after),
    [baseline.completed, finalProgress.completed]
  );
  if (granted.unknown.length > 0) fail(`book-${book}: completed ids missing from the manifest: ${granted.unknown.join(", ")}`);
  const incidental = granted.quick.reduce((sum, entry) => sum + entry.xp, 0);
  if (xp !== granted.total) fail(`book-${book}: XP delta ${xp}, expected ${granted.total} from completed entries (${incidental} from quick missions)`);
  else if (incidental > 0) console.log(`note: book-${book}: +${incidental} XP from quick missions (${granted.quick.map((entry) => entry.id).join(", ")})`);
}

async function playPostgame(page) {
  const entries = (await story(page)).filter((entry) => entry.book === 0 && entry.kind === "postgame");
  if (entries.length !== 12) {
    fail(`postgame: expected 12 entries, got ${entries.length} (session 11)`);
    return;
  }
  // A standalone postgame check starts from a finished save: without this seed, a book NPC offers its
  // Book I quest before the postgame one and the verifier would play the wrong chain.
  const postgameIds = new Set(entries.map((entry) => entry.id));
  const prerequisites = (await story(page))
    .filter((entry) => entry.kind !== "milestone" && !postgameIds.has(entry.id))
    .map((entry) => entry.id);
  await page.evaluate((ids) => window.__vila.extra.seedStory(ids), prerequisites);
  await page.waitForTimeout(300);
  let storyWorld = await world(page);
  for (const quest of entries) {
    try {
      const current = (await story(page)).find((entry) => entry.id === quest.id);
      await playQuest(page, current, storyWorld);
    } catch (error) {
      fail(`${quest.id}: ${error.message}`);
    }
    storyWorld = await world(page);
  }
}

function runEpilogue({ stateFile, v2 = false } = {}) {
  const script = new URL("./verify-quests.mjs", import.meta.url).pathname;
  const env = { ...process.env };
  if (stateFile) env.VILA_STORY_PROGRESS = stateFile;
  if (v2) env.VILA_STORY_V2 = "1";
  try {
    execFileSync(process.execPath, [script, url, apiUrl], { stdio: "inherit", env });
  } catch {
    fail("epilogue: verify-quests.mjs failed");
  }
}

const page = await newPage(slice);
try {
  await enter(page);
  await expectOneNpc(page, "storyteller", true);
  await expectOneNpc(page, "market-keeper", false);
  await expectOneNpc(page, "postmaster", false);
  await expectOneNpc(page, "pond-keeper", false);
  if (slice === "epilogue") runEpilogue();
  else if (slice === "postgame") await playPostgame(page);
  else if (slice === "all") {
    for (let book = 1; book <= 10; book++) {
      await playBook(page, book, false);
      if (book === 4) await expectEpilogueLocked(page);
      if (book === 5) await expectEpilogueOpen(page);
    }
    await page.waitForTimeout(300);
    const stateFile = `${out}story-progress.json`;
    await page.context().storageState({ path: stateFile });
    runEpilogue({ stateFile, v2: true });
    await playPostgame(page);
  } else {
    const match = /^book-(\d{1,2})$/.exec(slice);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 10) fail(`unknown slice ${slice}`);
    else await playBook(page, Number(match[1]), true);
  }
  await page.screenshot({ path: `${out}/story-${slice}.png`, fullPage: false });
} finally {
  await browser.close().catch(() => {});
}

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK story ${slice}`);
