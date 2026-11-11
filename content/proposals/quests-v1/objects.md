# Objetos de quests-v1 — normalização, classificação e fila de construção

> **Status: PROPOSTA** (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025).
> Derivado de [`quests.csv`](quests.csv) e de [`story-bible.md`](story-bible.md); nada aqui é decisão
> aprovada. Os cinco objetos `new` têm gerador em `apps/client/src/scene/gen/quest-items.ts` e estão `done`;
> os três `reuse` continuam usando geradores de `props.ts`. Referências visuais em
> [`object-references.md`](object-references.md).

## 1. Regras da normalização

- Entram apenas as linhas de `quests.csv` com `tipo_objeto` diferente de `none` (9 linhas).
- Agrupamento por `objeto_id`; `nome_objeto` e `tipo_objeto` idênticos em todas as ocorrências e
  `qtd_total` igual à soma exata de `qtd_objetos`.
- Resultado: **8 objetos únicos** (meta de 8 a 12), nenhum objeto usado em mais de 2 missões.
- Tetos de orçamento: **80 voxels / 200 faces** para `quest_item` e **220 voxels / 600 faces** para
  `world_prop` (categoria `props` de IMPL-0010).
- Classificação: `reuse` quando um gerador existente de `apps/client/src/scene/gen/props.ts` cobre a
  silhueta por variação de semente; `new` (`status_build: pending` até o gerador ser implementado, depois
  `done`) quando a silhueta exige gerador próprio em `apps/client/src/scene/gen/quest-items.ts`. Troca apenas
  de cor não conta como reuso. Os cinco objetos `new` já estão `done`.
- Tabela completa em [`objects.csv`](objects.csv); prompts em [`object-prompts/`](object-prompts/README.md).

## 2. Índice por cadeia e missão

### flight-night — Baltazar, o guardião do trenó

| missão | objetivo | objeto_id | nome_objeto | tipo_objeto | qtd | gerador | status_build | orçamento (voxels / faces) | prompt |
|---|---|---|---|---:|---|---|---|---|---|
| harness-bells | collect | reindeer-bell | Sino do arreio | quest_item | 2 | quest-reindeer-bell | done | 80 / 200 | [01-reindeer-bell.md](object-prompts/01-reindeer-bell.md) |
| charm-for-the-flight | deliver | lucky-charm | Patuá da sorte | quest_item | 1 | quest-lucky-charm | done | 80 / 200 | [02-lucky-charm.md](object-prompts/02-lucky-charm.md) |

`route-memory-game` não tem objeto (`tipo_objeto` `none`).

### market-opening — Dona Filó, a mercadora do oeste

| missão | objetivo | objeto_id | nome_objeto | tipo_objeto | qtd | gerador | status_build | orçamento (voxels / faces) | prompt |
|---|---|---|---|---:|---|---|---|---|---|
| ornament-crates | collect | ornament-crate | Caixa de enfeites | quest_item | 2 | quest-ornament-crate | done | 80 / 200 | [03-ornament-crate.md](object-prompts/03-ornament-crate.md) |

`market-invitations` e `market-lucky-game` não têm objeto (`tipo_objeto` `none`).

### undelivered-letters — Seu Nivaldo, o carteiro

| missão | objetivo | objeto_id | nome_objeto | tipo_objeto | qtd | gerador | status_build | orçamento (voxels / faces) | prompt |
|---|---|---|---|---:|---|---|---|---|---|
| frozen-mailbox | interact | village-mailbox | Caixa de correio | world_prop | 1 | mailbox | reuse | 220 / 600 | — |

`letter-pairs-game` e `newest-house-visit` não têm objeto (`tipo_objeto` `none`).

### lake-lights — Aurora, a vigia do lago

| missão | objetivo | objeto_id | nome_objeto | tipo_objeto | qtd | gerador | status_build | orçamento (voxels / faces) | prompt |
|---|---|---|---|---:|---|---|---|---|---|
| lake-lanterns | collect | lake-lantern | Lanterna do lago | quest_item | 2 | lantern | reuse | 80 / 200 | — |
| kids-sled-run | interact | kids-sled | Trenó pequeno | world_prop | 1 | sled | reuse | 220 / 600 | — |
| lantern-for-the-flight | deliver | lake-lantern | Lanterna do lago | quest_item | 1 | lantern | reuse | 80 / 200 | — |

### village-story — Dona Guida, a contadora de histórias

| missão | objetivo | objeto_id | nome_objeto | tipo_objeto | qtd | gerador | status_build | orçamento (voxels / faces) | prompt |
|---|---|---|---|---:|---|---|---|---|---|
| donation-promise-reading | read | donation-panel | Painel de doação global | world_prop | 0 | quest-donation-panel | done | 220 / 600 | [04-donation-panel.md](object-prompts/04-donation-panel.md) |
| story-page-delivery | deliver | story-page | Página da história | quest_item | 1 | quest-story-page | done | 80 / 200 | [05-story-page.md](object-prompts/05-story-page.md) |

`tree-promise-visit` não tem objeto (`tipo_objeto` `none`). `donation-promise-reading` tem
`qtd_objetos = 0` porque o tipo de objetivo é `read`; o painel existe uma única vez no mundo, junto à
grande árvore, e é inspecionado, não coletado.

## 3. Catálogo consolidado por `objeto_id`

| objeto_id | nome_objeto | tipo_objeto | status_build | classificação | gerador | cadeia | usado_em | qtd_total | semente | orçamento (voxels / faces) | tamanho | interação | colisão | materiais |
|---|---|---|---|---|---|---|---|---:|---|---|---|---|---|---|
| reindeer-bell | Sino do arreio | quest_item | done | new | quest-reindeer-bell | flight-night | harness-bells | 2 | reindeer-bell | 80 / 200 | 0.18 | pickup | none | solid |
| lucky-charm | Patuá da sorte | quest_item | done | new | quest-lucky-charm | flight-night | charm-for-the-flight | 1 | lucky-charm | 80 / 200 | 0.18 | carry | none | solid |
| ornament-crate | Caixa de enfeites | quest_item | done | new | quest-ornament-crate | market-opening | ornament-crates | 2 | ornament-crate | 80 / 200 | 0.2 | pickup | none | solid;emissive |
| village-mailbox | Caixa de correio | world_prop | reuse | reuse | mailbox | undelivered-letters | frozen-mailbox | 1 | village-mail | 220 / 600 | 0.2 | interact | small | solid |
| lake-lantern | Lanterna do lago | quest_item | reuse | reuse | lantern | lake-lights | lake-lanterns;lantern-for-the-flight | 3 | lake-lantern | 80 / 200 | 0.22 | pickup | none | solid;emissive |
| kids-sled | Trenó pequeno | world_prop | reuse | reuse | sled | lake-lights | kids-sled-run | 1 | kids-sled | 220 / 600 | 0.22 | interact | small | solid |
| donation-panel | Painel de doação global | world_prop | done | new | quest-donation-panel | village-story | donation-promise-reading | 0 | donation-panel | 220 / 600 | 0.2 | inspect | small | solid;emissive |
| story-page | Página da história | quest_item | done | new | quest-story-page | village-story | story-page-delivery | 1 | story-page | 80 / 200 | 0.18 | carry | none | solid |

## 4. Justificativa de classificação

**`reuse` (3)** — a silhueta já sai de um gerador de `props.ts` só mudando a semente:

- `village-mailbox` → `mailbox` com semente `village-mail`: poste, corpo abaulado, bandeleta e neve no
  topo são exatamente a caixa de correio da Vila (48 voxels e 114 faces, medidos).
- `lake-lantern` → `lantern` com semente `lake-lantern`: a variação `post = r.int(0, 6)` do gerador
  devolve `post = 0`, ou seja, uma lanterna baixa de chão sem poste, com 78 voxels e 162 faces (dentro
  do teto de item de quest). A mesma função com semente `ring-lantern` produz o poste alto da rua.
- `kids-sled` → `sled` com semente `kids-sled`: patins curvos, assento ripado e encosto/carga opcional
  já são o trenó pequeno guardado ao sul (47 voxels e 170 faces, medidos).

**`new` (5, todos `done`)** — nenhum gerador de `props.ts` cobre a silhueta; os cinco estão em
`apps/client/src/scene/gen/quest-items.ts` e foram conferidos na galeria de adereços:

- `reindeer-bell`: sino de arreio com cúpula metálica, badalo e alça de couro; `gift` é caixa fechada e
  `lantern` é lanterna de quadro e chama. Máximo medido: 57 voxels / 138 faces.
- `lucky-charm`: saquinho amarrado com cordão, selo estelar e ramo de pinheiro; não é caixa de presente.
  Máximo medido: 50 voxels / 108 faces.
- `ornament-crate`: engradado aberto com bolas de Natal à mostra; `gift` esconde o conteúdo sob papel.
  Máximo medido: 68 voxels / 156 faces.
- `donation-panel`: atril e prancha de leitura junto à grande árvore; `signpost` é poste de setas
  direcionais e `ChristmasTree` hoje é o próprio painel em HTML, sem modelo físico de leitura. Máximo
  medido: 77 voxels / 196 faces.
- `story-page`: folha/pergaminho com debruado, uma faixa de fita e lacre; nenhum gerador produz papel.
  Máximo medido: 47 voxels / 130 faces.

Mudar só a cor de um `gift` não foi aceito como reuso em nenhum dos cinco casos.
