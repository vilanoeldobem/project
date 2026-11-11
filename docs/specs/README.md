# Especificações do produto

> **Status:** referência externa · **Atualizado em:** 2026-11-11
> **Fonte de verdade:** repositório [`vilanoeldobem/docs`](https://github.com/vilanoeldobem/docs)

As especificações **não** são copiadas para cá, para não divergirem. A equipe discute e registra regras de negócio
no repositório de documentação; o código implementa as regras CONFIRMADAS e cita o `DEC-` (fluxo em
`vilanoeldobem/docs/docs/guides/fluxo-negocio-para-codigo.md`). Caminhos abaixo são daquele repositório:

| Documento | Para quê |
|---|---|
| `docs/README.md` | Índice e precedência |
| `docs/decisions/registro-de-decisoes.md` | **Autoridade**: DEC-001..046, PEN-, PRP- |
| `docs/specs/especificacao-funcional.md` | Funções 1–14 |
| `docs/specs/plano-de-wireframes.md` + `docs/specs/wireframes/` | Telas P01–P15 |
| `docs/specs/missao-da-vila.md` | Missões, XP, regras de progressão |
| `docs/reference/guia-identidade-visual-voxel.md` | Voxel, paleta de trabalho, logo |
| `management/plano-de-desenvolvimento.md` | Rotas A/B, marcos, cartões |
| `management/acompanhamento/` | Kanban/Gantt oficial |

## Precedência

1. Declarações explícitas do responsável. 2. Registro de decisões (mais recente). 3. Base 1.0. 4. Propostas.

Estados: **CONFIRMADO** (decisão), **PROPOSTA**, **HIPÓTESE**, **PENDENTE**. Só CONFIRMADO é decisão.

## Mapa telas → código (0.4.0)

Caminhos relativos a `apps/client/src/`, salvo indicação.

| Tela | Código | Status |
|---|---|---|
| P01 | `scene/Props.tsx` (árvore), `ui/Welcome.tsx`, `ui/Donation.tsx` | Parcial |
| P02 | `ui/Indicators.tsx`, `apps/api/src/api.ts` | Parcial |
| P03/P04 | `scene/Props.tsx` (Lots), `ui/Lot.tsx` ("Candidatar minha ONG" em terreno disponível), `ui/Explore.tsx` | Parcial |
| P09 | `ui/MemoryGame.tsx` | Parcial |
| P12 | `ui/NgoApplication.tsx` (4 etapas, situação), `ui/Admin.tsx` ("Análise de ONGs"), `apps/api/src/{ngo,admin}.ts`, `packages/shared/src/accounts/validate.ts` | Implementado, desligado em produção (IMPL-0011); campos PROPOSTA, sem upload de documentos |
| P13 | `ui/Account.tsx` (chip "Entrar"/"@nickname", painel da conta), `lib/account.ts`, `apps/api/src/{auth,session,mail}.ts` | Implementado, desligado em produção (IMPL-0011); campos CONFIRMADOS (DEC-038), regras de formato PROPOSTA |
| P14 | `packages/shared/src/game/progress.ts`, `ui/Missions.tsx`, `apps/api/src/progress.ts` (XP no servidor) | Parcial — XP no servidor só com conta (desligado em produção) |
| demais | — | Planejado |
