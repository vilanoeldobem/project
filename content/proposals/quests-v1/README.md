# quests-v1 — proposta de missões da Vila

> **Status: PROPOSTA** (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025).
> Conteúdo narrativo para avaliação. O runtime das 15 missões está implementado para
> avaliação local/dev atrás de flags (`VITE_QUESTS_V1_ENABLED` / `?quests=1` no cliente e
> `QUESTS_V1_ENABLED` na API), desligado em produção e staging; nada aqui é decisão aprovada.

## Contagens

- 15 missões · 5 NPCs fictícios · 5 cadeias de 3 missões (convite → complicação → finale)
- XP total: **465** (≈ nível 5 no protótipo com XP_PER_LEVEL = 100)
- 6 entregas cruzadas (NPC de entrega diferente do de ativação)
- 8 objetos únicos; o mais usado aparece em 2 quests

## Distribuição por trilha

| Trilha | Quests |
|---|---|
| explore | 8 |
| play | 4 |
| causes | 3 |

## Distribuição por tipo de objetivo

| Tipo | Quests |
|---|---|
| talk | 1 |
| collect | 3 |
| deliver | 3 |
| visit | 2 |
| read | 1 |
| minigame | 3 |
| interact | 2 |

## Distribuição por status_mecanica

| Status | Quests | Quais |
|---|---|---|
| existing | 3 | route-memory-game, market-lucky-game, letter-pairs-game |
| partial | 3 | newest-house-visit, tree-promise-visit, donation-promise-reading |
| new | 9 | demais |

## Cadeias

| Cadeia | NPC | Título | Missões (XP) | XP |
|---|---|---|---|---|
| flight-night | Baltazar | A Noite de Voo | harness-bells (20) → route-memory-game (30) → charm-for-the-flight (50) | 100 |
| market-opening | Dona Filó | A inauguração da barraca | market-invitations (15) → ornament-crates (25) → market-lucky-game (50) | 90 |
| undelivered-letters | Seu Nivaldo | As cartas que ficaram | frozen-mailbox (15) → letter-pairs-game (30) → newest-house-visit (50) | 95 |
| lake-lights | Aurora | A noite das luzes do lago | lake-lanterns (20) → kids-sled-run (25) → lantern-for-the-flight (50) | 95 |
| village-story | Dona Guida | O livro da Vila | tree-promise-visit (15) → donation-promise-reading (20) → story-page-delivery (50) | 85 |

## Objetos únicos (8)

| objeto_id | Nome | Tipo | Usos |
|---|---|---|---|
| reindeer-bell | Sino do arreio | quest_item | harness-bells |
| lucky-charm | Patuá da sorte | quest_item | charm-for-the-flight |
| ornament-crate | Caixa de enfeites | quest_item | ornament-crates |
| village-mailbox | Caixa de correio | world_prop | frozen-mailbox |
| lake-lantern | Lanterna do lago | quest_item | lake-lanterns, lantern-for-the-flight |
| kids-sled | Trenó pequeno | world_prop | kids-sled-run |
| donation-panel | Painel de doação global | world_prop | donation-promise-reading |
| story-page | Página da história | quest_item | story-page-delivery |

## Lacunas de mecânica (implementadas em local/dev atrás de flags)

- Diálogo com NPC e entrega entre NPCs: `apps/client/src/ui/NpcDialog.tsx`, com aceitar, concluir e a oferta
  seguinte no mesmo painel.
- Coleta além dos 3 presentes: `QUEST_SPAWNS` (dois sinos, duas caixas, duas lanternas) em
  `packages/shared/src/game/world.ts`, com coleta por proximidade.
- Adereços interativos: `QUEST_INTERACTIONS` para a caixa de correio e o trenó pequeno.
- Rastreio de leitura (painel de doação global) e de visita (árvore e casa publicada): eventos
  `read-confirm` e do id do terreno, com o botão explícito "Entendi, li a promessa" para a leitura.
- `newest-house-visit` exige ONG publicada no ambiente: sem casa publicada, o Caderno mostra
  "Aguardando uma casa publicada" e o aceite fica desabilitado (`needsPublishedLot`).

O motor de estados é `packages/shared/src/game/quests.ts` (uma missão ativa por vez) e o XP no servidor
reusa `applyEvent`, sem migration. Tudo continua **PROPOSTA** e pendente de aprovação em PEN-025; as
flags ficam desligadas em produção.

## Validação

`node validate-quests.mjs` confere as regras estruturais (contagens, trilhas, tipos,
pré-requisitos, entregas cruzadas, XP, objetos, limites de texto e ausência de marcadores
de preenchimento).

`node validate-objects.mjs` confere a normalização de [`objects.csv`](objects.csv) e a fila de
[`object-prompts/`](object-prompts/README.md): as 9 missões com objeto cobertas por 8 objetos
únicos, uso de 1 a 4 missões por objeto, orçamentos de voxels e faces, coerência de status
(`reuse` sem prompt, `new` com prompt) e ausência de marcadores de preenchimento. O relatório
desta revisão está em [`review.md`](review.md).
