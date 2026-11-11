#!/usr/bin/env node
/**
 * Validates the quest-object normalisation and prompt queue in content/proposals/quests-v1
 * (PROPOSTA; see objects.md and object-prompts/README.md). Structural rules only.
 * Run: node validate-objects.mjs (works from any cwd). No dependencies.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const promptDir = join(dir, "object-prompts");
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
  return { header, rows: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

const HEADER = [
  "objeto_id", "nome_objeto", "tipo_objeto", "status_build", "gerador", "categoria", "usado_em",
  "qtd_total", "semente", "orcamento_voxels", "orcamento_faces", "tamanho", "interacao", "colisao",
  "materiais", "brief_visual", "notas",
];
const EXISTING_PROPS = ["gift", "lantern", "fence", "sled", "mailbox", "signpost", "garland", "market-stall", "panettone-stand"];
const STATUSES = ["reuse", "pending", "done"];
const INTERACTIONS = ["pickup", "carry", "inspect", "interact", "static"];
const TYPES = ["quest_item", "world_prop"];
const BUDGETS = { quest_item: { voxels: 80, faces: 200 }, world_prop: { voxels: 220, faces: 600 } };
/** Characters a prompt must not contain, so it can be pasted into ompy inside quotes. */
const FORBIDDEN = ["`", '"', "$", "!", "\\", ";", "(", ")", "?", "*", "|", "&", "<", ">", "%", "#", "=", "+", "\u201c", "\u201d"];
const PROMPT_REQUIRED = [
  "apps/client/src/scene/gen/quest-items.ts",
  "Rng",
  "parts.ts",
  "dedupe",
  "ground",
  "Math.random",
  "QUEST_ITEMS",
  "catalog.ts",
  "pnpm --filter @vila/client typecheck",
  "pnpm --filter @vila/client test",
  "pnpm --filter @vila/client build",
  "node apps/client/scripts/gallery.mjs",
  "docs/reference/content.md",
  "CHANGELOG.md",
];

const quests = loadTable("quests.csv");
const { header, rows: objects } = loadTable("objects.csv");

if (header.join(",") !== HEADER.join(",")) fail(`objects.csv: header must be ${HEADER.join(",")}`);

// --- quests that carry an object
const questObjects = new Map();
const objectIdOfQuest = new Map();
const noneQuests = new Set();
for (const q of quests.rows) {
  if (q.tipo_objeto === "none") {
    if (q.objeto_id) fail(`${q.missao_id}: tipo_objeto none must not name an object`);
    noneQuests.add(q.missao_id);
    continue;
  }
  if (!TYPES.includes(q.tipo_objeto)) { fail(`${q.missao_id}: invalid tipo_objeto "${q.tipo_objeto}"`); continue; }
  if (!q.objeto_id) { fail(`${q.missao_id}: missing objeto_id`); continue; }
  if (!/^\d+$/.test(q.qtd_objetos)) { fail(`${q.missao_id}: qtd_objetos must be a number`); continue; }
  const entry = questObjects.get(q.objeto_id) ?? { quests: [], qty: 0, nome: q.nome_objeto, tipo: q.tipo_objeto };
  if (entry.nome !== q.nome_objeto) fail(`${q.objeto_id}: nome_objeto differs between ${entry.quests[0]} and ${q.missao_id}`);
  if (entry.tipo !== q.tipo_objeto) fail(`${q.objeto_id}: tipo_objeto differs between ${entry.quests[0]} and ${q.missao_id}`);
  entry.quests.push(q.missao_id);
  entry.qty += Number(q.qtd_objetos);
  questObjects.set(q.objeto_id, entry);
  objectIdOfQuest.set(q.missao_id, q.objeto_id);
}

// --- 2. cardinality
if (objects.length < 8 || objects.length > 12) fail(`objects.csv: ${objects.length} objects, must be 8-12`);

// --- 4. unique ids plus 5/6/7 per object
const ids = new Set();
const generators = new Map();
const seeds = new Map();
for (const o of objects) {
  const id = o.objeto_id;
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) fail(`${id}: invalid objeto_id`);
  if (ids.has(id)) fail(`${id}: duplicated objeto_id`);
  ids.add(id);

  // --- unique gerador and semente
  if (generators.has(o.gerador)) fail(`${id}: gerador ${o.gerador} also used by ${generators.get(o.gerador)}`);
  generators.set(o.gerador, id);
  if (seeds.has(o.semente)) fail(`${id}: semente ${o.semente} also used by ${seeds.get(o.semente)}`);
  seeds.set(o.semente, id);

  // --- status, category, interaction, collision
  if (!STATUSES.includes(o.status_build)) fail(`${id}: invalid status_build "${o.status_build}"`);
  if (o.categoria !== "props") fail(`${id}: categoria must be props`);
  if (!INTERACTIONS.includes(o.interacao)) fail(`${id}: invalid interacao "${o.interacao}"`);
  if (!TYPES.includes(o.tipo_objeto)) { fail(`${id}: invalid tipo_objeto "${o.tipo_objeto}"`); continue; }
  if (o.tipo_objeto === "quest_item" && o.colisao !== "none") fail(`${id}: quest_item needs colisao none`);
  if (o.tipo_objeto === "world_prop" && !["small", "none"].includes(o.colisao)) fail(`${id}: world_prop colisao must be small or none`);

  if (o.status_build === "reuse") {
    if (!EXISTING_PROPS.includes(o.gerador)) fail(`${id}: reuse needs an existing props generator, got "${o.gerador}"`);
  } else if (o.gerador !== `quest-${id}`) {
    fail(`${id}: new object needs gerador quest-${id}, got "${o.gerador}"`);
  }

  // --- budgets
  const budget = BUDGETS[o.tipo_objeto];
  for (const [key, column] of [["voxels", "orcamento_voxels"], ["faces", "orcamento_faces"]]) {
    const raw = o[column];
    if (!/^\d+$/.test(raw)) { fail(`${id}: ${column} must be a positive integer`); continue; }
    const n = Number(raw);
    if (n < 1 || n > budget[key]) fail(`${id}: ${column} ${n} outside 1-${budget[key]}`);
  }
  if (!(Number(o.tamanho) > 0)) fail(`${id}: tamanho must be a positive number`);

  // --- coverage and quantities
  const expected = questObjects.get(id);
  if (!expected) { fail(`${id}: no quest in quests.csv uses this object`); continue; }
  if (expected.nome !== o.nome_objeto) fail(`${id}: nome_objeto "${o.nome_objeto}" differs from quests.csv "${expected.nome}"`);
  if (expected.tipo !== o.tipo_objeto) fail(`${id}: tipo_objeto "${o.tipo_objeto}" differs from quests.csv "${expected.tipo}"`);
  if (!/^\d+$/.test(o.qtd_total)) fail(`${id}: qtd_total must be a number`);
  else if (Number(o.qtd_total) !== expected.qty) fail(`${id}: qtd_total ${o.qtd_total} differs from quests.csv sum ${expected.qty}`);

  // --- usage 1-4 missions, matching quests.csv
  const used = o.usado_em.split(";").map((s) => s.trim()).filter(Boolean);
  if (used.length < 1 || used.length > 4) fail(`${id}: used in ${used.length} missions, must be 1-4`);
  for (const mission of used) if (!objectIdOfQuest.has(mission)) fail(`${id}: usado_em references ${mission}, which carries no object`);
  for (const mission of expected.quests) if (!used.includes(mission)) fail(`${id}: usado_em is missing ${mission}`);
  for (const mission of used) if (!expected.quests.includes(mission)) fail(`${id}: usado_em lists ${mission}, which uses another object`);
  if (o.usado_em.split(";").some((s) => noneQuests.has(s.trim()))) fail(`${id}: usado_em lists a mission without an object`);
}

// --- every quest with an object is covered exactly once
for (const id of questObjects.keys()) if (!ids.has(id)) fail(`objects.csv: missing row for ${id}`);

// --- 8. prompts for new objects, none for reuse, numbering without holes
const promptFiles = existsSync(promptDir) ? readdirSync(promptDir).filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f)) : [];
const named = promptFiles.map((file) => {
  const m = /^(\d{2})-(.+)\.md$/.exec(file);
  return { file, order: Number(m[1]), id: m[2] };
});
const orders = named.map((p) => p.order).sort((a, b) => a - b);
if (orders.some((n, i) => n !== i + 1)) fail(`object-prompts: numbering has a hole (${orders.join(",")})`);
const newObjects = objects.filter((o) => o.status_build !== "reuse");
const promptOf = new Map(named.map((p) => [p.id, p]));
if (named.length !== newObjects.length) fail(`object-prompts: ${named.length} prompts for ${newObjects.length} new objects`);

const readText = (file) => readFileSync(join(promptDir, file), "utf8");
const queue = existsSync(join(promptDir, "README.md")) ? readFileSync(join(promptDir, "README.md"), "utf8") : "";
if (!queue) fail("object-prompts/README.md is missing");
const index = existsSync(join(dir, "objects.md")) ? readFileSync(join(dir, "objects.md"), "utf8") : "";
if (!index) fail("objects.md is missing");

for (const o of objects) {
  const prompt = promptOf.get(o.objeto_id);
  if (o.status_build === "reuse") {
    if (prompt) fail(`${o.objeto_id}: reuse objects must not have a prompt (${prompt.file})`);
    continue;
  }
  if (!prompt) { fail(`${o.objeto_id}: missing object-prompts/NN-${o.objeto_id}.md`); continue; }
  if (!queue.includes(prompt.file)) fail(`object-prompts/README.md: ${prompt.file} is not listed`);
  if (!index.includes(prompt.file)) fail(`objects.md: ${prompt.file} is not linked`);
  const body = readText(prompt.file).trim();
  if (body.includes("\n")) fail(`${prompt.file}: must be a single paragraph`);
  for (const ch of FORBIDDEN) if (body.includes(ch)) fail(`${prompt.file}: forbidden character ${JSON.stringify(ch)}`);
  for (const needle of PROMPT_REQUIRED) if (!body.includes(needle)) fail(`${prompt.file}: missing ${needle}`);
  if (!body.includes(`quest-${o.objeto_id}`)) fail(`${prompt.file}: missing generator id quest-${o.objeto_id}`);
  const budget = BUDGETS[o.tipo_objeto];
  if (!body.includes(`${budget.voxels} voxels e ${budget.faces} faces`)) fail(`${prompt.file}: budget ${budget.voxels} voxels e ${budget.faces} faces is not stated`);
}
for (const p of named) if (!ids.has(p.id)) fail(`object-prompts/${p.file}: unknown objeto_id ${p.id}`);

// --- 9. filler markers
const corpus = [existsSync(join(dir, "objects.csv")) ? readFileSync(join(dir, "objects.csv"), "utf8") : "", index, queue, ...named.map((p) => readText(p.file))].join("\n");
for (const [label, re] of [["TODO", /\bTODO\b/], ["TBD", /\bTBD\b/], ["lorem", /lorem/i], ["placeholder", /placeholder/i], ["???", /\?\?\?/]]) {
  if (re.test(corpus)) fail(`filler marker found: ${label}`);
}

// --- report
if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
const reuse = objects.filter((o) => o.status_build === "reuse").length;
console.log("OK: quests-v1 objects pass all checks");
console.log(`objects=${objects.length} reuse=${reuse} new=${newObjects.length} prompts=${named.length}`);
console.log(`quests_with_object=${objectIdOfQuest.size} missions=${quests.rows.length}`);
