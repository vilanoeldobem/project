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

---

# Task 4: Christmas environment — real São Paulo time, procedural shared weather, snowy village (0.4.0) — 2026-11-09

Context: owner pasted the "CHRISTMAS WORLD" technical spec (v1.0, PROPOSTA) and chose: **snowy village** (replaces the
"Brazilian summer" scene study, itself PROPOSTA in the docs repo), **stateless Worker endpoint** (no Durable Object:
the game has no multiplayer/WebSocket yet; D1 stays the only store), **full spec scope**.

Audit (spec phase 0): three 0.187 + r3f 9 + drei 10, WebGLRenderer, no post-processing, instanced voxels
(`scene/Voxels.tsx`), single-player, Worker = stateless `/api/*` + D1. No renderer migration (spec §6.1).

Adaptations: spec §13 DO/WS → `GET /api/environment` snapshot (time authority + seed + versions + scheduled events);
deterministic weather means every client computes the same macro state with no broadcast. Admin overrides, shared
footprints and interiors need auth/multiplayer/enterable buildings that do not exist → deferred (documented).
Scheduled events are code constants (versioned), not admin mutations.

## Plan
### Environment core (pure, shared by client and Worker)
- [x] `src/environment/time.ts` — SP seconds-of-day via Intl (no fixed UTC-3), SP civil date → epoch, smoothstep, phase
- [x] `random.ts` (Math.imul hash), `weather.ts` (slot model v1, circular wind lerp), `events.ts` (scheduled overrides)
- [x] `keyframes.ts` — sky/sun/moon/hemi/artificial/stars/fog/exposure keyframes by SP time, continuous across midnight
- [x] `network-clock.ts` — monotonic anchor, min-RTT sample filter, slew small corrections, outlier rejection
- [x] `config.ts` — worldId, seed, versions, slot/transition (single source for Worker + client)
- [x] Tests: time boundaries/midnight/year, determinism, continuity, wind wrap, ranges, events expiry, clock slew

### Worker
- [x] `GET /api/environment` (no-store) + test; docs/reference/api.md

### Client runtime
- [x] Environment driver: one timestamp per frame → mutable frame object (no React re-render per frame)
- [x] Settings store (quality preset auto/manual, reduce motion, reduce flicker, particles, sound) persisted locally
- [x] Snapshot bootstrap + periodic/visibility resync; offline fallback marked as not synced

### Scene (snowy village)
- [x] Snow palette; snowy ground with tonal variation; pines with snow caps replace palms (gift id `gift-palm` kept: mission event id)
- [x] Sky dome shader (gradient), seeded stars, cartoon moon, clouds, rare shooting stars, aurora (event/rare)
- [x] Lighting controller: sun/moon/hemi/fog driven by keyframes + weather; shadow budget by preset
- [x] Emissive holiday lights: shared material with deterministic twinkle (reduce-flicker aware); window glow; light strings
- [x] GPU snow (instanced billboards, camera-local volume, wind drift, density by snowfall × preset)
- [x] Wind sway on pines (vertex shader), smoke leaning with wind on chimneys, footprints pool (local)
- [x] Decor: snowmen, Santa's sleigh + reindeer (idle), frozen pond (ice shader), distant voxel mountains, magic sparkles
- [x] Post-processing: bloom (high/ultra) + single tone-map/output pass
- [x] Procedural WebAudio ambience (wind/bells), off by default

### UI
- [x] HUD time/weather chip; "Ambiente" settings panel (pt-BR); dev-only debug panel + time override

### Docs & release
- [x] ADR IMPL-0006; docs/reference/environment.md; architecture/api/development guide; OQ-07; CHANGELOG [Unreleased]
  (no version bump: ROADMAP reserves 0.4.0 for "Contas e ONGs"; release decides the number)
- [x] Gates: typecheck, test, build, verify.mjs desktop+phone (day/night/blizzard screenshots)

## Review (2026-11-09)
- Gates: typecheck ok (2 apps); tests 36 web (+25 environment: SP time/DST/year turn, phases, weather determinism,
  distribution, continuity, wind wrap, events, keyframes continuity/fog cap, clock slew/jump/outliers, snapshot
  contract, `/api/environment`) + 2 site; build ok. `verify.mjs` (local `wrangler dev`, port 8799 because 8787 was
  taken by another local app) clean on desktop + phone + 5 environment scenes (dawn mist, day snow, dusk clear,
  night blizzard, night sky with aurora; presets low→ultra).
- Committed, PR #3; deployed by the owner from the PR branch (version 4156a103…). Production: `/api/environment`
  no-store ok, `smoke-api.sh` ok, `verify.mjs` clean (night, clear frost at 22:54 SP).
- Not measured: real GPU performance (swiftshader runs at ~2 fps); needs a device benchmark (G12).
- Deferred from the spec (documented in IMPL-0006): Durable Object/WebSocket, admin overrides, shared footprints,
  interiors (no enterable buildings), WebGPU/TSL, correlated weather v2.

## Lessons
- The gameplay camera never sees the horizon (top edge ~29° below it): sky work is invisible without a sky view.
- Keyframe colours are sRGB; `Color.setRGB` and shader uniforms are Linear-sRGB → convert (`linear()`), and give
  custom ShaderMaterials `#include <colorspace_fragment>` so composer and direct rendering match.
- A point light with a `distance` cut-off draws a visible ring on bright snow; use `distance: 0` (inverse-square).
- Anything per-frame that calls `Intl` must be memoised (events per year), or it also thrashes the civil-time cache.
- Software GL screenshots: camera easing is per-frame with a clamped dt, so transitions need long waits.
