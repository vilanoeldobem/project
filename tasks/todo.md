# Vila Noel do Bem — Task 1: repository foundation and first slice (0.1.0) — 2026-11-08

Context: empty code repository (only `LICENSE`). Product docs live in `vilanoeldobem_docs`
(DEC-001..DEC-044, `docs/decisions/registro-de-decisoes.md`). No technology is decided in the docs (card G11 open).
The owner asked for Three.js + React + Cloudflare, published to Cloudflare account `9119b7496767fec497f6627c5ca56f32`.

## Plan

### Phase A — Governance
- [x] `AGENTS.md`, `CLAUDE.md` (points to AGENTS), `README.md`, `CONTRIBUTING.md`
- [x] `CHANGELOG.md` (Keep a Changelog + SemVer), `ROADMAP.md` (milestones to 30/11)
- [x] `.github/PULL_REQUEST_TEMPLATE.md`
- [x] Diátaxis `docs/`: README, getting-started, guides, reference, explanation, decisions, specs, implementation
- [x] ADRs IMPL-0001 (stack, PROPOSAL pending G11), IMPL-0002 (donations disabled), IMPL-0003; open questions

### Phase B — Application (`apps/web`)
- [x] Vite + React 19 + Three.js (react-three-fiber) + TypeScript
- [x] Voxel scene: plaza, central tree (global-donation marker), ring street, available lots
- [x] Avatar with keyboard and tap/click movement; following diagonal camera
- [x] HUD: P01 (three paths), P02 (indicators with "—"), lot panel (P03), mission log (P14)
- [x] Memory game (first minigame, doc 23), unrelated to donations
- [x] Worker (Static Assets + `/api/*`) with D1: `health`, `indicators`, `lots`
- [x] `migrations/0001_initial.sql` and `0002_seed_lots.sql` (world structure, no fake data)

### Phase C — Validation
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build`
- [x] Local smoke (`wrangler dev`) of `/api/*`

### Phase D — Publishing
- [x] `wrangler` authenticated on account `9119b749…` (after `wrangler logout && login`)
- [x] Create D1 `vilanoeldobem` (7c65d21d…, enam), apply remote migrations, `wrangler deploy`

## Review (2026-11-08)
- Governance files, Diátaxis docs, ADRs IMPL-0001..0003, open questions OQ-01..06, report
  `docs/implementation/slice-01-report.md`.
- App: voxel plaza, avatar, camera, 8 lots from D1, P01/P02/P03/P04 panels, memory game, idempotent missions,
  Worker `/api/health|indicators|lots`.
- Gates: typecheck ok; 11 tests ok; build ok. Local `smoke-api.sh` 8/8. `verify.mjs` desktop + phone, no errors.
- Deploy: https://vilanoeldobem.vilanoeldobem.workers.dev (version 3d2dfada…). Production smoke 8/8,
  security headers present, `verify.mjs` clean.

## Lessons
- Workers: the main module may only export handlers; exported constants break the runtime
  ("Incorrect type for map entry"). Keep logic in a separate module.
- macOS is case-insensitive: `voxels.ts` and `Voxels.tsx` collide in TypeScript. Use distinct names.
- Vite 8 (rolldown): `manualChunks` only accepts a function.
- A label hidden on phones (`display:none`) removes the button's accessible name: add `aria-label`.
- `pnpm deploy` is a pnpm built-in and does not run the script: always `pnpm run deploy`.
- Wrangler's OAuth token only sees accounts granted at login time: new access needs `logout && login`.

---

# Task 2: language policy — English code and agent talk, pt-BR docs (0.2.0) — 2026-11-08

Context: owner rule — agents talk in en-US, code in en-US, docs in pt-BR; check for names/copyright unrelated
to "Vila Noel do Bem".

## Plan
- [x] Audit for foreign product/company names and copyright (none; LICENSE holder `vilanoeldobem` = project org)
- [x] Translate code comments, tests, scripts, CSS tokens to English; keep UI copy pt-BR
- [x] English identifiers: `ngo`, `lot`, `plaza`, `gift`, states, mission ids, API keys
- [x] `0003_english_schema.sql` (rebuild `ongs` → `ngos`, `lots`), data mapping tested with sqlite3
- [x] 0001/0002: translate comments only; SQL verified identical by diff
- [x] ADR IMPL-0004, AGENTS.md language section, CLAUDE.md, CONTRIBUTING, PR template, docs references
- [x] CHANGELOG 0.2.0 (breaking API/schema), README, ROADMAP version shift
- [x] Deploy 0.2.0 schema (remote migration 0003) together with the 0.3.0 deploy

## Review (2026-11-08)
- Gates: typecheck ok, 11 tests ok, build ok. Local `wrangler dev` with fresh D1 (0001→0003): smoke 9/9,
  `verify.mjs` desktop + phone clean.
- Production still runs 0.1.0 with schema v2 (consistent pair) until approved deploy.

## Lessons
- SQLite cannot alter CHECK constraints: renaming enum values needs a table rebuild with
  `PRAGMA defer_foreign_keys = true`.
- Deploy code and the schema migration together: old Worker + new schema (or the reverse) breaks `/api/lots`.

---

# Task 3: public website and official domains (0.3.0) — 2026-11-08

Context: owner asked for `apps/site` on www.vilanoeldobem.com.br and the game on app.vilanoeldobem.com.br.
Interpretation: www (+ apex redirect) → website; app → game; every website CTA links to the game.

## Plan
- [x] Zone `vilanoeldobem.com.br` confirmed active in account 9119b749…
- [x] `apps/site`: React + Vite landing (approved copy only), 404 page, apex → www Worker redirect (tested)
- [x] `apps/web` custom domain `app.vilanoeldobem.com.br`; remote migration 0003 then deploy
- [x] `apps/site` custom domains www + apex; deploy
- [x] Fix CSP for zone-injected Cloudflare Web Analytics beacon (console error found by verify.mjs)
- [x] IMPL-0005, CHANGELOG 0.3.0, README, ROADMAP, deploy guide, architecture

## Review (2026-11-08)
- Gates: typecheck ok (2 apps), tests 11 + 2 ok, builds ok.
- Production: `smoke-api.sh https://app.vilanoeldobem.com.br` 9/9; `verify.mjs` game + site clean (desktop + phone);
  www 200; apex `301 → https://www.vilanoeldobem.com.br/ongs?x=1` (path and query kept).
- New custom domains answered 522 for ~1–2 minutes after the first deploy (edge propagation), then 200.

## Lessons
- Zone-level Cloudflare Web Analytics injects a beacon script; a strict CSP must allow it or the console errors.
- `zsh` globs `?` in unquoted URLs: always quote URLs with query strings.
