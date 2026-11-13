# Vila Noel do Bem — Task 1: repository foundation and first slice (0.1.0) — 2026-11-08

Context: empty code repository (only `LICENSE`). Product docs lived in `vilanoeldobem_docs` (now `vilanoeldobem/docs`)
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

# Task 5: Three.js chunk ≤ 250 kB gzip (roadmap infra item 4)

## Plan

- [x] Measure chunk composition (rolldown `generateBundle` module sizes)
- [x] Move react/react-dom/scheduler/zustand to a `react` vendor chunk (shell no longer preloads `three`)
- [x] Lazy-load `PostFx` (bloom, high/ultra only); keep `three/examples` out of `three`
- [x] typecheck, test, build, verify.mjs (bloom renders on high/ultra, no errors)
- [x] Docs: architecture §6, ROADMAP, CHANGELOG

## Review (2026-11-10)

- `three` 317.5 → 244.7 kB gzip; shell critical path = `react` 69 kB + `index` 15 kB; `PostFx` 4.8 kB on demand.
- drei was already only `Html` (13 kB raw); not the problem. The bulk was react-dom pulled into `three` by
  rolldown's dependency capture, and the shell preloaded `three` because zustand landed there too.
- Three itself stays whole: r3f does `import * as THREE` for its catalogue. Further cuts need r3f changes; measure on
  a real phone first (G12).

## Lessons

- With rolldown `manualChunks`, shared deps of matched modules get captured into the group: check which chunks
  `index.html` modulepreloads, not only chunk sizes.

---

# Task 6: engine, graphics and gameplay polish (voxel mesher, fixed-step sim, feel, VFX, SFX) — 2026-11-10

Context: owner asked for a full engine/graphics/gameplay/audio quality pass. Audit (2026-11-10):

- **Rendering:** every voxel is a full instanced cube (12 tris), hidden faces included; ground ≈ 4.4k cubes, forest
  ≈ 12k cubes; one `InstancedMesh` per material role per prop instance (lamps ×8, lots ×8, snowmen ×3…) → many
  draw calls, doubled by the shadow pass. No ambient occlusion: voxels read flat. 2% cube gap = seams.
- **Simulation:** player moves at constant speed with instant start/stop and a snapped rotation; no collision with
  pines, lamps, snowmen, sleigh or houses; variable-dt integration; position written to zustand **every frame**
  (every store selector re-runs each frame).
- **Feel/feedback:** avatar is a rigid block with a sine bob (no walk cycle); gift pickup and mission completion
  have no VFX/SFX; footprints are not tied to steps; camera has no look-ahead.
- **Audio:** only wind + random bells; no footsteps, interaction or reward sounds.
- **Perf:** no adaptive resolution; no runtime stats beyond FPS.
- **Multiplayer:** none (single-player by design, IMPL-0006). Out of scope: no Durable Object/WebSocket (AGENTS.md
  forbids new Cloudflare resources without authorisation). Prepare instead: pure fixed-step simulation separated
  from presentation.

## Plan

- [x] Instrumentation: draw calls, triangles, frame time p50/p95 in `?envDebug`; verify.mjs saves stats → baseline
- [x] Voxel mesher (`scene/mesher.ts`, pure + tests): face culling across roles, per-vertex AO, AO-aware quad flip,
      per-vertex `aCenter` for sway/twinkle shaders; `Voxels` renders merged meshes, repeated props as one
      instanced draw (`transforms`)
- [x] Shaders: foliage sway as downwind gust wave from `aCenter` (rigid voxels), twinkle phase from `aCenter`
- [x] Simulation (`game/motion.ts`, pure + tests): acceleration/friction, smooth turn, circle colliders with
      sliding, stuck target release; fixed 60 Hz step + render interpolation; player pose in a mutable `sim` object
      (no per-frame store writes)
- [x] Surfaces (`surfaceAt`) + gameplay event bus (step, gift, mission) driving footprints, VFX and SFX
- [x] Avatar animation: walk cycle (legs/arms), lean, idle breathing; blob contact shadow; camera look-ahead
- [x] VFX: pooled GPU bursts — snow kick-up on steps, gold sparkle burst on gift pickup
- [x] Audio engine: one AudioContext, compressor bus, ambience + surface-aware footsteps, pickup chime, mission
      jingle; voice cap and pitch/volume variation; still off by default
- [x] Adaptive DPR from frame-time p95 (stable frame pacing)
- [x] Gates + verify.mjs before/after stats; docs (architecture, environment, ADR IMPL-0007), CHANGELOG

## Review (2026-11-10)

- Gates: typecheck ok (2 apps); tests 54 web (+18: mesher culling/AO/winding/dedupe/off-grid, motion
  accel/brake/arrival/collision slide/stuck/world bound/footsteps/determinism, obstacle clearance, surfaces) + 2 site;
  build ok, `three` chunk unchanged (244.7 kB gzip). `verify.mjs` (local `wrangler dev`, port 8799) clean on
  desktop + phone + 5 environment scenes.
- Measured (verify.mjs stats, medium, "dia-neve"): draw calls 96 → 56, triangles/frame 362k → 108k. Low preset
  scene: 210k → 69k triangles. Real GPU timing still unmeasured (swiftshader); needs device benchmark (G12).
- Independent review: 0 critical; fixed 4 risks (Instanced effect deps, instanced foliage wind direction, adaptive
  DPR on CPU-bound devices, backoff never decaying) and 2 questions (pine collider 1.1 → 1.6, AO diagonal comment).
- Not done / limits: no real-time multiplayer (needs authorised Cloudflare resources); greedy meshing deferred;
  gift pickup not exercised in the browser script (software GL too slow) — covered by unit tests of the pieces.
- Docs: ADR IMPL-0007, architecture, environment, CHANGELOG [Unreleased].

## Lessons

- In r3f, any `useFrame` with priority > 0 turns off automatic rendering: read `gl.info` at the start of the next
  frame (negative priority) with `autoReset = false` instead of adding a late callback.
- Adaptive resolution must check that stepping down actually bought frame time; CPU-bound devices otherwise lose
  resolution for nothing.
- Moving a per-frame value out of zustand removed 60 Hz selector churn for the whole HUD.

---

# Task 7: real-time multiplayer presence (IMPL-0008) — 2026-11-10

- [x] Shared protocol (`src/net/protocol.ts`), pure room logic (`worker/room.ts`), `VillageRoom` DO (hibernation)
- [x] `/api/room` same-origin upgrade, bounded room index, 503 without binding; `wrangler.jsonc` DO binding + migration
- [x] Client: connection manager (room fallback, backoff), snapshot interpolation, instanced remote avatars
- [x] Opt-out toggle, visitor chip; CSP `wss://`
- [x] Gift pickup verified in a real browser (dev hook `window.__vila`, localhost only); tree is a sliding collider
- [x] Docs: IMPL-0008, api, architecture, deploy guide, AGENTS.md storage rule, CHANGELOG

## Review (2026-11-10)
- Gates: typecheck ok; tests 69 web (+15: protocol, room capacity/teleport/batching/rate limit, `/api/room` guards,
  interpolation) + 2 site; build ok. `verify.mjs` on local `wrangler dev`: gifts + mission in browser; two browser
  contexts see each other, walking shows up, leaving removes the avatar; no console errors.
- Not deployed (needs owner authorisation: creates the DO class). Not measured: cross-region latency, 40-person room.

## Lessons
- Two software-GL pages starve Playwright's "stable" actionability check: use `dispatchEvent("click")` there.

---

# Task 8: seeded procedural voxel content (approved 2026-11-10; phases 0–5 done) — 2026-11-10

Goal: deterministic generators for houses, characters, animals, props and avatar cosmetics that match the existing
models and stay inside a measured budget. Product rules: cosmetics only from missions/levels (PROPOSTA), no purchases,
loot boxes, random drops or time-online rewards; no fake NGOs/branding; XP rules unchanged.

## Phase 0 — shared generator core
- [x] `scene/gen/rng.ts`: seeded PRNG (`seedOf` FNV-1a → mulberry32), `int`, `float`, `pick`, `chance`
- [x] `scene/gen/parts.ts`: `box`, `shell`, `disc`, `mirrorX`, `place` (quarter turns), snow-cap pass, palette
      variants as named derivations of `PALETTE` (no free colours)
- [x] `scene/gen/budget.ts`: per-category max voxels + max faces (counted with `meshVoxels`)
- [x] Generic test harness: deterministic per seed, budget, ≥ N distinct variants (hash), integer coords, base y=0,
      snapshot hashes for fixed seeds (art changes show up as failing tests)
- [x] Lint guard test: no `Math.random` under `scene/gen/`
- [x] Dev gallery `?gallery` (localhost only): grid per category × 8 seeds, orbit camera, voxel/face counts per model
- [x] `verify.mjs`: gallery screenshots + calls/tris/p95 per category

## Phase 1 — props and items (budget: ≤ 220 voxels, ≤ 600 faces)
- [x] Gifts (pattern stripes/dots/checks, ribbon cross/bow), lanterns (emissive), fences, sleds, mailboxes,
      signposts (no text), garlands (emissive bulbs), market stalls; Brazilian touches: panetone stand
- [x] Replace the hand-made `gift()` with the generator (gift ids/positions unchanged)

### Phases 0–1 review (2026-11-10)
- 9 prop generators; max voxels/faces over 8 gallery seeds vs budget 220/600: gift 130/166, lantern 85/216,
  fence 49/166, sled 80/250, mailbox 64/146, signpost 25/102, garland 44/154, stall 111/318, panettone 110/322.
- Village ("dia-neve", medium): 56 → 55 calls, 108.1k → 109.0k tris (generated gifts). Gallery props: 100 calls,
  27.6k tris. Tests +38 (contract × 9 generators, snapshot, Math.random guard).
- Placement of new props in the village waits for the layout decision (PEN-017/PEN-023).

## Phase 2 — houses (budget: ≤ 900 voxels, ≤ 1 800 faces)
- [x] Footprint 5–7, 1–2 floors, roof (gable / hip / A-frame), porch, wreath, snow on roof, chimney at a
      generator-reported chimney point (smoke uses it), windows on the `glow` role (lit by real SP time already)
- [x] NGO lots: seed = lot id; neutral palette; never logos or text
- [x] Far LOD: deferred (houses only on 8 lots, ≤ 950 faces each; not worth it until measured)

### Phase 2 review (2026-11-10)
- House max over gallery seeds: 367/900 voxels, 950/1800 faces. Gallery houses: 16 calls, 13.3k tris.
- Village unchanged locally (no published NGO in local D1; no fake NGOs added). Tests: chimney anchor, lit windows,
  footprint ≤ 5 voxels from lot centre, contract + snapshot.

## Phase 3 — characters (budget: ≤ 160 voxels, ≤ 420 faces)
- [x] Neutral villagers: body height, coat, scarf, hat from palette variants; no names, short or no labels
- [x] Placed as decor (`CRITTERS`, PROPOSTA); idle breathing/look-around in shader via `aCenter` (`idleMaterial`)

## Phase 4 — animals (budget: ≤ 140 voxels, ≤ 380 faces)
- [x] Reindeer variants, dogs, cats, birds, rabbits, owls (night only, from SP time)
- [x] `idle` material role: vertex-shader breathing / head bob keyed on `aCenter` + instance phase

### Phases 3–4 review (2026-11-10)
- Max over gallery seeds vs budget: villager 128/160 voxels, 266/420 faces; reindeer 124/140, 294/380; dog 80/190;
  cat 59/160; bird 30/78; rabbit 62/140; owl 58/106.
- Village ("dia-neve", medium): 55 → 66 calls, 109.0k → 112.6k tris with 9 critters (tiny animals skip the shadow
  pass). Gallery: characters 12 calls / 4.6k tris; animals 68 / 19.5k.
- One verify run timed out on `networkidle` under load; the rerun passed (flake, not a regression).

## Phase 5 — avatar cosmetics (PROPOSTA; budget per layer ≤ 40 voxels)
- [x] Layers that fit `avatarParts()`: hats, scarves, sweater patterns, colour palettes
- [x] Unlock table keyed on mission completion / level (`progress.ts` read-only; XP rules untouched; reachable
      without donating); local selection stored as layer ids (`vila.look.v1`)
- [ ] Presence sync of the look (layer ids over IMPL-0008): deferred — remote avatars show the default look
- [x] Docs: catalogue and unlocks marked PROPOSTA

### Phase 5 review (2026-11-10)
- Layers max vs budget 40/140: hat 14/42, scarf 19/76, sweater 12/38. Avatar parts unchanged in draw calls.
- Browser: gifts mission → toast "Novo visual", beanie unlocked and equipped; level-2 items stay locked.
- Tests: shared cosmetics (unique ids, one default per slot, mission/level only, all reachable without donating,
  not tied to the donation mission, sanitising stored looks) + contract for 3 layer generators.

## Every phase
- [x] `pnpm typecheck && pnpm test && pnpm build`, `verify.mjs` real browser, gallery screenshots
- [x] Report: budgets vs actual voxel/face counts, calls/tris/p95 before → after
- [x] Docs pt-BR (`docs/reference/content.md`), CHANGELOG, ADR IMPL-0010 (generator architecture), Conventional Commits

Ideas deferred unless approved: Advent progression (1–25 Dec, SP time), snow build-up on roofs, NPC routines,
lot decoration kit (admin colours via audit flow), avatar creator UI, gift-wrapping minigame.

---

# Task 9: split apps into client / api / server + packages/shared (IMPL-0009) — 2026-11-10

Owner choice: 4 apps + shared package, hosts `play.*` (client), `api.*` (api), `server.*` (realtime).

- [x] `git mv apps/web apps/client`; pure modules → `packages/shared` (`@vila/shared/*`, TS source exports)
- [x] `apps/api`: HTTP routes without `/api`, exact-origin CORS, OPTIONS 204, D1; `wrangler deploy --dry-run` in build
- [x] `apps/server`: `/health`, `/room` (exact-origin WebSocket), `VillageRoom` DO + migration
- [x] `apps/client`: endpoints per build mode, CSP generated per build, API preconnect, `app.*` → `play.*` 301 worker
- [x] Site links → `play.*`; root scripts (`dev`, `deploy:*`, `db:migrate:local`); smoke script for 3 services; smoke workflow
- [x] AGENTS.md, ADR IMPL-0009, CHANGELOG; pt-BR docs (subagent)

## Review (2026-11-10)
- Gates: typecheck 5 packages; tests 2 site + 44 shared + 7 api + 15 client + 7 server; build 5 packages
  (api/server bundles via `wrangler deploy --dry-run`). Local: three `wrangler dev` (8787/8788/8799):
  `smoke-api.sh` 14/14; `verify.mjs` clean (cross-origin data, CSP, two browsers see each other, gifts + mission).
- Not deployed. First deploy order: api → server → client → site; daily prod smoke fails until then.

## Lessons
- Vite reserves the mode name `local` (`.env.local` suffix): use another name (`workers`).
- Several `wrangler dev` at once collide on the inspector port (9229): give each `--inspector-port`.
- `wrangler dev` rewrites `Host`: test host-based logic with unit tests, not curl.
- `.env*` is gitignored here: per-mode endpoints live in code (`endpoints.ts`), not env files.

---

# Task 10: production deploy (owner: "deploy to close this session") — 2026-11-10

- [x] `pnpm deploy:api` → vilanoeldobem-api cf8a3c8a (api.vilanoeldobem.com.br, D1; no new migrations)
- [x] `pnpm deploy:server` → vilanoeldobem-server 9c92585f (server.vilanoeldobem.com.br, DO VillageRoom created)
- [x] `pnpm deploy:client` → vilanoeldobem 41bca2ec (play.* + app.* 301)
- [x] `pnpm deploy:site` → vilanoeldobem-site 958763b3 (links to play.*)

## Review
- `smoke-api.sh` (production defaults) 14/14; foreign Origin → 403, game origin → 101; app.* → 301 play.* (path and
  query kept); API CORS for play.*; two real browsers on play.* see each other ("👥 2"), no console errors.
- Deployed from branch `feat/engine-polish` (not merged, not pushed).

## Lessons
- The edge speaks HTTP/2 to curl and drops `Upgrade`, and rejects an incomplete handshake with 400 before the
  Worker runs: WebSocket smoke checks need `--http1.1` and a full handshake (`Sec-WebSocket-Key/Version`).

---

# Task 11: 0.4.0 accounts + NGOs + admin + server XP; presence looks; load test; props in the village — 2026-11-11

Owner (2026-11-11): go ahead with 0.4.0, LGPD/ECA review excluded for now, e-mail via Cloudflare (OQ-08 →
Cloudflare Email Service `send_email`); also the smaller items. Product rules researched in `vilanoeldobem/docs`:
CONFIRMADO = 4 P13 fields (DEC-038), admin approval before publishing (DEC-037), DEC-015 criteria, mission XP once
(DEC-040/042). Everything else PENDENTE → implemented as PROPOSTA and labelled so.

Safety: `ACCOUNTS_ENABLED` flag (production `false` until the owner flips it after the LGPD/ECA review);
AGENTS.md data rules still apply (4 fields, only nickname public, no logs of e-mails/tokens).

## Plan
### Smaller items
- [x] Presence carries the avatar look (`["k", …]`, catalogue ids validated by the room); remotes grouped per look
- [x] Load test (`apps/server/scripts/load.mjs`, local only): 41 bots → 40 connected, 1 refused as full (4001),
      0 failures; per visitor 9.7 msg/s, 10.1 kB/s down; tick→receive p50 4 ms / p95 9 ms (local, no network).
      Browser with 39 bot visitors: 77 calls (66 empty), 140k tris, no errors
- [x] Place generated props in the village (PROPOSTA decor; PEN-017 still open): west market (stall, panettone
      stand, fences), east stall, 4 lanterns, signpost, mailbox, sled; all baked into one geometry per role
      (`mergeVoxelModels`): 66 → 69 calls (16 if drawn separately), +8.5k tris

### 0.4.0 (PROPOSTA where docs are PENDENTE)
- [x] Migration 0004: users, login_tokens (hashed, 15 min, single use), sessions (hashed, 30 d), progress_events,
      ngo application columns; roles (admin set by hand in D1, documented)
- [x] API auth: register (Nome, Nickname, Cidade, E-mail), link (generic answer, no enumeration), verify → HttpOnly
      Secure SameSite=Lax cookie on api.*; me; logout; delete account. CORS with credentials; Origin check on
      mutations; per-e-mail and per-IP rate limits (IP never stored). E-mail via `send_email` binding; dev returns
      the link instead of sending.
- [x] Server XP: events idempotent per (user, mission, event); replay with shared `applyEvent`; local progress
      migrated once on login
- [x] P12 application (4 steps): org data + CNPJ check digits + opening date ≥ 1 year (DEC-015), declarations +
      how funds are confirmed (no uploads yet), presentation/projects/tags, review + preferred lot; states and lot
      states; resubmit after changes requested
- [x] Admin (DEC-037): list/detail/decision (start review, approve, request changes, reject; note required for
      the last two); every mutation writes `audit_events` (actor id, no personal data)
- [x] Client: account chip + P13 panel + login link handling; progress sync; P12 wizard from the lot panel; admin
      panel for admins; all copy pt-BR
- [x] Tests (api pure handlers with in-memory D1 fake or sqlite), verify.mjs flows, docs (api, storage, ADR
      IMPL-0011, open-questions OQ-08 resolved), CHANGELOG, deploy guide (Email Service onboarding)

## Review (2026-11-11)
- Gates: see commit. API: 26 tests (19 end-to-end on real SQLite with the real migrations via node:sqlite);
  shared validation 7; browser `verify-accounts.mjs`: sign-up via dev link (Email Service simulator wrote the
  pt-BR e-mail), local progress migrated, 4-step form (declarations enforced), admin start → changes requested →
  applicant sees note → resubmit (v2) → approve gated by the 3 checks → `/lots` published → chalet in the village.
- Production: `ACCOUNTS_ENABLED=false`; migration 0004 not applied remotely; nothing deployed yet.

## Lessons
- `wrangler dev` `--var` overrides work; `ENVIRONMENT` must be overridden too or the dev API behaves as production.
- Stale `workerd` processes keep inspector ports (9230/9231) after `wrangler` dies: pass another `--inspector-port`.
- From Node child processes `pnpm` may resolve to a wrapper; call `node_modules/.bin/wrangler` directly.
- Playwright `getByLabel` matches hints inside the label: anchor with a regex (`/^CNPJ \*/`).

## Security review (2026-11-11, before the first commit)
Independent review: 5 critical, 13 risks, 4 questions. Fixed, each with a test: link returned only when
ENVIRONMENT is exactly development/test (was: anything but "production" → account takeover); no e-mail
enumeration (nickname checked first; /auth/link 202 even on send failure; register race answers 202); atomic
3/15 min + 10/day link caps; `__Host-vila_session`; account routes and credentialed CORS only for the game
(ACCOUNT_ORIGINS), links always to GAME_ORIGIN; NGO submit/resubmit and admin decisions as guarded single
transactions (deferred FKs; a lost race writes nothing); migration 0005 (one active application per person);
self-review refused; hasOwn for actions and tags; POST /me correction; token purge; Content-Length precheck;
500-event cap; `GET /me` → `{user: null}` for visitors (no console 401).
Answered: audit_events.actor has no FK (deletion works, tested); lot ids are plaza-NN since 0003.

## Follow-ups (before flipping ACCOUNTS_ENABLED)
- [ ] LGPD / ECA Digital review (age, consent, retention) — owner
- [ ] Email Service: onboard vilanoeldobem.com.br, check plan, decide replies to acesso@ (Email Routing)
- [ ] Turnstile (CAPTCHA) on register and link (abusive e-mails to third parties)
- [ ] Nickname moderation; e-mail on review decisions (rules PENDENTE); document upload (PEN-019)
- [ ] Remote migrations 0004 + 0005 with the API deploy (needs authorisation)

# Task: avatar collisions and click navigation (IMPL-0016; owner: "fix all game collisions") — 2026-11-11

## Plan
- [x] Reproduce: three chained clicks from the spawn stop 10–20 u short on main (straight line + give-up after 0.5 s)
- [x] Collider audit against the drawn voxels (generators + placements), both ways; one collider shape (rounded
      rectangle: circle / capsule / box) in `packages/shared/src/game/collision.ts`; footprints next to each
      placement in `world.ts`; chalets from `GenModel.solid`; markers of available lots
- [x] Navigation in `packages/shared/src/game/navigation.ts`: 0.25 u grid field per collider set, destination
      resolved to the nearest walkable point, straight line when in sight, else A* + string pulling; `stepWalk`
      follows the route in the fixed step, replans when stuck (give-up is the last resort)
- [x] `stepBody`: boxes, up to three push-out passes, never squeezed through a gap narrower than the body
- [x] Client: route planned in `setTarget` (`sim.planWalk`), marker and tap feedback at the resolved destination,
      field rebuilt only when houses or the quests flag change; `LOT_INTERACT_DISTANCE = 6`
- [x] Tests: collision, navigation (regressions, blocked / outside / unreachable targets, determinism, budget,
      invariants, no-trap from every reachable touching position, random clicks), collider audit against the models
- [x] `apps/client/scripts/verify-collisions.mjs` (not run here: browser checks belong to the coordinating session)
- [x] Docs: ADR IMPL-0016, architecture §2.1–2.2, quests, content, guides, CHANGELOG, AGENTS

## Review (2026-11-11)
- Gates (on origin/main 35e07e8): typecheck clean; tests shared 127 (was 91), client 164 (was 160), api 70,
  server 23, dash 33, site 2; build clean. Every commit of the branch passes typecheck and tests on its own.
- In all three collider sets (quests off, quests on, every lot a chalet): every walk that starts pressed against a
  collider the body can physically reach (500+ sampled spots per set) reaches its target with no replan.
- Moved (ids unchanged, PROPOSTA layout): `bell-pine-north`, `bell-pine-east`, `lantern-lake-1` (they sat inside
  the pines' new colliders). `verify-quests.mjs` adjusted to the new spots and to the chalet's porch.
- Not run: any browser script. Left as layout notes (PEN-017): owl floats above a small pine, cat half off its
  bench, the pine at (-11, 10) plus the lantern at 135° close the ring street for routes.

## Lessons
- `clampToWorld` keeps bodies out of the tree's keep-out: motion tests with made-up colliders must sit away from
  the origin, or the clamp teleports the body.
- A single push-out pass lets a body be squeezed through any gap it is pressed into; test with both collider orders.
- Compound shell commands with heredocs are refused in an isolated worktree: write scripts with the Write tool.
- Worktrees share remote-tracking refs: `origin/main` moved under this branch while other sessions fetched.
  Check `git log origin/main` again before the last commit and rebase the work onto it.
- The old "click across the plaza" test passed only through the squeeze bug: a green test can encode a defect.


## NGO files reconciliation — 2026-11-12 (IMPL-0018, PR for Augusto)

- [x] Reuse PR #32 pipeline/UI at `49db536` (0.4.0), preserve migration 0006; do not port the duplicate PR #31 pipeline.
- [x] Adapt PR #28/#29 profile/gallery to the same FILES bucket, shared sanitizer and raw uploads.
- [x] Preserve current upstream locks during under_review, server-read revision for start_review, admin reads with uploads disabled, file-change limits and missing-0006 public fallbacks.
- [x] Exact state/revision CAS, operation-token audit, application+files snapshot and resumable account deletion with final revision bump.
- [x] Migration 0007, isolated local environment, concurrency/gallery tests and API/storage contract documented.
- [x] Rerun local gates and integrated smoke on the updated PR #32 base; evidence below.
- [ ] Augusto review and operational decision on gallery/retention (OQ-15).
- [ ] Port PR #33 withdrawal in a separate delivery; compatibility is not claimed yet.
- [ ] Remote provisioning/activation only in an authorised delivery after review.

### Historical validation — before review corrections (`0921674`)

Base: `49db536a50c96f66e49c982d920b9624bc014306`; Node 24.22.2 / pnpm 10.32.1 on Linux.
Serial commands with low priority, two CPU threads and at most two Vitest workers:

- `pnpm --workspace-concurrency=1 -r run typecheck`: all 6 packages passed.
- `pnpm --workspace-concurrency=1 -r run test --maxWorkers=2`: 569 passed (shared 146, API 159, client 179, dash 53, server 23, site 9).
- `pnpm --workspace-concurrency=1 -r run build`: passed; Worker builds use dry-run, no deploy.
- Local migrations 0001–0006 plus the then-numbered 0010; `verify-files-reconciliation.mjs`: passed against isolated workerd/D1/R2. The revised sequence is validated separately below.
- `sh scripts/smoke-api.sh http://localhost:8792 http://localhost:8788 http://localhost:8799`: 14 checks passed.
- `verify-accounts.mjs` with the isolated API, Linux Chromium and GTM stub: passed; actual PNG/JPEG, private document upload/download/removal, changes requested/resubmission, admin approval/audit and public logo.
- First browser attempt timed out with two active software-rendered scenes; parking the unused page (same context/cookies) allowed the complete rerun to pass. Product UI unchanged.
- `git diff --check`: passed. Source review gate approved with no open P1/P2.

Reproduction and limits: [delivery record](../docs/implementation/ngo-files-reconciliation-report.md).
Not checked: real email, Safari/Firefox, phone-width UI, analytics or remote infrastructure. Gallery UI remains a separate increment.

### Review corrections — validated in CI; operational policy pending

- [x] Separate local config and new synthetic database/bucket; production config has no local account-enabled environment.
- [x] Sequential migration0007/ADR0018 for the agreed #32→#35→#30 merge order; old local state preserved.
- [x] Indexed delivery record, neutral roles, public-field/privacy and schema reference fixes.
- [x] Gallery removal/retry, account erasure, read audit, review receipts and durable canonical/gallery upload cleanup implemented and tested.
- [x] Typecheck, 593 tests, build, real workerd/D1/R2 lifecycle and Chromium account/file/disclosure flow passed on `bb1c813` in [CI](https://github.com/vilanoeldobem/project/actions/runs/43272168427/job/131371240921).
- [ ] Image rights/consent policy and its approval/version record remain unresolved (review #29.3, OQ-15); production flags stay off.
- [ ] Augusto review; passing CI does not approve merge or activation.

### Direct PR35 review — second correction round

- [x] Pending erasure exposed in owner/admin contracts and UI; retry retained, admin rejection can release an open application's lot, other decisions blocked explicitly.
- [x] Public ETag/no-cache revalidation, legacy public-photo404,16 profile flag/bucket combinations and gallery FK without cascade.
- [x] Types,621 unit/integration/render tests and static review passed locally with bounded resources.
- Build and real Worker/browser results for this revision are recorded in the [PR checks](https://github.com/vilanoeldobem/project/pull/35/checks).
- [ ] Technical-owner sign-off for the proposed gallery exception; OQ-15 consent and application-rejection retention; no activation authorised.

### Pre-merge pass on the 12 findings of the PR35 review (after `fa65004`)

Each finding was re-checked against the code, not the commit messages. Already closed at `fa65004`: 1, 5, 6, 7, 8,
9, 10, 11 and the cheap parts of 3. Closed in this pass:

- [x] Finding 2: a deletion refused for lack of the bucket, before any object is touched, no longer leaves the
  account frozen (`auth.ts`); a freeze after an R2 failure stays, visible and retryable.
- [x] Finding 4: `AGENTS.md` and `storage.md` carry the original rule sentences again; the gallery is a narrow,
  explicit PROPOSTA exception.
- [x] Findings 1, 7, 12: every always-on public route is tested on schemas v3 to v6 in all 16 flag/bucket
  combinations (`public-ngo.test.ts`).
- [x] Finding 3: what only the product owner can answer is listed under OQ-15 and labelled in `ngo-photos.ts`.
- [x] `pnpm typecheck`, `pnpm test` (626: shared 146, API 212, client 181, dash 55, server 23, site 9),
  `pnpm build`, and `node scripts/verify-media-local.mjs` (local workerd, D1, R2) passed.
- [ ] Not run locally: the Chromium flow (`verify-media-local.mjs --browser`), which needs the CI environment.
- [ ] Still the owner's call: the gallery exception in `AGENTS.md`, OQ-15, and applying migration 0007 before this
  API serves signed-in accounts.

## Reliable saved progress — D12 — 2026-11-12

Scope: preserve missions, XP and levels across sessions and concurrent writes; load authoritative account
progress when guest quest state conflicts. PR #30 follows the canonical files/gallery base (#32 then #35).

- [x] Reuse shared reducer, session/account assertions and the SQL adapter; no dependencies or game rules added.
- [x] Per-account revision/token guard, consistent snapshot, atomic batch and bounded jittered retries.
- [x] Preserve accepted event order, unique-key cap and guarded recovery of ignored legacy rows.
- [x] Omit inapplicable quest events and return authoritative 200; remove permanent progress_pending errors.
- [x] Add root integration regression using real client modules, actual API handler and D1 SQLite: account40XP/harness-bells, guest lake-lanterns, pending queue, signin and reload.
- [x] Sequence migration0008 and ADR0019 after canonical file/gallery changes; no reserved parallel identifiers.
- [x] Update references/error table, OQ-09, changelog and indexed delivery record; use neutral role names.
- [x] Negative control reproduced the old pending-login bug; [CI on `3e7a82c`](https://github.com/vilanoeldobem/project/actions/runs/43272723857/job/131373129051) passed typecheck, 608 tests, build, real workerd/D1 media + two-session progress smoke and Chromium account/file/disclosure flow (GTM stubbed).
- [x] Existing PR #30 updated on #35 and review requested again from Augusto; no main merge, deploy, remote migration or flag activation.
- [ ] Augusto review; OQ-09 quest policy remains a product decision.

### Final check before merge (review of `51480aa`, six findings)

- [x] 1 fixed at `41993c4` (inapplicable quest events answer 200 with the account state); negative control repeated: `tests/progress-account.test.mjs` fails on the `51480aa` handler (`sync` stays `pending`) and passes now.
- [x] 2 sequence 0006/0007/0008 and IMPL-0017/0018/0019; "números sequenciais" kept; schema headers of the current docs and the deploy guide now say v8 / 0008.
- [x] 3 branch-state wording removed from `docs/reference/{api,versioning}.md`, IMPL-0013 and the delivery record; 4 error table lists `progress_conflict` and `too_many_events`; 5 no external tool name left; 6 jittered wait between attempts, now asserted by a test.
- [x] New tests: retry waits (20–39 ms, 40–59 ms) and account deleted while a request waits to commit (401, nothing written). A seeded interleaving run (150 seeds, three sessions) lost no acknowledged event on this handler and fails on `main` at seed 1; it was a one-off check, not committed.
- [ ] Left to OQ-09: guest quest progress that conflicts with the account's active quest is dropped at sign-in; a stale tab keeps showing local progress until the next load.

Reuse: the reducer, request/session guards, D1 adapter and client synchronization contract. Integration
imports live at repository-root tests, never in production app code. The 608-test and runtime evidence above supersedes the earlier 440-test baseline, which predates these review fixes.

Reproduction and limits: [delivery record](../docs/implementation/progress-persistence-report.md).

## NGO withdrawal ported onto the canonical file pipeline — 2026-11-12 (IMPL-0020, PR #33)

Scope: port the withdrawal of published NGOs (PR #33, commit `5026c47`) onto the base that has the canonical
files, gallery and progress work, and fix the findings of its review. Dark, PROPOSTA; policy stays in OQ-14.

- [x] Port: `ngo-withdrawal.ts`, migration `0009_ngo_withdrawals.sql`, route, effective status in signed-in and
  admin reads, guards in the gallery and file modules; tests moved to `ngo_files`, raw photo uploads and reserved
  R2 writes. Old documents module, old bindings and the test environment in `wrangler.jsonc` not brought back.
- [x] Finding 1: no public route reads the ledger; `/indicators` counts published NGOs on a published lot; schema
  matrix v3 to v9 with both flag values; one test asserts every public projection drops a withdrawn NGO.
- [x] Finding 2: routes that join the ledger answer `503 schema_outdated` without 0009 (a decision is refused
  before it writes); `docs/guides/deploy.md` says migration before API when accounts are on.
- [x] Finding 3: flag "false" in production and staging (tested), PROPOSTA labels, ADR states what the code does,
  OQ-14 spells the effects out; the lot release is "pending registration" (no DEC).
- [x] Finding 4: the admin's text is named a message to the organisation (API, contract, docs, dashboard).
- [x] Finding 5: after a withdrawal the applicant removes (never adds) files and photos; account deletion
  completes and erases the withdrawn NGO's logo; a withdrawal waits for a pending erasure; races against a file
  upload, an approval, a resubmission and `DELETE /me` tested in both orders.
- [x] Finding 6: game shows "Retirada da Vila" and the message; dashboard shows status and message, labels
  `ngo.withdraw` and offers the action (message, revision on screen, confirmation) when `/config` says so.
- [x] Finding 7: local checks on the reconciliation config (`verify-media-local.mjs --withdrawal`, also in CI;
  `apps/dash/scripts/verify-withdrawal.mjs` with system Chrome), listed in `AGENTS.md`.
- [x] `pnpm typecheck`, `pnpm test` (708: shared 147, API 273, client 189, dash 67, server 23, site 9),
  `pnpm build`; both local checks passed on local workerd, D1, R2 and Chrome.
- [ ] Not verified: anything remote; the game screen in a browser (server-side render test only); CI with the
  new step.
- [ ] Owner's call before activation: OQ-14 (account and CNPJ block, no undo, re-entry, retention, message
  channel, lot release as a DEC) and OQ-09 (mission whose target left the village).

Delivery record: [docs/implementation/ngo-withdrawal-report.md](../docs/implementation/ngo-withdrawal-report.md).

## Village expansion, phase 1 — 2026-11-13 (IMPL-0024, branch `feat/village-expansion`)

Decisions of the technical owner (2026-11-12) recorded in the ADR; nothing here re-decides them.

- [x] Layout from one plan (`VILLAGE_PLAN` → `layoutVillage`): 8 avenues, 8 lanes, frontage (12 NGO lots, 4 shops,
      4 billboards), 16 / 32 / 64 residential plots, world radius 82.5, street graph, sightline rule
- [x] Migration 0012, numbered 0011 until the donations of PR #37 took that number (moves 8 lots, adds 4, creates `residential_plots`); seed sync tests on the SQL and on SQLite
- [x] API: `GET /residential-plots`, `RESIDENTIAL_PLOTS_ENABLED`, `/config.residentialPlots`; matrix v3..v12
- [x] Scene: ground runs, shops, billboards, residences per side and tier, street lamps, forest sectors, outline
- [x] Interaction: plot, shop and billboard panels; action button beside the HUD (`ui/VillageAction.tsx`)
- [x] Docs: ADR 0023, OQ-17..19 (numbered OQ-16..18 before the merge with main, where OQ-16 is the entry/menu ratification), architecture, storage, api, deploy, content, quests, changelog, AGENTS.md
- [x] Follow-up after the HUD rework merges: fold `place` into `Hud.tsx` (`actionLabel` / `activate`) and delete
      `ui/VillageAction.tsx` (done at the merge with main: the three places are kinds of `Nearby`)
- [x] `verify-quests.mjs`, `verify-accounts.mjs`, `apps/client/scripts/verify.mjs`: run at the integration with
      main (next section)
- [ ] Not measured: frame time on a phone

### Review

- Measured on the local build (M5, Chrome with GPU, medium, spawn): 70 → 124 draw calls, 121.6k → 217.3k triangles;
  navigation field 1.45 → 8.2 ms, worst plan 1.77 → 4.84 ms. Budget: 150 calls, 250k triangles at default zoom.
- Worse for a player today: a row south of a street hides whoever walks close behind it (mitigated by low roofs and
  the outline, not solved); NGO lots are farther from the tree; quest scenery moved.

### Lessons

- Two files that differ only in case (`village.ts`, `Village.tsx`) break module resolution on macOS: name pure
  modules differently from components.
- Three `wrangler dev` processes cannot share one `--persist-to` directory (SQLITE_BUSY): one directory per Worker.
- zustand selectors read the initial state under `renderToStaticMarkup`: keep a pure view component to test.

## Integration of the village expansion with main (IMPL-0022 + IMPL-0024) — 2026-11-13

Branch `feat/village-expansion`, merged with `origin/main` (21658a1: no welcome modal, trimmed HUD, Esc menu).

- [x] Merge, both features kept. Conflicts: `App.tsx`, `scene/Player.tsx`, `architecture.md` (the village plan is
      §2.4 now; §2.3 is the arrival and the HUD), `decisions/README.md`, `open-questions.md`, `CHANGELOG.md`
- [x] Open questions renumbered: OQ-16 stays the entry/menu ratification; the expansion's are OQ-17 (players and
      plots), OQ-18 (billboards), OQ-19 (final lot plan)
- [x] One contextual action: plot, shop and billboard are kinds of `Nearby`, handled by `actionLabel` / `activate`
      in `ui/Hud.tsx`; `ui/VillageAction.tsx`, `Place` and `setPlace` are gone
- [x] "Explorar ONGs" with 12 lots; a lot the API does not list says "Ainda não recebe candidaturas"
- [x] Render cost of the zoomed-out view inside the budget: blocks whose shadow is not seen stay out of the
      shadow pass (`scene/shadowCasters.ts`, `scene/ShadowCulling.tsx`); windows and lanterns of the rows in two
      meshes. 152 calls / 274 086 triangles → 116 / 210 944 (numbers and method in ADR 0023)
- [x] Browser checks on the merged tree, against Workers on other ports (8787 was in use): `verify.mjs`,
      `verify-collisions.mjs`, `verify-quests.mjs`, `verify-accounts.mjs`, `smoke-api.sh`,
      `verify-media-local.mjs --progress --withdrawal` and `--browser`
- [x] `verify-accounts.mjs` step 5b reached the lot by old coordinates: it goes through "Explorar ONGs" now
- [ ] Not run: `verify-live.mjs` (deployed game only), the dashboard's own scripts, anything on a phone

### Lessons

- The fixed origins of a local build (`localhost:8787/8788/8797/8799`) can be pointed at other ports without a
  rebuild: Chrome `--host-rules="MAP localhost:8787 127.0.0.1:18787, …"` (a rule may name a port).
- `verify-accounts.mjs` with a rerouted API: name it `localhost`. With `127.0.0.1` the session cookie is lost.
- three.js culls a mesh, shadow pass included, with one sphere: a long merged block is drawn into the shadow
  map from far away. Measure the shadow pass apart from the main pass before merging geometry further.
- `renderer.info` counts both passes; a per-mesh count from the scene graph says which pass a triangle is in.

## Second integration with main: Pix donations (PR #37) — 2026-11-13

`main` gained the donations (IMPL-0023, migration 0011, `DONATIONS_ENABLED` "false" in production and staging)
while the village expansion was being integrated. Both had taken the same numbers.

- [x] Merge, both features kept: `/config` answers `residentialPlots` and `donations`; both flags "false" in
      `wrangler.jsonc`; the all-schemas matrix gives each flag its own bit (9 flags, 512 combinations per schema)
- [x] Village migration renumbered to `0012_village_expansion.sql` (never applied anywhere); matrix v3 to v12;
      0012 applied on a v11 database leaves the donation tables as they were
- [x] Village decision renumbered to IMPL-0024 (`docs/decisions/0024-village-expansion-and-zoning.md`)
- [x] Donations against the larger village: the per-NGO donation follows the NGO, not the lot (tests for
      `plaza-09`…`plaza-12`, flag off and on); nothing in the donation code was changed
- [x] Gates and browser checks rerun on the merged tree (own ports, GTM stubbed, provider never called)
- [ ] Reported, not fixed (donation code of PR #37): the webhook replay guard compares a millisecond timestamp,
      so `donations.test.ts` › "ignores a replay of an event already applied, even after a later dispute" fails
      whenever its three deliveries fall in the same millisecond

### Lessons

- Before merging a long branch, fetch again and compare `ls migrations docs/decisions` with `origin/main`:
  numbers are taken in the order of integration (`docs/reference/versioning.md`).
- A flag added to the all-schemas matrix needs its own bit; two branches adding "the next bit" collide silently.


---

# Task: review findings of the village expansion (issue #41, IMPL-0024) — 2026-11-13

PR #40 was merged with its two reviews unanswered. Nothing is live: not deployed, `RESIDENTIAL_PLOTS_ENABLED`
"false", migration 0012 applied nowhere. Branch `fix/village-expansion-review`. A first, interrupted attempt
(`wip/village-expansion-review-fixes`) was read and reused where it held up; every reused piece was re-run.

## Data, API, layout

- [x] A1 Migration 0012 without `owner_id` / `claimed_at` and their index (ownership is undecided, OQ-17)
- [x] A2 `GET /residential-plots` answers the shared layout: no D1 read with the flag off; never a 500 or a short list
- [x] A3 Ids are positional: said in the ADR, next to `VILLAGE_PLAN` and in `AGENTS.md`; pinned by tests; padded to the largest count
- [x] A4 `assertPlan`; variants only assert geometry; the plan in force passes the collider and navigation audit
- [x] A5 Sightline rules described as what the test checks; "one corner from the tree" dropped
- [x] A6 Deploy order with accounts on: the API first
- [x] A7 `/config.residentialPlots` and `/residential-plots.enabled` are the same value on every schema
- [x] A8 256 parts, walk times, planning costs with their samples, the build time: as measured
- [x] A9 `lotFront` inside the clearance, symmetric belt of pines, smoke check, a tier with no plots takes no ring

## Client

- [x] B1 Neutral copy on the plot, shop and billboard panels; neighbourhood names; no raw ids
- [x] B2 See-through avatar from a real occlusion test (`scene/occlusion.ts`); remote visitors not covered (documented)
- [x] B3 One intention per click (`game/clicks.ts`): no walk left behind a panel, marker at the interaction point
- [x] B4 A plot is offered standing still; hysteresis (`game/nearby.ts`). Economy street: 83 % of the walk → 0 %
- [x] B5 "Olhar o céu" rises over the roofs where a building is in its picture
- [x] B6 A lot the API does not list is "Terreno em preparação" (label, panel, Explore)
- [x] B7 `scene/sceneColliders.ts` audited by `colliders.test.ts`; `verify.mjs` opens the three panels and asserts the budget
- [x] B8 Forest and mountains drawn in pieces: tour peak 251 896 → 195 908 triangles; heap figures corrected; search scratch 10.5 → 4.4 MB
- [x] B9 44 px rows; labels hidden under the HUD; a tap whose ground is paving walks to that spot
- [x] B10 Controls copy, `viewPlanes` without allocations, `LABEL_RADIUS` comment, rooms carry no world version (docs)

## Review

- Gates and browser checks: see the report of the change (isolated local stack on private ports; GTM stubbed).
- The merge of `origin/main` (donations webhook fixes, PR #42) carries git's default message, without the
  session trailers: it was made with `git merge --no-edit` and not rewritten.
- Not done: the see-through drawing for remote visitors; a measurement on a real phone; GPU memory.

### Lessons

- A scene that takes its colliders from a list built inside a component cannot be audited: build the list in a
  pure module and audit that module.
- One mesh that spans the horizon is never culled. Mesh it once, draw it in pieces (`voxelGeometries` with
  `partOf`): same triangles, each piece with its own bounding sphere.
- Copy for something undecided says what is there today and that it is undecided. "Not yet" announces it.
- Before `git commit`, look at `git status --short`: a `cherry-pick -n` leaves its files staged, and they ride
  along with the next commit (the docs of one commit went into the `perf(shared)` commit that way).
- `git merge` with `--no-commit` when the message needs trailers.
