# NGO application/review local proposal - 2026-11-11

- [x] Additive migration0006 links private applications to existing NGO, owner and requested lot.
- [x] Session/account assertion, server-only admin allowlist, owner isolation and strict form/review contracts.
- [x] Revision-checked review with mutation-marker guard for every dependent publication/audit write.
- [x] Numeric CNPJ/date checks and required manual eligibility attestations, without claiming registry verification.
- [x] SQL regressions: two applicants/one lot, approval replay, isolation, changes/resubmit, rejection and malformed input.
- [x] Coordinator gates on 2026-11-11: all package typechecks, 216 tests and builds passed.
- [x] Migration0006 applied locally; actual UI browser proof passed: owner signup/submission, admin-only access, requested adjustments, owner resubmission, manual approval, four audit records and same-page fresh public lot/NGO view.
- [x] AIOX QA static review passed; paragraph/UTF-8 payload and publication-cache findings corrected.
- [ ] Final expanded general browser regression (coordinator running).

Production remains disabled; no real administrators or document requirements were invented.
No remote schema or deployment changes were made by this backend implementer.

# Account progress - 2026-11-11

- [x] Additive migration0005; session-owned progress API with bounded CAS retries and shared rewards.
- [x] Once-only validated guest import; preserve known gift identities and prevent replay rewards.
- [x] Expected-account assertion prevents old tabs writing to a different cookie account.
- [x] Separate per-account offline queues/caches; restore guest on logout and reject stale responses.
- [x] Meaningful SQL and client regressions; docs and IMPL-0012.
- [x] Coordinator validation on 2026-11-11: typecheck, all 209 tests and all package builds passed.
- [x] Local migration 0005 and real-browser UI proof passed: guest import, reload, duplicate reward rejection, independent-browser recovery, guest restoration and account isolation.
- [x] AIOX QA re-review closed both findings (gift identity and cross-tab account mismatch); no unresolved P1/P2.

- [x] DevOps exported/restored staging v4, applied only migration 0005 remotely to isolated staging and passed eleven SQL/backup/readback cases.
- [x] Synthetic accounts/progress cleaned; production remains migrations 0001-0003 with no account/progress tables and zero verification writes.

No public authentication activation or Worker deployment. Staging HTTP auth remains unavailable pending OQ-08; remote checks cover database invariants, while integrated UI was validated locally.

# Isolated staging database - 2026-11-11

- [x] Created `vilanoeldobem-staging` in the confirmed project account; production binding unchanged.
- [x] Exported the empty staging database before migrations; restored that export in disposable local SQLite.
- [x] Applied and read back migrations 0001-0004 only in staging; foreign key check returned no violations.
- [x] Seven remote SQL smoke cases passed: case-insensitive email/nickname uniqueness, missing-user FK rejection, duplicate link key rejection, single consumption, session cascade and fixture cleanup.
- [x] Scoped staging Worker dry-run passed with the isolated D1 binding, staging environment, empty browser origins and no public routes.
- [x] Production readback still shows migrations 0001-0003 and no account tables; all production queries had zero writes.
- [x] Config, storage reference, backup/migration guide and changelog updated.

No Worker was deployed. Public account delivery remains disabled. Remote Time Travel recovery was documented, not executed; D1 does not accept `PRAGMA integrity_check` through the query interface used.

# Account integration after the application split - 2026-11-11

- [x] Preserve main engine, multiplayer, procedural content and cosmetics; relocate account UI to client and auth to API.
- [x] Explicit API fetch URLs with credentials; exact credentialed auth CORS and preflight validation.
- [x] Separate API origin from page/callback origin; keep cookies host-only and production fail-closed.
- [x] Preserve migration 0004; rename the account ADR to IMPL-0011 to retain main IMPL-0007.
- [x] Adapt SQL/client tests and browser harness to separate local client/API ports and API-owned D1 state.
- [x] Final typecheck, 199 tests across five packages, and production builds passed on 2026-11-11 (Node 26.13.0, pnpm 11.25.0).
- [x] Local API migrations 0001-0004 and cross-origin auth browser flow passed in desktop/mobile viewports.
- [x] Expanded general browser verification passed: environment scenes, gifts/cosmetics, two-browser multiplayer and all five content gallery categories.
- [x] Independent AIOX QA static security review: no unresolved P1/P2 findings.

No remote migration, deployment or public authentication activation is included.

# Optional accounts — signup and magic-link login — 2026-11-10

Branch: `feat/account-magic-link-login`. Local delivery for owner review before publication.
Scope: account/session/logout; unrestricted visitors; no server progression, payments or NGO administration.

## Implementation

- [x] Reuse existing Worker/D1, panel and HUD; isolate authentication in `worker/auth.ts` and state in `lib/auth.ts`.
- [x] Additive migration v4, verified accounts only, case-insensitive uniqueness and transactional one-use consumption.
- [x] Four-field signup, passwordless login, explicit confirmation, session and logout.
- [x] Browser binding, origin/CSRF protection, bounded bodies, hashed tokens, request limits and no personal data in logs.
- [x] Loopback-only test delivery adapter; production disabled; no credential retrieval endpoint.
- [x] Local guide, API/D1 contracts, ADR IMPL-0007, README and changelog.
- [x] Actual SQL tests (10 cases) and client tests (2 cases), including concurrency/replay and stale responses.
- [x] Full gates run by coordinator: typecheck, 50 tests and build passed on 2026-11-10.
- [x] Real-browser desktop/mobile authentication against local Worker/D1 (coordinator, 2026-11-10).
- [x] General visual verification `verify.mjs`: desktop/mobile flows and five environment scenes passed, with no console/page errors.
- [x] Final strict request-mode validation rerun: all 10 worker authentication tests passed.
- [ ] Owner review; publish the PR only after explicit approval.

## Follow-up dependencies that do not block local review

OQ-08: choose and integrate the email provider; sender/domain, secrets and Cloudflare access;
review privacy/retention and enable staging before collecting real data. Progress/XP stays in the browser.
Validation used Node 26.13.0, the host's pnpm 11.25.0 fallback, Wrangler 4.158.0 and Chromium with software GL.
CI targets Node 24/pnpm 10.32.1; remote CI has not run because publication is awaiting owner review.
Browser evidence covers desktop/mobile viewport sizes, not physical-device performance.
No push, deployment or remote migration was performed.

---

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
