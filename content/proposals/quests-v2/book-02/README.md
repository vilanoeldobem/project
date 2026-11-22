# Livro II, As Casas e os Nomes

> **Status: PROPOSTA.** Conteúdo da fatia 02 da saga v2, atrás de `VITE_QUESTS_V2_ENABLED` / `?quests2=1` no
> cliente e `QUESTS_V2_ENABLED` na API. Desligado em produção e homologação.

## Entrada e saída

- Entrada: `b02-c1-01`, que usa `b01-c3-04` como pré-requisito.
- Saída: `b02-c3-04`, que o manifesto usa como pré-requisito de `b03-c1-01`. O Livro III não é alterado.

## As 45 entradas

33 narrativas (12 principais, 16 regionais, 5 secundárias), 930 XP, e 12 marcos, 120 XP. Total do livro: 1.050 XP.
Os IDs, títulos, tipos, NPCs, pré-requisitos, XP, objetos e estados estão em `quests.csv`, `dialogues.csv`,
`objects.csv` e `milestones.csv`.

```text
b02-c1-01 b02-c1-02 b02-c1-03 b02-c1-04 b02-c2-01 b02-c2-02 b02-c2-03 b02-c2-04
b02-c3-01 b02-c3-02 b02-c3-03 b02-c3-04
b02-r1-01 b02-r1-02 b02-r1-03 b02-r1-04 b02-r1-05 b02-r1-06 b02-r1-07 b02-r1-08
b02-r2-01 b02-r2-02 b02-r2-03 b02-r2-04 b02-r2-05 b02-r2-06 b02-r2-07 b02-r2-08
b02-s1 b02-s2 b02-s3 b02-s4 b02-s5
b02-m1-01 b02-m1-02 b02-m1-03 b02-m1-04 b02-m1-05 b02-m1-06
b02-m2-01 b02-m2-02 b02-m2-03 b02-m2-04 b02-m2-05 b02-m2-06
```

## NPCs

Oito entradas em `npcs.csv`: Dona Cida, Pip, Mestre Téo, Lia, Seu Elias, Dona Guida, Seu Nivaldo e Mestre
Anselmo. Seis delas também existem no Livro I. Para a ordem de merge não duplicar ids, o módulo exporta as seis
compartilhadas apenas enquanto `book-01` está vazio; com o Livro I presente, exporta só Pip e Seu Elias e as
interações reutilizam as posições do Livro I. Com as duas flags ligadas, Guida, Nivaldo e Anselmo também
aparecem no mundo v1, como já acontece no Livro I.

## Props

Quatro geradores novos em `apps/client/src/scene/gen/quest-v2/book-02/`:

| id | tipo | orçamento | uso |
|---|---|---|---|
| `nameplate` | `world_prop` | 60/160 | placa da casa de Alba |
| `toy-reindeer` | `quest_item` | 70/180 | peças, presente de Lia e vitrine |
| `rose` | `quest_item` | 30/90 | roseira de Alba |
| `watering-can` | `quest_item` | 45/120 | três regadores do jardim |

`alba-object`, `alba-letter`, `toy-parts`, `spinning-top`, `fabric-scrap`, `paint-pot` e `first-flower` são itens
derivados: no mundo usam `story-page`, `reindeer-bell`, `toy-reindeer` ou `watering-can`; no inventário mantêm o
id e o nome da tabela.

## Cosméticos

| id | slot | origem | recompensa |
|---|---|---|---|
| `blouse-garden` | `blouse` | marco | `b02-m1-06` |
| `blouse-quilt` | `blouse` | marco | `b02-m2-06` |
| `shoes-garden` | `shoes` | missão | `b02-c3-04` |
| `blouse-aurora` | `blouse` | premium | catálogo, sem compra |
| `blouse-velvet-night` | `blouse` | premium | catálogo, sem compra |
| `blouse-starlight` | `blouse` | premium | catálogo, sem compra |

`CosmeticModel.target` só aceita `body`, `armLeft` e `armRight`; `shoes-garden` é uma camada de corpo no pé e não
acompanha o balanço da perna. Premium é `unlock.kind: "paid"`, sem preço, sem compra e sem equipar.

## Estados

`garden-named` (`b02-c1-04`) acende o jardim; `toy-finished` (`b02-c2-04`) marca a rena pronta; `alba-remembered`
(`b02-c3-04`) fecha a casa. `alba-house` e `workshop-lit`, citados na bíblia, não existem no enum `WorldStateId`;
ficam no texto e na conclusão da missão. A janela e a vitrine não inventam estado novo.

## Pendências conhecidas

- Os três objetivos de minijogo (`b02-c2-03`, `b02-r1-07`, `b02-r2-04`) usam `kind: "minigame"`. O spine abre o
  painel de jogos mas não grava o evento da missão v2 ao vencer; a sessão 12 é dona dessa ligação. O verificador
  original, com o Livro I presente, para antes do Livro II porque o Livro I ainda oferece as próprias missões nos
  mesmos NPCs; o harness temporário completa o Livro I antes de começar e, sem a correção do minijogo, para em
  `b02-c2-03`.
- Os contadores `houses` e `memory-wins` dos marcos ainda não são calculados pelo spine; os testes cobrem
  `settleMilestonesIn` e os limiares canônicos. O limiar 97 é fixo no manifesto; o total real publicado de casas
  precisa de um seletor no spine.
- O PR #79 (Livro I) não está mergeado nesta branch. O fallback de NPCs mantém `STORY_WORLD` único nas duas
  ordens de merge; a verificação de navegador usa um worktree descartável com o conteúdo do Livro I.
- `apps/client/src/scene/quest-v2/book-01.test.ts`, do PR #79, percorre `STORY_WORLD` inteiro e exige `book === 1`;
  com o Livro II ele precisa filtrar por livro. A correção é da sessão 14 ou do PR #79, não deste livro.

## Verificação

```bash
pnpm check
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-02
node apps/client/scripts/gallery.mjs http://localhost:8799 props cosmetics
node apps/client/scripts/verify-story.mjs http://localhost:8799 book-02
```

O verificador bruto precisa do Livro I no catálogo para semear `b01-c3-04`. O PR mostra a saída bruta e a
execução de navegador com um worktree temporário que aplica o Livro I e um harness de minijogo declarado. Não há
merge, deploy, migração remota ou mudança de bandeira.
