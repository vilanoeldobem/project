# Livro V, A Longa Noite (PROPOSTA)

Fatia 05 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-05.ts` com as 45 entradas do Livro V, os 8 NPCs de quest, os spawns, as interações e os obstáculos. A entrada é `b05-c1-01`; a saída é `b05-c3-04`, que abre o epílogo.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b05-c1-01` a `b05-c3-04`, de `b05-r1-01` a `b05-r2-08`, de `b05-s1` a `b05-s5` e de `b05-m1-01` a `b05-m2-06`.

## Regiões e cenário

- **Estação do Trenó**: usa o prédio cívico `civic-09` (`sleigh-station`), com centro em `(60.8, -41.7)`. Dona Vilma, Joca, Seu Ademar e Papai Noel ficam na plataforma e no entorno.
- **Casa do Fio e Vale do Vento Branco**: usa o parque `park-02`, com centro em `(-56.6, 46)`. As flores de gelo, as navetas e o tear ficam no parque; Dona Íris, Tomás e Mestre Anselmo mantêm as posições canônicas da praça, porque o Livro V não move NPCs de livros anteriores.

As posições foram conferidas contra `sceneColliders(new Set())`: a folga mínima é 0,45 u para o avatar, 0,75 u para NPC e o raio de 5,0 u em volta da árvore. O teste `apps/client/src/scene/quest-v2/book-05.test.ts` repete a conferência.

## NPCs

Os treze NPCs lógicos são Dona Guida (`storyteller`), Seu Nivaldo (`postmaster`), Aurora (`pond-keeper`), Lia (`lia`), Seu Elias (`seu-elias`), Dona Vilma (`dona-vilma`), Joca (`joca`), Seu Ademar (`seu-ademar`), Dona Íris (`dona-iris`), Tomás (`tomas`), Dona Geada (`dona-geada`), Mestre Anselmo (`mestre-anselmo`) e Papai Noel (`papai-noel`).

- `storyteller`, `postmaster`, `pond-keeper`, `lia` e `seu-elias` reusam as posições canônicas dos Livros I a IV.
- `dona-iris`, `tomas` e `mestre-anselmo` também reusam posições canônicas; o módulo os re-declara para a fatia funcionar sozinha e o filtro `EARLIER_IDS` remove a duplicata quando os livros anteriores estão presentes.
- `dona-vilma`, `joca`, `seu-ademar` e `papai-noel` são novos, na Estação do Trenó.
- `dona-geada` é nova, na praça, onde espera o nome de Alba.
- Papai Noel é uma `StoryNpc` comum; o runtime v2 ainda desenha todo `StoryNpc` com o gerador `villager` e não tem traje especial. O `santa` de `life.ts` continua separado, perto do trenó da praça.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-05/`:

| id | categoria | gerador | orçamento | tamanho | variantes |
|---|---|---|---:|---:|---|
| `suitcase` | `world_prop` | `book-05-suitcase` | 220/600 | 0,20 | largura, altura, cor, correias, neve, giro |
| `silver-shuttle` | `quest_item` | `book-05-silver-shuttle` | 80/200 | 0,16 | comprimento, banda, cor do fio, carretel, giro |
| `ice-flower` | `quest_item` | `book-05-ice-flower` | 80/200 | 0,18 | pétala, coração, altura, folha, neve, giro |
| `star-map` | `world_prop` | `book-05-star-map` | 220/600 | 0,22 | poste, painel, moldura, estrelas, neve, giro |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio: `story-page` representa bilhete, carta, nome e página; `lake-lantern` representa a lanterna do trenó; `suitcase` representa a mala e o passageiro; `silver-shuttle` representa a naveta, o fio e o tear; `ice-flower` representa a flor e o vidro; `star-map` representa o quadro de horários e o mapa da partida.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-05/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `back-travel` | `back` | marco | não | `b05-m1-06` |
| `back-thread` | `back` | marco | não | `b05-m2-06` |
| `special-promise-book` | `special` | missão | não | `b05-c3-04` |
| `shoes-aurora` | `shoes` | premium | sim | catálogo e prévia |
| `shoes-frost` | `shoes` | premium | sim | catálogo e prévia |
| `shoes-dawn` | `shoes` | premium | sim | catálogo e prévia |

Nada é comprado: as três botas premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP; os dois minijogos usam os eventos `play-treno-na-neve` e `play-fio-do-tempo`, iguais aos ids das interações. O painel de jogos do slice 12 grava o evento da missão ativa. Enquanto o `Trenó na Neve` e o `Fio do Tempo` não existirem, esses dois objetivos ficam provados no teste de máquina de estados, mas a passagem de navegador fica pendente do slice 12.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-05
pnpm --filter @vila/shared test -- book-05
pnpm --filter @vila/client test -- book-05
```

O validador deve imprimir `OK book: manifest=484 entries=11400 XP`.

O `validate-slice.mjs` do main somava `quest.xp` como string; a fatia aplica a correção de uma linha já usada no Livro IV (`xp: Number(quest.xp)`) para o gate de capítulo funcionar. O `pnpm check` continua falhando apenas em `apps/api/src/accounts.test.ts:278`, porque o teste da API compara `KNOWN_EVENTS` com o catálogo v1; esse arquivo está na lista proibida e não é editado por esta fatia.
