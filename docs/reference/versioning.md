# Versionamento

> **Status:** Implementado (0.5.0) · **Versão do software:** 0.5.0 · **Schema D1:** v12 ·
> **Atualizado em:** 2026-11-14
> **Fonte de verdade:** `package.json`, `apps/*/package.json`, `packages/shared/package.json`,
> `apps/api/src/api.ts` (`VERSION`), `CHANGELOG.md`

## 1. O que é versionado

| Item | Onde | Regra |
|---|---|---|
| Versão do software | `package.json` (raiz, `apps/client`, `apps/api`, `apps/server`, `apps/site`, `apps/dash`, `packages/shared`), `VERSION` em `apps/api/src/api.ts` | SemVer; todos iguais |
| Schema D1 | número da última migration | numeração sequencial; sobe a cada migration; definida pela ordem real de integração |
| API HTTP | rotas de `api.*` (`/health`, `/indicators`, `/lots`, `/environment`) | aditivo não quebra; remoção/renomeação = breaking (a retirada do prefixo `/api` na IMPL-0009 foi breaking) |
| Protocolo de presença | `server.*/room`, `packages/shared/src/net/protocol.ts` | mudança de mensagem = breaking (cliente e servidor juntos) |

Migrations e ADRs recebem numeração sequencial na ordem de integração. Não reservar identificadores para PRs
paralelos: antes do merge, conferir os arquivos existentes e renumerar somente propostas ainda não aplicadas
remotamente.

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
2. Atualizar todas as versões (tabela acima), README ("Versão atual") e ROADMAP.
3. Gates + `verify.mjs`.
4. Commit `chore(release): X.Y.Z`, tag `vX.Y.Z`.
5. Deploy ([guides/deploy.md](../guides/deploy.md)) com autorização.

## Ver também

[CHANGELOG](../../CHANGELOG.md) · [CONTRIBUTING](../../CONTRIBUTING.md)
