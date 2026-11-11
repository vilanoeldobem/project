#!/usr/bin/env node
/**
 * Validates the quest proposal in content/proposals/quests-v1 (PROPOSTA; see story-bible.md).
 * Structural rules only. Run: node validate-quests.mjs (works from any cwd). No dependencies.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);

/** Minimal CSV parser: quoted fields, "" escapes, CRLF tolerated, BOM stripped. */
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

function loadTable(name) {
  const rows = parseCsv(readFileSync(join(dir, name), "utf8"));
  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const TRACKS = ["explore", "play", "causes"];
const TYPES = ["talk", "collect", "deliver", "visit", "read", "minigame", "interact"];
const XP_ALLOWED = [15, 20, 25, 30, 40, 50];

const npcs = loadTable("npcs.csv");
const quests = loadTable("quests.csv");
const dialogues = loadTable("dialogues.csv");

// --- ids and cardinality
if (npcs.length !== 5) fail(`npcs.csv: expected 5 rows, got ${npcs.length}`);
if (quests.length !== 15) fail(`quests.csv: expected 15 rows, got ${quests.length}`);
if (dialogues.length !== 15) fail(`dialogues.csv: expected 15 rows, got ${dialogues.length}`);
const npcIds = new Set(npcs.map((n) => n.npc_id));
if (npcIds.size !== npcs.length) fail("npcs.csv: duplicated npc_id");
const questIds = new Set(quests.map((q) => q.missao_id));
if (questIds.size !== quests.length) fail("quests.csv: duplicated missao_id");
const dialogueIds = new Set(dialogues.map((d) => d.missao_id));
if (dialogueIds.size !== dialogues.length) fail("dialogues.csv: duplicated missao_id");
for (const id of questIds) if (!dialogueIds.has(id)) fail(`dialogues.csv: missing row for ${id}`);
for (const id of dialogueIds) if (!questIds.has(id)) fail(`dialogues.csv: unknown quest ${id}`);

// --- chains
const chains = new Map();
for (const q of quests) {
  if (!chains.has(q.cadeia_id)) chains.set(q.cadeia_id, []);
  chains.get(q.cadeia_id).push(q);
}
if (chains.size !== 5) fail(`expected 5 chains, got ${chains.size}`);
for (const [cid, list] of chains) {
  const sorted = [...list].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  if (sorted.map((q) => Number(q.ordem)).join(",") !== "1,2,3") fail(`chain ${cid}: ordem must be 1,2,3`);
  const act = new Set(sorted.map((q) => q.npc_ativacao));
  if (act.size !== 1) fail(`chain ${cid}: quests must share one activation NPC`);
  const owner = npcs.find((n) => n.npc_id === sorted[0].npc_ativacao);
  if (!owner) fail(`chain ${cid}: activation NPC missing from npcs.csv`);
  else if (owner.cadeia_id !== cid) fail(`chain ${cid}: owner npc maps to chain ${owner.cadeia_id}`);
  if (!sorted.some((q) => q.trilha === "explore")) fail(`chain ${cid}: no explore quest`);
  const types = sorted.map((q) => q.tipo_objetivo);
  if (new Set(types).size !== 3) fail(`chain ${cid}: objective types not distinct (${types.join(", ")})`);
}

// --- NPC rules
for (const n of npcs) {
  if (n.gerador !== "villager") fail(`${n.npc_id}: gerador must be villager`);
  if (n.semente !== n.npc_id) fail(`${n.npc_id}: semente must equal npc_id`);
  const own = quests.filter((q) => q.npc_ativacao === n.npc_id);
  if (own.length !== 3) fail(`${n.npc_id}: activates ${own.length} quests, expected 3`);
}

// --- tracks
const tracks = { explore: 0, play: 0, causes: 0 };
for (const q of quests) {
  if (!TRACKS.includes(q.trilha)) fail(`${q.missao_id}: invalid trilha "${q.trilha}"`);
  tracks[q.trilha]++;
}
if (tracks.explore !== 8 || tracks.play !== 4 || tracks.causes !== 3)
  fail(`tracks must be 8/4/3, got ${tracks.explore}/${tracks.play}/${tracks.causes}`);
const playChains = new Set(quests.filter((q) => q.trilha === "play").map((q) => q.cadeia_id)).size;
const causeChains = new Set(quests.filter((q) => q.trilha === "causes").map((q) => q.cadeia_id)).size;
if (playChains < 2) fail(`only ${playChains} chains include play`);
if (causeChains < 2) fail(`only ${causeChains} chains include causes`);

// --- objective types
const typeCount = {};
for (const q of quests) {
  if (!TYPES.includes(q.tipo_objetivo)) fail(`${q.missao_id}: invalid tipo_objetivo "${q.tipo_objetivo}"`);
  typeCount[q.tipo_objetivo] = (typeCount[q.tipo_objetivo] ?? 0) + 1;
}
for (const t of TYPES) {
  if ((typeCount[t] ?? 0) === 0) fail(`objective type "${t}" never used`);
  if ((typeCount[t] ?? 0) > 5) fail(`objective type "${t}" used ${typeCount[t]} times (max 5)`);
}

// --- prerequisites (linear within the chain)
for (const list of chains.values()) {
  const sorted = [...list].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  sorted.forEach((q, i) => {
    const expected = i === 0 ? "" : sorted[i - 1].missao_id;
    if (q.prerequisito_id !== expected)
      fail(`${q.missao_id}: prerequisito_id must be "${expected || "(empty)"}", got "${q.prerequisito_id}"`);
  });
}

// --- turn-ins
let cross = 0;
for (const q of quests) {
  if (!npcIds.has(q.npc_ativacao)) fail(`${q.missao_id}: unknown npc_ativacao "${q.npc_ativacao}"`);
  if (!npcIds.has(q.npc_entrega)) fail(`${q.missao_id}: unknown npc_entrega "${q.npc_entrega}"`);
  if (Number(q.ordem) === 1 && q.npc_entrega !== q.npc_ativacao)
    fail(`${q.missao_id}: first quest of a chain must turn in at its giver`);
  if (q.npc_entrega !== q.npc_ativacao) cross++;
}
if (cross < 6) fail(`cross turn-ins: ${cross}, need at least 6`);

// --- XP
let xpTotal = 0;
for (const q of quests) {
  const xp = Number(q.xp);
  if (!XP_ALLOWED.includes(xp)) fail(`${q.missao_id}: xp ${q.xp} not one of ${XP_ALLOWED.join("/")}`);
  if (Number(q.ordem) === 3 && xp !== 50) fail(`${q.missao_id}: finale must award 50 XP`);
  xpTotal += xp;
}
if (xpTotal < 400 || xpTotal > 500) fail(`total XP ${xpTotal} outside 400-500`);

// --- objects and quantities
const usage = {};
for (const q of quests) {
  const t = q.tipo_objetivo;
  if (!/^\d+$/.test(q.qtd_objetos)) { fail(`${q.missao_id}: qtd_objetos must be a number, got "${q.qtd_objetos}"`); continue; }
  const qty = Number(q.qtd_objetos);
  if (!["quest_item", "world_prop", "none"].includes(q.tipo_objeto))
    fail(`${q.missao_id}: invalid tipo_objeto "${q.tipo_objeto}"`);
  if (t === "collect" || t === "deliver") {
    if (q.tipo_objeto !== "quest_item" || !q.objeto_id || !q.nome_objeto)
      fail(`${q.missao_id}: ${t} needs a quest_item object`);
  } else if (t === "interact") {
    if (q.tipo_objeto !== "world_prop" || !q.objeto_id || !q.nome_objeto)
      fail(`${q.missao_id}: interact needs a world_prop object`);
  } else if (t === "read") {
    if (q.tipo_objeto === "quest_item" || (q.objeto_id && q.tipo_objeto !== "world_prop"))
      fail(`${q.missao_id}: read allows no object or a world_prop only`);
  } else if (q.tipo_objeto !== "none" || q.objeto_id || q.nome_objeto) {
    fail(`${q.missao_id}: ${t} must have no object`);
  }
  if (t === "collect" && (qty < 1 || qty > 3)) fail(`${q.missao_id}: collect qtd must be 1-3`);
  if ((t === "deliver" || t === "interact") && qty !== 1) fail(`${q.missao_id}: ${t} qtd must be 1`);
  if (["talk", "visit", "read", "minigame"].includes(t) && qty !== 0) fail(`${q.missao_id}: ${t} qtd must be 0`);
  if (q.objeto_id) usage[q.objeto_id] = (usage[q.objeto_id] ?? 0) + 1;
}
const unique = Object.keys(usage).length;
if (unique < 8 || unique > 12) fail(`unique objects: ${unique}, must be 8-12`);
for (const [id, n] of Object.entries(usage)) if (n < 1 || n > 4) fail(`object ${id} used ${n} times (1-4)`);

// --- status
const shippable = quests.filter((q) => q.status_mecanica === "existing" || q.status_mecanica === "partial").length;
if (shippable < 4) fail(`existing/partial quests: ${shippable}, need at least 4`);
for (const s of new Set(quests.map((q) => q.status_mecanica)))
  if (!["existing", "partial", "new"].includes(s)) fail(`invalid status_mecanica "${s}"`);

// --- copy limits
const dialogueMap = new Map(dialogues.map((d) => [d.missao_id, d]));
for (const q of quests) {
  if (!q.titulo_missao) fail(`${q.missao_id}: empty titulo_missao`);
  if (q.titulo_missao.length > 60) fail(`${q.missao_id}: titulo_missao longer than 60`);
  if (!q.descricao_missao) fail(`${q.missao_id}: empty descricao_missao`);
  if (q.descricao_missao.length > 240) fail(`${q.missao_id}: descricao_missao longer than 240`);
  const d = dialogueMap.get(q.missao_id);
  if (!d.fala_oferta) fail(`${q.missao_id}: empty fala_oferta`);
  if (d.fala_oferta.length > 180) fail(`${q.missao_id}: fala_oferta longer than 180`);
  if (!d.fala_entrega) fail(`${q.missao_id}: empty fala_entrega`);
  if (d.fala_entrega.length > 180) fail(`${q.missao_id}: fala_entrega longer than 180`);
}

// --- filler markers (case-sensitive TODO/TBD; pt-BR words like "Todo"/"Toda" must not match)
const allText = [...npcs, ...quests, ...dialogues].flatMap((r) => Object.values(r)).join("\n");
for (const [label, re] of [["TODO", /\bTODO\b/], ["TBD", /\bTBD\b/], ["lorem", /lorem/i], ["placeholder", /placeholder/i], ["???", /\?\?\?/]]) {
  if (re.test(allText)) fail(`filler marker found: ${label}`);
}

// --- report
if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log("OK: quests-v1 passes all structural checks");
console.log(`quests=${quests.length} npcs=${npcs.length} chains=${chains.size} xpTotal=${xpTotal}`);
console.log(`tracks=${JSON.stringify(tracks)} types=${JSON.stringify(typeCount)} objects=${unique}`);
