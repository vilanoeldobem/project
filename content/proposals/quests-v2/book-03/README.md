# Livro III, O Tempo e as Cartas

> **Status: PROPOSTA.** Conteúdo da fatia 03 da saga v2, atrás de `VITE_QUESTS_V2_ENABLED` / `?quests2=1` no
> cliente e `QUESTS_V2_ENABLED` na API. Desligado em produção e homologação.

## Entrada e saída

- Entrada: `b03-c1-01`, que usa `b02-c3-04` como pré-requisito.
- Saída: `b03-c3-04`, que o manifesto usa como pré-requisito de `b04-c1-01`. O Livro IV não é alterado.

## As 45 entradas

33 narrativas (12 principais, 16 regionais, 5 secundárias), 930 XP, e 12 marcos, 120 XP. Total do livro: 1.050 XP.
Os IDs, títulos, tipos, NPCs, pré-requisitos, XP, objetos e estados estão em `quests.csv`, `dialogues.csv`,
`objects.csv` e `milestones.csv`.

```text
b03-c1-01 b03-c1-02 b03-c1-03 b03-c1-04 b03-c2-01 b03-c2-02 b03-c2-03 b03-c2-04
b03-c3-01 b03-c3-02 b03-c3-03 b03-c3-04
b03-r1-01 b03-r1-02 b03-r1-03 b03-r1-04 b03-r1-05 b03-r1-06 b03-r1-07 b03-r1-08
b03-r2-01 b03-r2-02 b03-r2-03 b03-r2-04 b03-r2-05 b03-r2-06 b03-r2-07 b03-r2-08
b03-s1 b03-s2 b03-s3 b03-s4 b03-s5
b03-m1-01 b03-m1-02 b03-m1-03 b03-m1-04 b03-m1-05 b03-m1-06
b03-m2-01 b03-m2-02 b03-m2-03 b03-m2-04 b03-m2-05 b03-m2-06
```

## NPCs

Oito entradas em `npcs.csv`: Dona Guida, Seu Nivaldo, Dona Filó, Mestre Anselmo, Nina, Dona Cida, Seu Elias e
Tomás. Guida, Nivaldo, Filó, Anselmo, Nina, Cida e Elias são compartilhados com os Livros I e II; o módulo exporta
as cópias compartilhadas apenas enquanto os módulos anteriores estão vazios. Com os livros anteriores presentes,
`STORY_WORLD` mantém um NPC por id e as interações reutilizam as posições já existentes. Tomás é o único NPC novo
do livro e fica na beira da Vila.

## Props

Quatro geradores novos em `apps/client/src/scene/gen/quest-v2/book-03/`:

| id | tipo | orçamento | uso |
|---|---|---|---|
| `memory-gear` | `quest_item` | 60/160 | engrenagem que move a hora |
| `letter-bundle` | `quest_item` | 45/120 | resposta, carta que voltou e carta para si mesmo |
| `old-stamp` | `quest_item` | 25/70 | selos antigos e selo colado errado |
| `clock-face` | `world_prop` | 150/420 | relógio do Campanário |

`bell-rope` reutiliza `ornament-crate`; `story-page` e `reindeer-bell` são reutilizados do catálogo existente. Esses
itens derivados não ganham linha em `objects.csv`.

## Cosméticos

| id | slot | origem | recompensa |
|---|---|---|---|
| `back-postbag` | `back` | marco | `b03-m1-06` |
| `helmet-bell` | `helmet` | marco | `b03-m2-06` |
| `blouse-post` | `blouse` | missão | `b03-c3-04` |
| `pants-aurora` | `pants` | premium | catálogo, sem compra |
| `pants-frost` | `pants` | premium | catálogo, sem compra |
| `pants-gold-thread` | `pants` | premium | catálogo, sem compra |

Premium é `unlock.kind: "paid"`, sem preço, sem compra e sem equipar. A UI mostra "Visual pago" e a prévia.

## Estados

`mail-sorted` (`b03-c1-04`), `clock-running` (`b03-c2-04`) e `postman-named` (`b03-c3-04`) são os únicos
`WorldStateId` do livro. `postman-clue`, citado na tabela da bíblia, não existe no enum; o estado canônico do fecho
é `postman-named`. `archive-room`, `stuck-clock`, `old-mailbag` e `returned-letter` ficam no texto e nos objetos.

## Pendências conhecidas

- Os objetivos de minijogo (`b03-r1-07`, `b03-r2-07`) usam `kind: "minigame"`. O spine abre o painel de jogos mas
  não grava o evento da missão v2 ao vencer; a sessão 12 é dona dessa ligação. A verificação de navegador usa um
  harness temporário, revertido antes do push.
- Os contadores `letters` e `bells` dos marcos ainda não são calculados pelo spine; os testes cobrem
  `settleMilestonesIn` e os limiares canônicos.
- Os props de estado não têm collider permanente: existem só enquanto a missão está ativa, e um collider
  permanente viraria obstáculo invisível depois.

## Verificação

```bash
pnpm check
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-03
node apps/client/scripts/gallery.mjs http://localhost:5173 props cosmetics
node apps/client/scripts/verify-story.mjs http://localhost:5173 book-03
```

O verificador bruto precisa do Livro II no catálogo para semear `b02-c3-04` e da ligação real do minijogo. O PR
mostra a execução com um harness temporário declarado, revertido antes do push.
