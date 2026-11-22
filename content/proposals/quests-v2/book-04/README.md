# Livro IV, O Bosque e o Lago (PROPOSTA)

Fatia 04 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-04.ts` com as 45 entradas do Livro IV, os 8 NPCs de quest, os spawns, as interações e os obstáculos. A entrada é `b03-c3-04`; a saída é `b04-c3-04`, que abre o Livro V.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b04-c1-01` a `b04-c3-04`, de `b04-r1-01` a `b04-r2-08`, de `b04-s1` a `b04-s5` e de `b04-m1-01` a `b04-m2-06`.

## Regiões e cenário

- **Bosque dos Pinheiros**: usa o site `park-1`, na segunda volta, com centro em `(-15.75, -59)`. Seu Raul, Fia, Brasa e a ponte do Vale ficam aqui.
- **Lago Espelho**: usa o lago congelado `POND`, em `(15.06, -15.06)`, raio 3,2. Aurora, Lia e Nina trabalham na margem.

As posições foram conferidas contra `OBSTACLES`, `LOTS`, `RESIDENTIAL_PLOTS`, `SITE_PROPS`, `lotColliders` e `plotColliders`: a folga mínima é 0,45 u para o avatar e 0,75 u para NPC. O teste `apps/client/src/scene/quest-v2/book-04.test.ts` repete a conferência.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Seu Raul (`seu-raul`), Fia (`fia`), Brasa (`brasa`), Aurora (`pond-keeper`), Seu Elias (`seu-elias`), Lia (`lia`) e Nina (`nina`).

- `storyteller`, `seu-elias`, `lia` e `nina` reusam as posições canônicas dos Livros I a III. O módulo filtra duplicatas com `EARLIER_IDS`, para que o Livro IV funcione sozinho e não duplique IDs quando os livros anteriores existem.
- Aurora reusa o id v1 `pond-keeper` e a posição v1 `(16.3, -10.4)`, como os outros NPCs de núcleo. O Livro IV não cria uma segunda Aurora em outro ponto.
- Brasa é uma `StoryNpc`; o runtime v2 ainda não tem NPC animal e desenha todo `StoryNpc` com o gerador `villager`. O cosmético `special-brasa` representa a brasa, e a limitação visual fica registrada para a revisão de arte.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-04/`:

| id | categoria | gerador | orçamento | tamanho | variantes |
|---|---|---|---:|---:|---|
| `frost-flower` | `quest_item` | `book-04-frost-flower` | 80/200 | 0,18 | pétala, centro, altura, inclinação, giro |
| `lake-lantern` | `world_prop` | `book-04-lake-lantern` | 180/480 | 0,22 | poste, moldura, telhado, neve |
| `bridge-plank` | `quest_item` | `book-04-bridge-plank` | 60/160 | 0,20 | tábuas, deslocamento, corda, giro |
| `ice-duck` | `world_prop` | `book-04-ice-duck` | 160/420 | 0,22 | cabeça, asa, bico, neve, giro |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

`lake-stone`, `straw` e `pumice` não têm gerador próprio: usam o gerador existente `ornament-crate`, cujo cesto já tem palha e serve de apoio para as pedras e os molhos. `lake-lantern` tem gerador próprio e passa a ter prioridade sobre o `REUSED` v1 de mesmo id.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-04/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `pants-snowboot` | `pants` | marco | não | `b04-m1-06` |
| `hand-left-lake-lantern` | `handLeft` | marco | não | `b04-m2-06` |
| `special-brasa` | `special` | missão | não | `b04-c3-04` |
| `dress-aurora` | `dress` | premium | sim | catálogo e prévia |
| `dress-ice` | `dress` | premium | sim | catálogo e prévia |
| `dress-star` | `dress` | premium | sim | catálogo e prévia |

O id pedido para o marco m2 era `hand-left-lantern`, mas esse id já existe no catálogo v1 como item pago. Para não repetir id em `COSMETICS_V2` e não quebrar o contrato de rede, o Livro IV usa `hand-left-lake-lantern` com o nome visível `Lanterna do Lago`. O item v1 permanece intocado. Nada é comprado: os três vestidos premium são catálogo e prévia.

Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces. As camadas de corpo usam âncoras de acordo com o avatar; a lanterna usa `target: "armLeft"`.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP; os três minijogos usam os eventos `sing-brasa-calm`, `sing-brasa-again` e `sing-lake-echo`, iguais aos ids das interações. O painel de jogos do slice 12 grava o evento da missão ativa. Enquanto o `Coro dos Nomes` não existir, esses três objetivos ficam provados no teste de máquina de estados, mas a passagem de navegador fica pendente do slice 12.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-04
pnpm --filter @vila/shared test -- book-04
pnpm --filter @vila/client test -- book-04
```

O validador deve imprimir `OK book: manifest=484 entries=11400 XP`. A galeria de props e o verificador de navegador usam os comandos do README da sessão.
