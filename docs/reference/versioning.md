# Versionamento

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `package.json`, `apps/web/package.json`, `apps/web/worker/api.ts` (`VERSION`), `CHANGELOG.md`

## 1. O que é versionado

| Item | Onde | Regra |
|---|---|---|
| Versão do software | `package.json` (raiz e `apps/web`), `VERSION` em `worker/api.ts` | SemVer; os três iguais |
| Schema D1 | número da última migration | sobe a cada migration |
| API HTTP | rotas `/api/*` | aditivo não quebra; remoção/renomeação = breaking |

## 2. SemVer durante 0.y.z

- MINOR (`0.2.0`): novo marco do [ROADMAP](../../ROADMAP.md) ou mudança incompatível.
- PATCH (`0.1.1`): correções e ajustes sem funcionalidade nova.
- `1.0.0`: publicação oficial de 30/11/2026.

## 3. Conventional Commits ↔ SemVer

`fix` → PATCH · `feat` → MINOR · `!`/`BREAKING CHANGE` → MINOR (em 0.y.z) · `docs`/`chore`/`test` → nada.

## 4. Changelog

Keep a Changelog 1.1.0. Toda mudança visível entra em `[Unreleased]`. Cada versão cita o schema D1.

## 5. Processo de release

1. Mover `[Unreleased]` para `## [X.Y.Z] - AAAA-MM-DD` com parágrafo-resumo (ADRs, DEC/PEN).
2. Atualizar as três versões, README ("Versão atual") e ROADMAP.
3. Gates + `verify.mjs`.
4. Commit `chore(release): X.Y.Z`, tag `vX.Y.Z`.
5. Deploy ([guides/deploy.md](../guides/deploy.md)) com autorização.

## Ver também

[CHANGELOG](../../CHANGELOG.md) · [CONTRIBUTING](../../CONTRIBUTING.md)
