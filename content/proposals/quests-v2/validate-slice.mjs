#!/usr/bin/env node
/**
 * Structural validator for the quests-v2 slices (PROPOSTA). Dependency-free Node, like the v1 validator.
 *
 *   node content/proposals/quests-v2/validate-slice.mjs --kind=spine
 *   node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-01
 *   node content/proposals/quests-v2/validate-slice.mjs --kind=epilogue content/proposals/quests-v2/epilogue
 *   node content/proposals/quests-v2/validate-slice.mjs --kind=art
 *   node content/proposals/quests-v2/validate-slice.mjs --all
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const problems = [];
const fail = (message) => problems.push(message);
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const exists = (path) => existsSync(join(ROOT, path));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function table(dir, name) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    fail(`${name}: missing`);
    return [];
  }
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows.shift()?.map((h) => h.trim()) ?? [];
  if (header.length === 0) { fail(`${name}: empty header`); return []; }
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const PAIR = {
  1: ["praca-grande-arvore", "mercado-panetone"], 2: ["jardim-casas", "oficina-brinquedos"],
  3: ["colina-correio", "campanario"], 4: ["bosque-pinheiros", "lago-espelho"],
  5: ["estacao-treno", "casa-fio-vale-vento-branco"], 6: ["vila-amanhecer", "estrada-orvalho"],
  7: ["ponte-gelo", "vale-ecos"], 8: ["jardim-sol", "mercado-estacoes"],
  9: ["pedra-fundamental", "arquivo-neves"], 10: ["torre-tempo", "praca-nova-noite"],
};
const BOOK_SLOT = { 1: "helmet", 2: "blouse", 3: "pants", 4: "dress", 5: "shoes", 6: "back", 7: "face", 8: "handLeft", 9: "handRight", 10: "special" };
const OBJECTIVES = new Set(["talk", "collect", "deliver", "visit", "read", "minigame", "interact"]);
const TRACKS = new Set(["explore", "play", "causes"]);
const WORLD_STATES = new Set([
  "bell-rung", "market-open", "garden-named", "toy-finished", "mail-sorted", "clock-running",
  "brasa-home", "lake-lit", "platform-open", "loom-woven", "star-lit", "postman-named",
  "alba-remembered", "dawn-bell", "dew-road", "bridge-named", "echo-whole", "summer-bloom",
  "seasons-complete", "foundation-named", "archive-authored", "last-hour", "new-vigil",
]);
const COUNTERS = new Set([
  "missions", "trades", "houses", "memory-wins", "letters", "bells", "trails", "lanterns",
  "departures", "threads", "mornings", "dew-footprints", "bridges", "echoes", "summers",
  "seasons", "foundations", "origins", "hours", "vigils",
]);
const SAGA_PROPS = new Set(["star-guide", "great-bell", "loom", "time-tower", "ice-bridge", "foundation-stone", "snow-archive", "aurora-crown", "dawn-thread", "hand-right-candle"]);

const manifestText = read("packages/shared/src/game/quests-v2/manifest.ts");
const manifest = [...manifestText.matchAll(/\{ id: "([^"]+)", kind: "([^"]+)", book: (\d+), region: (null|"([^"]+)"), xp: (\d+), prerequisiteIds: \[([^\]]*)\], status: "pending" \}/g)].map((m) => ({
  id: m[1], kind: m[2], book: Number(m[3]), region: m[4] === "null" ? null : m[5], xp: Number(m[6]),
  prerequisiteIds: [...m[7].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
}));
const manifestById = new Map(manifest.map((e) => [e.id, e]));
const manifestIds = new Set(manifest.map((e) => e.id));

function regionOf(id, book, prereqs) {
  const pair = PAIR[book];
  if (/-c1-|-c3-|-r1-/.test(id) || /-m1-/.test(id)) return pair[0];
  if (/-c2-|-r2-/.test(id) || /-m2-/.test(id)) return pair[1];
  return prereqs.some((p) => p.includes("-c2-")) ? pair[1] : pair[0];
}

function prereqsOf(row) {
  const many = row.prerequisite_ids || "";
  if (many) return many.split(";").map((s) => s.trim()).filter(Boolean);
  return row.prerequisito_id ? [row.prerequisito_id] : [];
}

function copyChecks(rows) {
  const all = rows.flatMap((row) => Object.values(row)).join("\n");
  for (const [label, re] of [["TODO", /\bTODO\b/], ["TBD", /\bTBD\b/], ["lorem", /lorem/i], ["placeholder", /placeholder/i], ["???", /\?\?\?/]])
    if (re.test(all)) fail(`filler marker found: ${label}`);
  if (/ao norte/i.test(all)) fail('cardinal direction "ao norte" found');
  if (/—/.test(all)) fail("em dash found");
  for (const row of rows) {
    if (row.titulo_missao && row.titulo_missao.length > 60) fail(`${row.missao_id}: title longer than 60`);
    if (row.descricao_missao && row.descricao_missao.length > 240) fail(`${row.missao_id}: description longer than 240`);
  }
}

function validateSpine() {
  if (manifest.length !== 484) fail(`manifest: expected 484 entries, got ${manifest.length}`);
  if (manifestIds.size !== manifest.length) fail("manifest: duplicated id");
  if (manifest.reduce((xp, e) => xp + e.xp, 0) !== 11400) fail("manifest: XP is not 11,400");
  if (manifest.filter((e) => e.kind === "epilogue").length !== 18) fail("manifest: epilogue is not 18");
  if (manifest.filter((e) => e.kind === "postgame").length !== 12) fail("manifest: postgame is not 12");
  if (manifest.filter((e) => e.kind === "quick").length !== 4) fail("manifest: quick is not 4");
  for (const entry of manifest) {
    for (const prerequisite of entry.prerequisiteIds) if (!manifestIds.has(prerequisite)) fail(`${entry.id}: unknown prerequisite ${prerequisite}`);
  }
  for (let book = 1; book <= 10; book++) {
    const entries = manifest.filter((e) => e.book === book);
    if (entries.length !== 45) fail(`book ${book}: manifest has ${entries.length} entries`);
    if (entries.filter((e) => e.kind === "main").length !== 12) fail(`book ${book}: manifest main is not 12`);
    if (entries.filter((e) => e.kind === "regional").length !== 16) fail(`book ${book}: manifest regional is not 16`);
    if (entries.filter((e) => e.kind === "side").length !== 5) fail(`book ${book}: manifest side is not 5`);
    if (entries.filter((e) => e.kind === "milestone").length !== 12) fail(`book ${book}: manifest milestone is not 12`);
    for (const entry of entries) if (entry.region !== regionOf(entry.id, book, entry.prerequisiteIds)) fail(`${entry.id}: wrong region rule`);
  }
  for (const file of ["book-00-epilogue.ts", ...Array.from({ length: 10 }, (_, i) => `book-${String(i + 1).padStart(2, "0")}.ts`)]) {
    const path = `packages/shared/src/game/quests-v2/books/${file}`;
    if (!exists(path)) { fail(`${file}: missing`); continue; }
    const text = read(path);
    for (const symbol of ["QUESTS", "MILESTONES", "NPCS", "SPAWNS", "INTERACTIONS", "OBSTACLES", "STATES", "COSMETICS"])
      if (!text.includes(`export const ${symbol}`)) fail(`${file}: missing export ${symbol}`);
  }
  const wrangler = read("apps/api/wrangler.jsonc");
  if ((wrangler.match(/"QUESTS_V2_ENABLED": "false"/g) ?? []).length < 2) fail("wrangler: QUESTS_V2_ENABLED is not false in production and staging");
  const apiPackage = read("apps/api/package.json");
  if (!apiPackage.includes("QUESTS_V2_ENABLED:true")) fail("api dev script: QUESTS_V2_ENABLED:true missing");
}

function validateBook(path) {
  const dir = resolve(ROOT, path);
  const book = Number((/book-(\d+)/.exec(dir) ?? [])[1]);
  if (!book || book < 1 || book > 10) { fail("book: path must contain book-NN"); return; }
  const quests = table(dir, "quests.csv");
  const dialogues = table(dir, "dialogues.csv");
  const milestones = table(dir, "milestones.csv");
  const npcs = table(dir, "npcs.csv");
  const objects = table(dir, "objects.csv");
  const cosmetics = table(dir, "cosmetics.csv");
  copyChecks([...quests, ...dialogues, ...npcs, ...objects, ...milestones, ...cosmetics]);
  if (quests.length !== 33) fail(`${path}: expected 33 narrative rows, got ${quests.length}`);
  if (dialogues.length !== 33) fail(`${path}: expected 33 dialogue rows, got ${dialogues.length}`);
  for (const dialogue of dialogues) {
    if (!dialogue.fala_oferta) fail(`${dialogue.missao_id}: empty offer speech`);
    if (!dialogue.fala_entrega) fail(`${dialogue.missao_id}: empty turn-in speech`);
    if (dialogue.fala_oferta.length > 300 || dialogue.fala_entrega.length > 300) fail(`${dialogue.missao_id}: speech longer than 300`);
  }
  if (quests.filter((q) => q.kind === "main").length !== 12) fail(`${path}: main is not 12`);
  if (quests.filter((q) => q.kind === "regional").length !== 16) fail(`${path}: regional is not 16`);
  if (quests.filter((q) => q.kind === "side").length !== 5) fail(`${path}: side is not 5`);
  if (milestones.length !== 12) fail(`${path}: milestones is not 12`);
  if (npcs.length !== 8) fail(`${path}: expected 8 NPCs, got ${npcs.length}`);
  if (new Set(npcs.map((n) => n.npc_id)).size !== npcs.length) fail(`${path}: duplicated NPC id`);
  for (const npc of npcs) {
    if (npc.semente !== npc.npc_id) fail(`${npc.npc_id}: semente must equal npc_id`);
    if (!Number.isFinite(Number(npc.x)) || !Number.isFinite(Number(npc.z)) || !Number.isFinite(Number(npc.rot))) fail(`${npc.npc_id}: invalid position`);
    if (Number(npc.book) !== book) fail(`${npc.npc_id}: wrong book`);
  }
  if (objects.length !== 4) fail(`${path}: expected 4 new objects, got ${objects.length}`);
  for (const object of objects) {
    const budget = object.tipo_objeto === "world_prop" ? [220, 600] : [80, 200];
    if (!["quest_item", "world_prop"].includes(object.tipo_objeto)) fail(`${object.objeto_id}: invalid object type`);
    if (Number(object.orcamento_voxels) > budget[0] || Number(object.orcamento_faces) > budget[1]) fail(`${object.objeto_id}: over budget`);
  }
  if (cosmetics.length !== 6) fail(`${path}: expected 6 cosmetics, got ${cosmetics.length}`);
  if (cosmetics.filter((c) => c.premium === "true").length !== 3) fail(`${path}: premium is not 3`);
  if (cosmetics.filter((c) => c.origem === "marco").length !== 2) fail(`${path}: milestone cosmetics are not 2`);
  if (cosmetics.filter((c) => c.origem === "missao").length !== 1) fail(`${path}: mission cosmetic is not 1`);
  const finalRewards = milestones.filter((m) => Number(m.ordem) === 6).map((m) => m.recompensa).sort();
  const milestoneCosmetics = cosmetics.filter((c) => c.origem === "marco").map((c) => c.cosmetic_id).sort();
  if (finalRewards.join() !== milestoneCosmetics.join()) fail(`${path}: milestone rewards do not match cosmetics.csv`);
  for (const cosmetic of cosmetics) {
    if (Number(cosmetic.orcamento_voxels) > 40 || Number(cosmetic.orcamento_faces) > 140) fail(`${cosmetic.cosmetic_id}: cosmetic over budget`);
    if (cosmetic.premium === "true" && cosmetic.slot !== BOOK_SLOT[book]) fail(`${cosmetic.cosmetic_id}: premium must use slot ${BOOK_SLOT[book]}`);
  }
  const missionReward = cosmetics.find((c) => c.origem === "missao")?.recompensa;
  if (missionReward && !quests.some((q) => q.missao_id === missionReward)) fail(`${path}: mission cosmetic reward ${missionReward} is not a quest`);
  let narrativeXp = 0;
  const byChapter = new Map();
  for (const quest of quests) {
    const id = quest.missao_id;
    const kind = quest.kind;
    if (!["main", "regional", "side"].includes(kind)) fail(`${id}: invalid kind ${kind}`);
    if (!TRACKS.has(quest.trilha)) fail(`${id}: invalid trilha ${quest.trilha}`);
    if (!OBJECTIVES.has(quest.tipo_objetivo)) fail(`${id}: invalid objective type ${quest.tipo_objetivo}`);
    const xp = Number(quest.xp);
    narrativeXp += xp;
    if (kind === "side" && xp !== 15) fail(`${id}: side XP must be 15`);
    if (kind === "main") {
      const chapter = /-c(\d)-/.exec(id)?.[1];
      if (!chapter) fail(`${id}: main id without chapter`);
      else {
        if (!byChapter.has(chapter)) byChapter.set(chapter, []);
        byChapter.get(chapter).push({ ...quest, id, order: Number(quest.ordem), xp: Number(quest.xp) });
      }
    }
    if (kind === "regional") {
      const arc = /-r(\d)-/.exec(id)?.[1];
      if (!arc) fail(`${id}: regional id without arc`);
    }
    for (const prerequisite of prereqsOf(quest)) if (!manifestIds.has(prerequisite)) fail(`${id}: unknown prerequisite ${prerequisite}`);
    if (quest.region !== regionOf(id, book, prereqsOf(quest))) fail(`${id}: wrong region rule`);
    if (quest.world_state && !WORLD_STATES.has(quest.world_state)) fail(`${id}: unknown world state ${quest.world_state}`);
  }
  for (const [chapter, list] of byChapter) {
    list.sort((a, b) => a.order - b.order);
    const expected = [20, 25, 30, 50];
    if (list.length !== 4) fail(`${path}: chapter ${chapter} has ${list.length} main quests`);
    else if (list.map((q) => q.xp).join() !== expected.join()) fail(`${path}: chapter ${chapter} XP is not 20/25/30/50`);
    for (const [index, quest] of list.entries()) {
      const expectedPre = index === 0
        ? (Number(chapter) === 2 ? `b${String(book).padStart(2, "0")}-c1-04` : Number(chapter) === 3 ? `b${String(book).padStart(2, "0")}-c2-04` : book === 1 ? "" : `b${String(book - 1).padStart(2, "0")}-c3-04`)
        : list[index - 1].id;
      const actual = prereqsOf(quest)[0] ?? "";
      if (actual !== expectedPre) fail(`${quest.id}: prerequisite must be ${expectedPre || "(empty)"}, got ${actual || "(empty)"}`);
    }
  }
  for (const arc of ["r1", "r2"]) {
    const list = quests.filter((q) => q.missao_id.includes(`-${arc}-`)).sort((a, b) => Number(a.ordem) - Number(b.ordem));
    const expected = [20, 20, 25, 25, 30, 30, 40, 50];
    if (list.length !== 8) fail(`${path}: ${arc} has ${list.length} quests`);
    else if (list.map((q) => Number(q.xp)).join() !== expected.join()) fail(`${path}: ${arc} XP is not 20/20/25/25/30/30/40/50`);
    for (const [index, quest] of list.entries()) {
      if (index === 0) {
        const first = prereqsOf(quest)[0] ?? "";
        if (!first.startsWith(`b${String(book).padStart(2, "0")}-c`)) fail(`${quest.missao_id}: first regional prerequisite must be a main quest of the book`);
      } else {
        const previous = list[index - 1].missao_id;
        if (!prereqsOf(quest).includes(previous)) fail(`${quest.missao_id}: regional chain is not linear`);
      }
    }
  }
  if (narrativeXp !== 930) fail(`${path}: narrative XP is ${narrativeXp}, expected 930`);
  if (milestones.reduce((xp, m) => xp + Number(m.xp), 0) !== 120) fail(`${path}: milestone XP is not 120`);
  for (const milestone of milestones) {
    if (Number(milestone.xp) !== 10) fail(`${milestone.corrente_id}: milestone XP is not 10`);
    if (!COUNTERS.has(milestone.contador)) fail(`${milestone.corrente_id}: unknown counter ${milestone.contador}`);
    if (Number(milestone.book) !== book) fail(`${milestone.corrente_id}: wrong book`);
    if (milestone.region !== PAIR[book][Number(milestone.corrente_id.endsWith("m2") ? 1 : 0)]) fail(`${milestone.corrente_id}: wrong region`);
  }
}

function validateEpilogue(path) {
  const dir = resolve(ROOT, path);
  const quests = table(dir, "quests.csv");
  copyChecks(quests);
  const hasBough = read("packages/shared/src/game/quests.ts").includes("bough-ribbon");
  const epilogue = quests.filter((q) => q.kind === "epilogue");
  const postgame = quests.filter((q) => q.kind === "postgame");
  const quick = quests.filter((q) => q.kind === "quick");
  if (epilogue.length !== (hasBough ? 18 : 15)) fail(`${path}: epilogue must have ${hasBough ? 18 : 15} entries`);
  if (epilogue.reduce((xp, q) => xp + Number(q.xp), 0) !== (hasBough ? 550 : 465)) fail(`${path}: epilogue XP is wrong`);
  if (postgame.length !== 12) fail(`${path}: postgame must have 12 entries`);
  if (postgame.reduce((xp, q) => xp + Number(q.xp), 0) !== 240) fail(`${path}: postgame XP must be 240`);
  if (quick.length !== 4) fail(`${path}: quick must have 4 entries`);
  if (quick.reduce((xp, q) => xp + Number(q.xp), 0) !== 110) fail(`${path}: quick XP must be 110`);
}

function validateArt() {
  const saga = read("apps/client/src/scene/gen/quest-v2/saga.ts");
  const ids = [...saga.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
  for (const id of SAGA_PROPS) if (!ids.includes(id)) fail(`saga.ts: missing ${id}`);
  let total = 0;
  const slots = new Map();
  for (let book = 1; book <= 10; book++) {
    const path = join(ROOT, `content/proposals/quests-v2/book-${String(book).padStart(2, "0")}`, "cosmetics.csv");
    if (!existsSync(path)) { fail(`book-${book}: cosmetics.csv missing`); continue; }
    const rows = parseCsv(readFileSync(path, "utf8"));
    const header = rows.shift()?.map((h) => h.trim()) ?? [];
    for (const row of rows) {
      const item = Object.fromEntries(header.map((h, i) => [h, (row[i] ?? "").trim()]));
      total++;
      slots.set(item.slot, (slots.get(item.slot) ?? 0) + 1);
    }
  }
  if (total !== 60) fail(`art: expected 60 book cosmetics, got ${total}`);
  for (const slot of Object.values(BOOK_SLOT)) if ((slots.get(slot) ?? 0) + 10 !== 16) fail(`art: slot ${slot} does not total 16 with v1`);
}

const args = process.argv.slice(2);
const mode = args[0]?.startsWith("--kind=") ? args.shift().slice(7) : "book";
if (mode === "spine") validateSpine();
else if (mode === "epilogue") validateEpilogue(args[0] ?? "content/proposals/quests-v2/epilogue");
else if (mode === "art") validateArt();
else if (mode === "all") {
  validateSpine();
  for (let book = 1; book <= 10; book++) validateBook(`content/proposals/quests-v2/book-${String(book).padStart(2, "0")}`);
  validateEpilogue("content/proposals/quests-v2/epilogue");
  validateArt();
} else if (mode === "book") {
  if (!args[0]) fail("usage: validate-slice.mjs content/proposals/quests-v2/book-NN");
  else validateBook(args[0]);
} else fail(`unknown mode ${mode}`);

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log(`OK ${mode}: manifest=${manifest.length} entries=${manifest.reduce((xp, e) => xp + e.xp, 0)} XP`);
