# object-prompts — fila de construção dos objetos de quest

> **Status: PROPOSTA** (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025).
> Fila derivada de [`../objects.csv`](../objects.csv) e de [`../objects.md`](../objects.md). Os geradores são
> implementados em `apps/client/src/scene/gen/quest-items.ts`: os cinco objetos `new` estão `done`. Referências
> visuais pesquisadas em [`../object-references.md`](../object-references.md).

## Ordem de construção

Cada prompt é um parágrafo único de texto puro, sem crase, aspas duplas, cifrão, exclamação, barra
invertida, ponto e vírgula, parênteses, interrogação, asterisco, pipe, e comercial, maior ou menor,
porcentagem, cerquilha, igual ou mais, para poder ser colado direto no `ompy` entre aspas.

| ordem | objeto_id | nome_objeto | cadeia | usado_em | status_build | prompt |
|---:|---|---|---|---|---|---|
| 01 | reindeer-bell | Sino do arreio | flight-night | harness-bells | done | [01-reindeer-bell.md](01-reindeer-bell.md) |
| 02 | lucky-charm | Patuá da sorte | flight-night | charm-for-the-flight | done | [02-lucky-charm.md](02-lucky-charm.md) |
| 03 | ornament-crate | Caixa de enfeites | market-opening | ornament-crates | done | [03-ornament-crate.md](03-ornament-crate.md) |
| 04 | donation-panel | Painel de doação global | village-story | donation-promise-reading | done | [04-donation-panel.md](04-donation-panel.md) |
| 05 | story-page | Página da história | village-story | story-page-delivery | done | [05-story-page.md](05-story-page.md) |

A ordem segue a prioridade narrativa: primeiro os dois objetos do arco de abertura (`flight-night`),
depois o mercado (`market-opening`) e por fim os dois objetos do livro da Vila (`village-story`).
Itens de coleta vêm antes dos de entrega dentro de cada cadeia.

Medidas máximas na galeria de adereços, em 12 sementes de teste e 8 sementes de galeria: `reindeer-bell`
57 / 138, `lucky-charm` 50 / 108, `ornament-crate` 68 / 156, `donation-panel` 77 / 196 e `story-page`
47 / 130 (voxels / faces). Todos dentro dos tetos de 80 / 200 para `quest_item` e 220 / 600 para `world_prop`.

## Objetos `reuse` sem prompt

Estes três já são atendidos por um gerador existente de `apps/client/src/scene/gen/props.ts`, apenas com
semente própria, e por isso não têm arquivo de prompt:

| objeto_id | nome_objeto | gerador | semente | medido (voxels / faces) |
|---|---|---|---|---|
| village-mailbox | Caixa de correio | mailbox | village-mail | 48 / 114 |
| lake-lantern | Lanterna do lago | lantern | lake-lantern | 78 / 162 |
| kids-sled | Trenó pequeno | sled | kids-sled | 47 / 170 |

Nenhum deles troca só de cor: `lantern` muda a altura do poste pela semente (a semente `lake-lantern`
zera o poste e vira lanterna de chão), enquanto `mailbox` e `sled` mudam altura, comprimento, cor,
bandeleta e carga.

## Verificação da fila

```bash
node validate-objects.mjs
node validate-quests.mjs
```

`validate-objects.mjs` confere cobertura das quests com objeto, cardinalidade de 8 a 12 objetos, uso de
1 a 4 missões por objeto, ids únicos, nomes e tipos consistentes, status coerente, orçamentos, prompt
para todo objeto `new`, nenhum prompt para `reuse`, numeração sem buraco e ausência de marcadores de
preenchimento. `validate-quests.mjs` segue conferindo a proposta original de missões.
