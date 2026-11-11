# AGENTS.md — rules for coding agents working in this repository

This file governs *this* repository only. Never rewrite other projects' `AGENTS.md`/`CLAUDE.md`
(including `vilanoeldobem_docs`).

## What this is

**Vila Noel do Bem** — a 3D voxel Christmas village on the web where people explore, play
minigames, meet approved NGOs and donate voluntarily. Stack: React 19 + Three.js
(react-three-fiber) game and a Cloudflare Worker (Static Assets + D1) in `apps/web`
(app.vilanoeldobem.com.br), plus the public website in `apps/site` (www.vilanoeldobem.com.br). Product source of truth is the docs repository `vilanoeldobem_docs`
(`docs/decisions/registro-de-decisoes.md`, DEC-001..). Read [`docs/specs/README.md`](docs/specs/README.md)
before changing product behaviour. Deadline: 30/11/2026 (DEC-043).

## Build, test, lint (all must pass before claiming done)

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
# UI changes: real browser check
pnpm --filter @vila/web db:migrate:local && pnpm dev:worker   # other terminal
node apps/web/scripts/verify.mjs http://localhost:8787
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
  `apps/web/src/game/progress.ts` and is covered by tests.
- Only an authorised admin publishes/removes NGOs or applies sanctions (DEC-037); every admin
  mutation writes `audit_events`.
- Minors are a likely audience (ECA Digital, LGPD): collect the minimum (P13: Nome, Nickname,
  Cidade, E-mail), only the nickname is public, no rewards for time online, no dark patterns.

## Architecture rules

- `apps/web/worker/index.ts` only exports the handler; logic is in `worker/api.ts` (unit-tested).
  Only `/api/*` runs Worker code; everything else is Static Assets (SPA fallback).
- D1 is the only persistent server-side store. The `VillageRoom` Durable Object (IMPL-0008) holds ephemeral
  presence in memory only: never write to its storage, never put names, free text or personal data in it. Migrations in `migrations/NNNN_name.sql` are immutable once
  applied remotely: add a new file; never edit or renumber.
- World layout constants (`apps/web/src/game/world.ts`) and `migrations/0002_seed_lots.sql` must stay
  in sync (a test checks it).
- UI text is flat HTML over the canvas (readable, accessible); 3D labels are short.
- Never log request bodies, e-mails, tokens, CNPJ documents or any personal data.

## Forbidden without explicit human authorisation

`git push`, `git reset --hard`, `git clean`, `wrangler deploy`, remote D1 migrations, creating or
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
- Commit messages and PR titles: Conventional Commits (`feat(web): …`, `fix(worker): …`).
  SemVer per [`docs/reference/versioning.md`](docs/reference/versioning.md). Index: `docs/README.md`.
