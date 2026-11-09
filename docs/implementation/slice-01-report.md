# Relatório de entrega — Fatia 01 (0.1.0)

> **Status:** Entregue e publicado · **Versão do software:** 0.1.0 ·
> **Atualizado em:** 2026-11-08

## 1. Ponto de partida e achados

- Repositório só com `LICENSE`. Produto definido em `vilanoeldobem_docs` (DEC-001..044); nenhuma stack decidida.
- O nome do produto é **Vila Noel do Bem** (DEC-001).
- Doação bloqueada por falta de parceira (G13, PEN-004) e provedor (PEN-006).

## 2. Decisões tomadas

IMPL-0001 (stack, proposta), IMPL-0002 (doações desabilitadas), IMPL-0003 (Worker + Static Assets + D1).
Perguntas OQ-01..06 registradas.

## 3. Arquivos

`apps/web/` (cliente, Worker, config), `migrations/0001..0002`, governança na raiz, `docs/`.

## 4. Funcionalidades entregues

Ver [CHANGELOG 0.1.0](../../CHANGELOG.md#010---2026-11-08).

## 5. Validação

- `pnpm typecheck` ok; `pnpm test` 11 testes ok; `pnpm build` ok.
- `wrangler dev` + D1 local: `/api/health` `db:true`; `/api/indicators` com `ongs_aprovadas: 0` e demais `null`;
  `/api/lots` 8 terrenos; `POST` → 405; rota desconhecida do cliente → 200 (SPA).
- `verify.mjs` em Chrome real, 1440×900 e 390×844: sem erros de console; capturas revisadas.

- Produção (https://vilanoeldobem.vilanoeldobem.workers.dev, versão `3d2dfada-dab3-490f-a650-f54a57a55b74`): `smoke-api.sh` 8/8 ok
  (D1 conectado, 8 terrenos), CSP e `X-Frame-Options` presentes, `verify.mjs` desktop + celular sem erros.

## 6. Limitações conhecidas

Sem contas, admin, persistência de XP no servidor; câmera e paleta provisórias.

## 7. Próxima fatia

Publicação de teste e validação em celular (G11/G12); depois contas e ONGs (marco seguinte; a 0.2.0 acabou sendo a padronização de idiomas, IMPL-0004).
