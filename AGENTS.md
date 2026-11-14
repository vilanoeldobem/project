# AGENTS.md — rules for coding agents working in this repository

This file governs *this* repository only. Never rewrite other projects' `AGENTS.md`/`CLAUDE.md`
(including `vilanoeldobem/docs`).

## What this is

**Vila Noel do Bem** — a 3D voxel Christmas village on the web where people explore, play
minigames, meet approved NGOs and donate voluntarily. Monorepo (IMPL-0009), one Cloudflare Worker per app:
`apps/client` (React 19 + Three.js game, Static Assets, play.vilanoeldobem.com.br), `apps/api` (HTTP API + D1,
api.vilanoeldobem.com.br), `apps/server` (realtime presence, Durable Object, server.vilanoeldobem.com.br),
`apps/site` (public website, www.vilanoeldobem.com.br), `apps/dash` (backoffice dashboard for admins, static assets only,
dash.vilanoeldobem.com.br; IMPL-0015) and `packages/shared` (pure logic used by all of them). Product source of truth is the docs repository `vilanoeldobem/docs`
(`docs/decisions/registro-de-decisoes.md`, DEC-001..). Read [`docs/specs/README.md`](docs/specs/README.md)
before changing product behaviour. Deadline: 30/11/2026 (DEC-043).

## Build, test, lint (all must pass before claiming done)

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
# UI changes: real browser check (three terminals, then verify)
pnpm db:migrate:local && pnpm --filter @vila/api dev            # api    → :8787
pnpm --filter @vila/server dev                                  # server → :8788
pnpm --filter @vila/client dev:worker                           # client → :8799 (build --mode workers)
node apps/client/scripts/verify.mjs http://localhost:8799
sh scripts/smoke-api.sh http://localhost:8787 http://localhost:8788 http://localhost:8799
node apps/client/scripts/verify-collisions.mjs http://localhost:8799   # movement, colliders, layout (local only)
node apps/client/scripts/verify-life.mjs http://localhost:8799         # village characters: same place for two visitors, talks, busy square, budget (local only)
# after a deploy only (not a pre-merge gate; verify.mjs above is local only):
node apps/client/scripts/verify-live.mjs                                # deployed game: loads, no console/CSP errors, presence answers
pnpm --filter @vila/dash dev:worker                             # dash   → :8797 (build --mode workers)
node apps/dash/scripts/verify.mjs http://localhost:8797         # dashboard: headers, sign-in, accounts-off states
node apps/client/scripts/verify-accounts.mjs   # accounts / NGO in the game, admin review in dash (local only; wait 60 s between runs)
# API on local workerd + D1 + R2 (own temporary database and bucket, port 8792): files, gallery, progress, NGO withdrawal
node scripts/verify-media-local.mjs --progress --withdrawal
node apps/dash/scripts/verify-withdrawal.mjs   # dashboard: withdraw a published NGO (local only; setup in the file header)
node apps/dash/scripts/verify-moderation.mjs   # dashboard: roles, account block, logo removal, link to one application (local only; setup in the file header)
# website changes
pnpm --filter @vila/site build && pnpm --filter @vila/site preview   # other terminal
node apps/site/scripts/verify.mjs http://localhost:4173
```

## Product rules (non-negotiable)

- Respect the status of every product statement: **CONFIRMADO**, **PROPOSTA**, **HIPÓTESE**,
  **PENDENTE**. Never ship a proposal as if it were approved; label it in code comments and docs.
- **No fake money flows.** No donate/purchase button may simulate a completed payment. Until a
  partner contract and payment provider exist (PEN-004, PEN-006), donation buttons stay disabled
  with an honest note (IMPL-0002).
- Global donation goes to **one** partner institution; never say it is split among the Vila's NGOs
  (DEC-010..013). Per-NGO donation goes to that NGO only. Playing is never a donation (DEC-029).
- **No invented numbers.** A public indicator without a verifiable source returns `null` and is
  shown as "—" (DEC-027). No fake NGOs, donors or partners in production data.
- Progression (DEC-042): events are idempotent by unique id; a mission grants its XP once; a donation
  alone grants no XP; levels must be reachable without donating. Logic lives in
  `packages/shared/src/game/progress.ts` and is covered by tests.
- Only an authorised admin publishes/removes NGOs or applies sanctions (DEC-037); every admin
  mutation writes `audit_events`.
- Accounts (IMPL-0011) stay behind `ACCOUNTS_ENABLED` ("false" in production) until the owner records the LGPD /
  ECA Digital review. Never flip it, grant `admin` remotely or apply remote migrations without explicit approval.
- NGO files (IMPL-0017) stay behind `NGO_FILES_ENABLED` ("false" in production): the list of required documents is
  PENDENTE (PEN-019), so no document is required or named. Never flip the flag or create the bucket without explicit
  approval. Only the logo of a published NGO is ever public.
- NGO gallery photos ([IMPL-0018](docs/decisions/0018-ngo-files-reconciliation.md)) are **PROPOSTA**: dark code
  behind `NGO_PHOTOS_ENABLED` ("false" in production), validated locally only. The proposal makes one narrow
  exception to the rule above: a gallery photo that an admin approved individually, of a published NGO on a
  published lot, would also be public. Nothing else changes: documents stay private. Never flip the flag until the
  technical owner explicitly accepts that exception and the product owner answers OQ-15 (image rights and consent,
  retention); passing tests do not grant either.
- Withdrawal of a published NGO ([IMPL-0020](docs/decisions/0020-ngo-publication-withdrawal.md)) is **PROPOSTA**:
  dark code behind `NGO_WITHDRAWAL_ENABLED` ("false" in production and staging). What a withdrawal means for the
  account, the CNPJ, re-entry and retention is the product owner's to answer (OQ-14): never flip the flag before
  that, and never decide it in code. The text an admin writes is a message the organisation reads, not a private note.
- Roles and moderation ([IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md)): two roles, default
  (`player` in code, "Padrão" on screen) and administrator (`admin`, "Administrador"). Roles are granted and revoked
  from dash by an administrator (audited); the first administrator is still created with the documented database
  command. Two parts are **PROPOSTA**, dark code behind flags that are "false" in production and staging:
  `ACCOUNT_BLOCK_ENABLED` (account block; which sanctions exist, who applies them, appeal, duration and notice are
  the product owner's to answer, OQ-11) and `PRESENCE_MODERATION_ENABLED` (removing a visitor from a room; on the
  API and on the realtime server, and it needs both Workers deployed with the service binding). Never flip either
  flag without explicit approval, and never decide the sanction policy in code. The text an admin writes when
  blocking is a message the blocked person reads, not a private note; a block never takes away reading the reason
  or deleting the account.
- Village expansion ([IMPL-0024](docs/decisions/0024-village-expansion-and-zoning.md)) is **PROPOSTA**. Plots
  around the square stay reserved for approved NGOs (DEC-028). Residential plots are drawn, but **ownership is
  off**: `RESIDENTIAL_PLOTS_ENABLED` is "false" in production and staging, no recorded product decision lets a
  player hold land, and what a tier should require is the product owner's to answer (OQ-17). Never flip the flag
  without explicit approval. A tier asks a *requirement* (a level reached by playing, `VILLAGE_PLAN`), never a
  price: no R$ value, no in-game currency, no "comprar" button (DEC-042, IMPL-0002). Shops say what they will
  offer and that they are not open; billboards show only the village's own notices from the repository, never
  third-party content or a brand, and are not for rent (PEN-008, OQ-18). No vehicles: everything is on foot.
- Village life ([IMPL-0025](docs/decisions/0025-village-life.md)) is **PROPOSTA**: the cast, its names, its routines
  and what it says are config and copy of the technical owner until the product owner answers OQ-20. **No language
  model or other AI service** drives a character or writes a line: behaviour is a schedule
  (`packages/shared/src/game/life.ts`) and dialogue is fixed pt-BR text chosen by context (`life-dialogue.ts`), two
  or three lines and one "Continuar". No chat, no free text, no names of people. A shopkeeper or the lumberjack
  says what a place is about and that it has not opened ("Nada é vendido na Vila."), never an offer, a price or a
  date; no line pressures anyone to stay, return, donate or spend, or asks anything personal (the copy tests in
  `life-dialogue.test.ts` reject it).
- Minors are a likely audience (ECA Digital, LGPD): collect the minimum (P13: Nome, Nickname,
  Cidade, E-mail), only the nickname is public, no rewards for time online, no dark patterns.

## Architecture rules

- Worker main modules (`apps/*/src/index.ts`, `apps/client/worker/index.ts`) export only the handler (and, in
  `apps/server`, the `VillageRoom` class); logic lives in tested modules beside them.
- Code shared by more than one app lives in `packages/shared` (pure: no DOM, three.js or Workers runtime) and is
  imported as `@vila/shared/<dir>/<module>`. Never import across apps.
- Cross-origin rules: the API sends CORS only to exact origins in `ALLOWED_ORIGINS` (credentials and account routes
  only for `ACCOUNT_ORIGINS`: the game and dash); the realtime server accepts WebSockets only from exact origins in
  its `ALLOWED_ORIGINS`; the client and dash CSP `connect-src` are generated per build from each app's
  `src/lib/endpoints.ts`. Changing a hostname means changing every place that lists it (also `GAME_ORIGIN` /
  `DASH_ORIGIN`; list in `docs/reference/architecture.md` §7).
- Dash (IMPL-0015): admin UI lives only in `apps/dash`, never in the game, with one deliberate, narrow exception
  (IMPL-0021): the game may show moderation *actions* to a signed-in administrator; lists, review queues and audit
  stay in dash. No third-party script, analytics or inline
  code there; it creates no accounts and shows no e-mail or real name in lists; sections without real data show an
  explicit empty/pending state. A sign-in link opens dash only when the request `Origin` equals `DASH_ORIGIN` exactly.
- Every public projection of an NGO (`/lots`, `/indicators`, `/ngos/:id`, logo, gallery) requires the published lot
  association and reads no table newer than the one it serves: production runs behind the code (schema v3). Never
  join `ngo_withdrawals`, or read anything migration 0010 adds (`users.blocked`, `account_blocks`,
  `moderation_tickets`), in an always-on public route; signed-in routes that need a newer schema answer
  `503 schema_outdated`. A test in `apps/api/src/public-ngo.test.ts` checks every schema.
- D1 is the only persistent server-side database; the private R2 bucket `FILES` holds only the bytes of NGO
  application files (IMPL-0017, PROPOSTA, behind `NGO_FILES_ENABLED`): every read goes through the API, the bucket
  never gets a public URL, no file name is stored, and `ngo_files` in D1 decides who may read what. Proposed
  exception (IMPL-0018, PROPOSTA, behind `NGO_PHOTOS_ENABLED`, off in production): with that flag on, the same bucket
  also holds the bytes of gallery photos under the same rules, and `ngo_photos` in D1 decides who may read them. The `VillageRoom` Durable Object (IMPL-0008) holds ephemeral
  presence in memory only: never write to its storage, never put names, free text or personal data in it. Migrations in `migrations/NNNN_name.sql` are immutable once
  applied remotely: add a new file; never edit or renumber.
- The layout (rings, lots, shops, plots, streets, world radius) is derived from `VILLAGE_PLAN`
  (`packages/shared/src/game/world.ts`, IMPL-0024): change the plan, never scatter positions. The scenery of the
  square (plaza lamps, market, sleigh, pond, NPCs, quest items, gifts) is placed by hand for the plan in force and
  does not follow it. Safe knobs: a tier's `perHalf`, `width`, `depth` and `house`, `streetWidth`, `backYard`,
  `edge`. Review the square's scenery by hand before touching `sides` (`assertPlan` refuses anything but 8),
  `plazaRadius`, `ringStreet`, `squareApothem`, `avenueWidth`, `laneWidth`, `frontage` or `shopEvery`.
- Lot, shop and plot ids are positional (`plaza-NN` = the n-th lot around the village): stable only for an
  unchanged plan. They are stored in D1 (`lots.id`, `ngos.requested_lot_id`, `progress_events`, quest objectives,
  `ngo_withdrawals.lot_ids`, audit details, `residential_plots.id`), so once migration 0012 is applied, a plan
  change that moves or renumbers one needs a new migration that follows. Lots and plots must stay in sync with the
  seed migrations (`0002_seed_lots.sql`, `0012_village_expansion.sql`; tests check the SQL text, the migrated
  tables and pin each id to its place), and the plan in force must keep the rules of
  `packages/shared/src/game/village.test.ts` (unique ids, no overlap, tiers by distance, the sightline rule, every
  place reachable on foot in both collider sets). Plan variants are only checked for the layout's geometry.
- Every solid thing drawn in the village has a collider sized from its voxels (IMPL-0016): add or move a prop and
  its footprint in `world.ts` together; `apps/client/src/scene/colliders.test.ts` checks both ways. Walking goes
  through `planRoute`/`stepWalk` (`packages/shared/src/game/navigation.ts`): plan on click, never per frame.
- Village characters (IMPL-0025) are a pure function of (world seed, synchronized village time, the village plan):
  `sampleLife` in `packages/shared/src/game/life.ts`, evaluated by each client. **Never simulate, relay or store
  them on the server** (no presence message, no Durable Object state, no D1), and never read `Math.random`,
  `Date.now` or a transcendental function on the way to a position. They are the one exception to the collider
  rule above: a character that walks has no collider and is not in the navigation grid, so the avatar is never
  blocked or trapped by one; it steps aside on each client by a bounded, per-viewer offset
  (`apps/client/src/game/life-reactions.ts`) that never feeds back into the simulation. Every spot and every route
  must stay on open ground in both collider sets, and apart from every other character's (groups move one at a
  time; `life.test.ts` checks statically and by sampling): add a character, a spot or a footpath in the one table
  and let the tests place it. The whole cast is one draw call (`scene/Life.tsx`): do not add a mesh per character.
- UI text is flat HTML over the canvas (readable, accessible); 3D labels are short. A billboard's notice is also
  on its panel as flat text.
- One contextual action (IMPL-0022, IMPL-0024): whatever the avatar can use nearby is a kind of `Nearby`
  (`game/store.ts`), labelled and opened by `actionLabel` / `activate` in `ui/Hud.tsx`, the game's only reader of the
  key map (`lib/hud-keys.ts`). Never add a second action button or key listener; a new panel is the shared `Panel`.
- Render budget (IMPL-0024): 150 draw calls and 250 000 triangles per frame, shadow pass included. A large baked
  block that casts shadows (a row of chalets, a forest sector) passes `casters`, one sphere per part, so
  `scene/ShadowCulling.tsx` keeps it out of the shadow pass while no shadow of it is seen; the shadow box is
  `SHADOW_BOX` (`scene/shadowCasters.ts`), shared with `Lighting`. Something that spans the horizon (the forest,
  the mountains) is meshed as one model and drawn in pieces (`voxelGeometries` with `partOf`), so the camera culls
  each piece: never one mesh whose bounding sphere covers the village. Measure calls and triangles before and after;
  `apps/client/scripts/verify.mjs` fails over the budget at the spawn, default zoom and zoomed out.
- `GET /residential-plots` is an always-on public route: the shared layout is its source (every plot, always), the
  `residential_plots` table (0012, not in production yet) only adds state and is read only with the flag on. A
  missing table, a missing row or a D1 error answers "unavailable", never a 500 or a shorter list. `enabled` is the
  same value as `/config.residentialPlots`. The table has no ownership columns: they come with the migration that
  brings a claim route (OQ-17), never before.
- Never log request bodies, e-mails, tokens, CNPJ documents, file names, object keys or any personal data.

## Forbidden without explicit human authorisation

`git push`, `git reset --hard`, `git clean`, `wrangler deploy` (and, when authorised, only through `pnpm deploy:<app>`:
a bare `wrangler deploy` of the API creates a missing R2 bucket by itself), remote D1 migrations, creating or
deleting Cloudflare resources, changing secrets, adding payment/OAuth integrations, editing the docs
repository.

## Language (IMPL-0004)

- **Talk to the team in English (en-US)**: every reply, question, plan, summary and report from an agent, even
  when the request or the source material is in Portuguese.
- **Code is English (en-US)**: identifiers, comments, tests, file names, table/column names, state values, ids,
  API keys, error codes, log messages, scripts, commit messages and PR titles.
- **Documentation is Portuguese (pt-BR)**: `docs/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `ROADMAP.md`,
  the PR template. Agent-facing files (`AGENTS.md`, `CLAUDE.md`, `tasks/todo.md`) are English.
- **UI copy is Portuguese (pt-BR)**: on-screen text and the API's user-facing `label`/`note` fields.
- Domain glossary (pt-BR → code): ONG → `ngo`, terreno → `lot`, praça → `plaza`, presente → `gift`,
  disponível → `available`, em análise → `under_review`, publicada → `published`. Full list in IMPL-0004.

## Conventions

- TypeScript strict; React function components; state in `zustand` (`src/game/store.ts`).
- Product name is always "Vila Noel do Bem" (DEC-001). No other product, company or project names in this repo.

## Documentation and changelog (every change)

- Behaviour change → update the matching file in `docs/reference/` in the same change.
  Code wins over docs; fix the doc, never leave them diverging.
- Add a line under `[Unreleased]` in `CHANGELOG.md` (Keep a Changelog categories).
- New or reversed technical decision → ADR `docs/decisions/NNNN-*.md` (`IMPL-NNNN`, MADR-lite).
  Product questions only the owner can answer → `docs/decisions/open-questions.md`; do not decide
  for them. Cite DEC/PEN ids from the docs repository.
- Commit messages and PR titles: Conventional Commits (`feat(client): …`, `fix(api): …`, `feat(server): …`, `refactor(shared): …`).
  SemVer per [`docs/reference/versioning.md`](docs/reference/versioning.md). Index: `docs/README.md`.
