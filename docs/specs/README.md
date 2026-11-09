# Especificações do produto

> **Status:** referência externa · **Atualizado em:** 2026-11-08
> **Fonte de verdade:** repositório [`vilanoeldobem_docs`](https://github.com/vilanoeldobem/vilanoeldobem_docs)

As especificações **não** são copiadas para cá, para não divergirem. A equipe discute e registra regras de negócio
no repositório de documentação; o código implementa as regras CONFIRMADAS e cita o `DEC-` (fluxo em
`vilanoeldobem_docs/docs/guides/fluxo-negocio-para-codigo.md`). Caminhos abaixo são daquele repositório:

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

## Mapa telas → código (0.2.0)

| Tela | Código | Status |
|---|---|---|
| P01 | `scene/Props.tsx` (árvore), `ui/Welcome.tsx`, `ui/Donation.tsx` | Parcial |
| P02 | `ui/Indicators.tsx`, `worker/api.ts` | Parcial |
| P03/P04 | `scene/Props.tsx` (Lots), `ui/Lot.tsx`, `ui/Explore.tsx` | Parcial |
| P09 | `ui/MemoryGame.tsx` | Parcial |
| P14 | `game/progress.ts`, `ui/Missions.tsx` | Parcial |
| demais | — | Planejado |
