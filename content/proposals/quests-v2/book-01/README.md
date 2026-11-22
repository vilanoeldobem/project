# Livro I, A Chegada

> **Status: PROPOSTA.** Conteúdo da fatia 01 da saga v2, atrás de `VITE_QUESTS_V2_ENABLED` / `?quests2=1` no
> cliente e `QUESTS_V2_ENABLED` na API. Desligado em produção e homologação.

## Entrada e saída

- Entrada: `b01-c1-01`, sem pré-requisito.
- Saída: `b01-c3-04`, que o manifesto usa como pré-requisito de `b02-c1-01`. O Livro II não é alterado.

## As 45 entradas

33 narrativas (12 principais, 16 regionais, 5 secundárias), 930 XP, e 12 marcos, 120 XP. Total do livro: 1.050 XP.
Os IDs, títulos, tipos, NPCs, pré-requisitos, XP e estados estão em `quests.csv`, `dialogues.csv` e `milestones.csv`.

## NPCs

Oito entradas novas em `npcs.csv`: Mestre Anselmo, Nina, Tia Bete, Seu Nazário, Lia, Dona Íris, Dona Cida e
Mestre Téo. O módulo também reaproveita Dona Guida (`storyteller`), Dona Filó (`market-keeper`) e Seu Nivaldo
(`postmaster`) com os mesmos ids, seeds, posições e rotações de `packages/shared/src/game/world.ts`, para o livro
funcionar com a bandeira v2 sozinha. Com as duas bandeiras ligadas, os três modelos ficam sobrepostos.

## Props

Quatro geradores novos em `apps/client/src/scene/gen/quest-v2/book-01/`:

| id | tipo | orçamento | uso |
|---|---|---|---|
| `silent-bell` | `world_prop` | 220/600 | sino da praça |
| `bell-parts` | `quest_item` | 40/110 | badalo e cordas; também fios do cachecol |
| `recipe-page` | `quest_item` | 30/80 | páginas da receita e ingredientes |
| `panettone` | `quest_item` | 45/120 | primeira fatia e primeira troca |

`score-page`, `stall-cloth`, `scarf-thread` e `sweet-free` são itens derivados: reutilizam `story-page`,
`bell-parts` ou `recipe-page` e não ganham linha em `objects.csv`.

## Cosméticos

| id | slot | origem | recompensa |
|---|---|---|---|
| `helmet-star` | `helmet` | marco | `b01-m1-06` |
| `hand-left-fair` | `handLeft` | marco | `b01-m2-06` |
| `face-snow-freckles` | `face` | missão | `b01-c3-04` |
| `helmet-aurora` | `helmet` | premium | catálogo, sem compra |
| `helmet-frost` | `helmet` | premium | catálogo, sem compra |
| `helmet-dawn` | `helmet` | premium | catálogo, sem compra |

O id `face-freckles` já existe no catálogo v1 (rosto, `play-memory`). Para não duplicar o id em `COSMETICS_V2`,
a expansão usa `face-snow-freckles`, mesmo slot e mesma missão. Nada é comprado: premium é catálogo e prévia.

## Estados

`bell-rung` (`b01-c1-04`) e `market-open` (`b01-c2-04`) são os únicos `WorldStateId` do livro. `bell-missing`,
`market-smell`, `first-thread`, `frost-seen`, `promise-book`, `choir-sings` e `welcome-promise` não existem no
enum; ficam no texto e na conclusão da missão, sem estado de mundo.

## Pendências conhecidas

- Os três objetivos de minijogo (`b01-r1-04`, `b01-r1-07`, `b01-r2-07`) usam os eventos
  `coro-dos-nomes-rehearsal`, `coro-dos-nomes-plaza` e `forno-da-memoria`. A fatia 12 precisa registrar o event
  id do alvo `kind: "minigame"` da missão ativa; o `Minigame.eventId` do catálogo (`coro-dos-nomes`) não é o
  event id de todas as missões.
- Os contadores de marco (`missions`, `trades`) e a renderização persistente dos props de estado ainda não estão
  ligados no spine; os testes cobrem `settleMilestonesIn` e `worldStatesIn`.
- `silent-bell` é sólido no desenho, mas não tem collider: o modelo só existe enquanto a missão está ativa; um
  collider permanente viraria obstáculo invisível depois.

## Verificação

```bash
pnpm check
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-01
node apps/client/scripts/verify-story.mjs http://localhost:8799 book-01
```
