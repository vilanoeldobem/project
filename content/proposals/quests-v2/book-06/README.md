# Livro VI, O Amanhecer (PROPOSTA)

Fatia 06 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-06.ts` com as 45 entradas do Livro VI, os 8 NPCs de quest, os spawns, as interações, os obstáculos, os estados e os 6 cosméticos. A entrada é `b06-c1-01`; a saída é `b06-c3-04`, que abre o Livro VII.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b06-c1-01` a `b06-c3-04`, de `b06-r1-01` a `b06-r2-08`, de `b06-s1` a `b06-s5` e de `b06-m1-01` a `b06-m2-06`.

## Regiões e cenário

- **Vila do Amanhecer**: usa a praça `square-02` (`ring4`, lado 0, metade `+`), com centro em `(86.5, 16.5)`. Dona Sol, Horácio e Luzia ficam no jardim do sino, no relógio de sol e no sino. O sino e os pedaços ficam na praça; as cordas de sol, a farinha e os pedaços do sino usam os arredores da praça.
- **Estrada do Orvalho**: usa o fim da avenida entre os lados 6 e 7, do raio 84 ao 98,5, sem geometria nova. Seu Caminho e Lila ficam no começo da estrada; o mapa, as gotas, a ponte de orvalho e as pedras ficam na beira da avenida.

As posições foram conferidas contra `sceneColliders(new Set())`: a folga mínima é 0,45 u para o avatar, 0,75 u para NPC e o raio de 5,0 u em volta da árvore. O teste `apps/client/src/scene/quest-v2/book-06.test.ts` repete a conferência.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Seu Elias (`seu-elias`), Tia Bete (`tia-bete`), Dona Sol (`dona-sol`), Horácio (`horacio`), Luzia (`luzia`), Seu Caminho (`seu-caminho`) e Lila (`lila`).

- `storyteller`, `seu-elias` e `tia-bete` reusam posições canônicas dos Livros I a V; o filtro `EARLIER_IDS` remove a duplicata quando os livros anteriores estiverem na `main`.
- `dona-sol`, `horacio`, `luzia`, `seu-caminho` e `lila` são novos, na Vila do Amanhecer e na Estrada do Orvalho.
- Tia Bete é a padeira da primeira manhã, sem missão própria. As outras sete aparecem como ativadoras ou entregadoras.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-06/`:

| id | categoria | gerador | orçamento | tamanho | variantes |
|---|---|---|---:|---:|---|
| `dawn-bell` | `world_prop` | `book-06-dawn-bell` | 220/600 | 0,24 | largura, altura, metal, madeira, pedra, rachadura, neve, giro |
| `sun-cord` | `quest_item` | `book-06-sun-cord` | 80/200 | 0,14 | cor, altura do laço, lado do laço, borla, giro |
| `dew-map` | `quest_item` | `book-06-dew-map` | 80/200 | 0,16 | largura, dobra, caminho, cor do painel, gota, giro |
| `path-stone` | `quest_item` | `book-06-path-stone` | 80/200 | 0,15 | altura, largura, pedra, sulco, musgo, neve, giro |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio: `dew-drop` reutiliza `dew-map`; `dawn-bell-parts` reutiliza `dawn-bell`; a farinha reutiliza `ornament-crate`; as cartas e a notícia reutilizam `story-page`.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-06/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `dress-dawn` | `dress` | marco | não | `b06-m1-06` |
| `hand-left-map` | `handLeft` | marco | não | `b06-m2-06` |
| `pants-lantern` | `pants` | missão | não | `b06-c3-04` |
| `back-aurora-cape` | `back` | premium | sim | catálogo e prévia |
| `back-star-cloak` | `back` | premium | sim | catálogo e prévia |
| `back-dawn-mantle` | `back` | premium | sim | catálogo e prévia |

Nada é comprado: as três capas premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP. Os dois minijogos usam os eventos `coro-dos-nomes` e `ponte-das-pegadas`, iguais aos ids das interações. Enquanto a fatia 12 não implementar os jogos, os dois objetivos ficam provados no teste de máquina de estados, e a passagem de navegador fica em 31 das 33 missões.

## Estados de mundo

`STATES` exporta `["dawn-bell", "dew-road"]`. `b06-c1-03` e `b06-r1-08` ligam `dawn-bell`; `b06-c2-04` e `b06-r2-08` ligam `dew-road`. `traveler-keeper` não é um `WorldStateId`: a saída do livro é a conclusão de `b06-c3-04`, que é o pré-requisito de `b07-c1-01`.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-06
pnpm --filter @vila/shared test -- book-06
pnpm --filter @vila/client test -- book-06
```

O validador deve imprimir `OK book: manifest=484 entries=11400 XP`.

O `validate-slice.mjs` do main descartava as colunas do CSV ao montar a lista de capítulos e por isso lia o pré-requisito como vazio. A fatia aplica a mesma correção de uma linha já usada nos Livros IV e V: o objeto do capítulo passa a levar `...quest` e `xp: Number(quest.xp)`.

## Resultados desta fatia

- `pnpm typecheck`: passa nos seis pacotes.
- `pnpm build`: passa nos seis pacotes.
- `pnpm --filter @vila/shared test`: 327 testes passam.
- `pnpm --filter @vila/client test`: 1.014 testes passam.
- `pnpm --filter @vila/api test`: 487 de 488 passam; a única falha é o teste de `accounts.test.ts` descrito abaixo.
- `node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-06`: `OK book: manifest=484 entries=11400 XP`.
- Navegador real: 31 missões não-minijogo concluídas pelo HUD e pelos painéis; XP delta 850; `OK story book-06`. A captura fica em `apps/client/verify-output/story-book-06.png`.
- Galeria: `props` com 236 chamadas e 50.454 triângulos; `cosmetics` com 36 chamadas e 3.612 triângulos; capturas em `apps/client/verify-output/gallery-props.png` e `gallery-cosmetics.png`.

## Limites conhecidos

- Os minijogos `coro-dos-nomes` e `ponte-das-pegadas` pertencem à fatia 12. O teste de máquina de estados prova as duas missões; o navegador as deixa pré-concluídas e joga as outras 31.
- O verificador oficial tem o defeito de `extra.progress`; a prova de navegador usa uma cópia temporária com o conserto e o preseed, removida antes do commit.
- `traveler-keeper` não existe em `WorldStateId`; a saída do livro é a conclusão de `b06-c3-04`, que é o pré-requisito de `b07-c1-01`.
- `apps/api/src/accounts.test.ts` compara `KNOWN_EVENTS` com o catálogo v1 e falha quando um livro entra; o arquivo é proibido pelo cânone e fica para a integração.
- A posição de Lila foi deslocada para `(36.5, -88.5)` porque o verificador teleporta para o centro do NPC e a resolução de colisão empurrava o avatar para dentro do raio de Seu Caminho. O teste de cena confirma a folga e a separação.

O `pnpm check` falha somente em `apps/api/src/accounts.test.ts`, no teste que compara `KNOWN_EVENTS` com o catálogo v1: o arquivo está na lista proibida do cânone e não é editado por esta fatia. O resto da API passa com `pnpm --filter @vila/api exec vitest run --exclude '**/accounts.test.ts'` (423 testes em 14 arquivos).

O verificador `apps/client/scripts/verify-story.mjs` tem um defeito pré-existente: usa `window.__vila.extra.progress()` em vez de `window.__vila.progress()`. A fatia contorna o defeito em uma cópia temporária dentro de `apps/client/scripts/`, removida antes do commit, sem editar o arquivo compartilhado. A cópia também pré-conclui `b06-r1-07` e `b06-r2-07`, porque a fatia 12 ainda não tem os dois minijogos; as 31 missões restantes passam pelo HUD e pelos painéis, com XP delta 850.

## Arquivos de teste compartilhados

Só as contagens de cosméticos mudam com qualquer livro:

- `packages/shared/src/game/cosmetics-v2.test.ts` passou a conferir o prefixo v1 por slot em vez de exigir 10 itens por slot.
- `apps/client/src/ui/Wardrobe.test.tsx` calcula `freeCount`, `helmetFree` e `handLeftFree` a partir de `COSMETICS_V2`.
- `apps/client/src/scene/gen/__snapshots__/gen.test.ts.snap` recebeu as quatro entradas novas de props.

Nenhum arquivo compartilhado de produção foi editado. O `CHANGELOG.md` recebeu uma linha em `[Unreleased]`.
