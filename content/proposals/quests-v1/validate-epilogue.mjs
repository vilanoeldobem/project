#!/usr/bin/env node
/**
 * Validates the epilogue chain "welcome-bough" (PROPOSTA, PEN-025) inside quests-v1.
 * Structural rules only; the global counts stay in validate-quests.mjs.
 * Run: node validate-epilogue.mjs (works from any cwd). No dependencies.
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

const CHAIN = "welcome-bough";
const XP_ALLOWED = [15, 20, 25, 30, 40, 50];
const TYPES = ["interact", "collect", "deliver"];
const quests = loadTable("quests.csv").filter((q) => q.cadeia_id === CHAIN);
const dialogues = new Map(loadTable("dialogues.csv").filter((d) => quests.some((q) => q.missao_id === d.missao_id)).map((d) => [d.missao_id, d]));

if (quests.length !== 3) fail(`${CHAIN}: expected 3 quests, got ${quests.length}`);
const sorted = [...quests].sort((a, b) => Number(a.ordem) - Number(b.ordem));

if (sorted.map((q) => Number(q.ordem)).join(",") !== "1,2,3") fail(`${CHAIN}: ordem must be 1,2,3`);
if (new Set(sorted.map((q) => q.npc_ativacao)).size !== 1) fail(`${CHAIN}: quests must share one activation NPC`);
if (sorted[0].npc_ativacao !== "storyteller") fail(`${CHAIN}: activation NPC must be storyteller`);
if (new Set(sorted.map((q) => q.tipo_objetivo)).size !== TYPES.length) fail(`${CHAIN}: objective types must be distinct`);
for (const t of TYPES) if (!sorted.some((q) => q.tipo_objetivo === t)) fail(`${CHAIN}: missing objective type ${t}`);
if (sorted.map((q) => q.tipo_objetivo).sort().join(",") !== [...TYPES].sort().join(",")) fail(`${CHAIN}: objective types must be exactly ${TYPES.join(", ")}`);

const prerequisites = ["story-page-delivery", "bough-ribbon", "bough-sprigs"];
sorted.forEach((q, i) => {
  if (q.prerequisito_id !== prerequisites[i]) fail(`${q.missao_id}: prerequisito_id must be "${prerequisites[i]}", got "${q.prerequisito_id}"`);
});

let xpTotal = 0;
for (const q of sorted) {
  const xp = Number(q.xp);
  if (!XP_ALLOWED.includes(xp)) fail(`${q.missao_id}: xp ${q.xp} not one of ${XP_ALLOWED.join("/")}`);
  if (Number(q.ordem) === 3 && xp !== 50) fail(`${q.missao_id}: finale must award 50 XP`);
  xpTotal += xp;
}
if (xpTotal !== 85) fail(`${CHAIN}: total XP must be 85, got ${xpTotal}`);

const cross = sorted.filter((q) => q.npc_entrega !== q.npc_ativacao);
if (!cross.length) fail(`${CHAIN}: needs at least one cross turn-in`);
if (sorted[0].npc_entrega !== sorted[0].npc_ativacao) fail(`${sorted[0].missao_id}: first quest must turn in at its giver`);

for (const q of sorted) {
  const dialogue = dialogues.get(q.missao_id);
  if (!dialogue) fail(`${q.missao_id}: missing dialogues.csv row`);
  if (!q.titulo_missao) fail(`${q.missao_id}: empty titulo_missao`);
  if (q.titulo_missao.length > 60) fail(`${q.missao_id}: titulo_missao longer than 60`);
  if (!q.descricao_missao) fail(`${q.missao_id}: empty descricao_missao`);
  if (q.descricao_missao.length > 240) fail(`${q.missao_id}: descricao_missao longer than 240`);
  if (!dialogue?.fala_oferta) fail(`${q.missao_id}: empty fala_oferta`);
  if (dialogue?.fala_oferta.length > 180) fail(`${q.missao_id}: fala_oferta longer than 180`);
  if (!dialogue?.fala_entrega) fail(`${q.missao_id}: empty fala_entrega`);
  if (dialogue?.fala_entrega.length > 180) fail(`${q.missao_id}: fala_entrega longer than 180`);
  if (q.status_mecanica !== "new") fail(`${q.missao_id}: status_mecanica must be new`);
  if (!/^\d+$/.test(q.qtd_objetos)) fail(`${q.missao_id}: qtd_objetos must be a number`);
  if (q.tipo_objetivo === "interact") {
    if (q.tipo_objeto !== "world_prop" || !q.objeto_id || !q.nome_objeto) fail(`${q.missao_id}: interact needs a world_prop object`);
    if (Number(q.qtd_objetos) !== 1) fail(`${q.missao_id}: interact qtd must be 1`);
  }
  if (q.tipo_objetivo === "collect") {
    if (q.tipo_objeto !== "quest_item" || !q.objeto_id || !q.nome_objeto) fail(`${q.missao_id}: collect needs a quest_item object`);
    if (Number(q.qtd_objetos) !== 2) fail(`${q.missao_id}: collect qtd must be 2`);
  }
  if (q.tipo_objetivo === "deliver") {
    if (q.tipo_objeto !== "quest_item" || !q.objeto_id || !q.nome_objeto) fail(`${q.missao_id}: deliver needs a quest_item object`);
    if (Number(q.qtd_objetos) !== 1) fail(`${q.missao_id}: deliver qtd must be 1`);
  }
}

const allText = [...quests, ...[...dialogues.values()]].flatMap((r) => Object.values(r)).join("\n");
for (const [label, re] of [["TODO", /\bTODO\b/], ["TBD", /\bTBD\b/], ["lorem", /lorem/i], ["placeholder", /placeholder/i], ["???", /\?\?\?/]]) {
  if (re.test(allText)) fail(`filler marker found: ${label}`);
}
if (/ao norte/i.test(allText)) fail('cardinal direction "ao norte" found in epilogue copy');

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log("OK: epilogue welcome-bough passes all structural checks");
console.log(`quests=${sorted.length} xpTotal=${xpTotal}`);
