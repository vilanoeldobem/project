# Livro X, A Próxima Noite (PROPOSTA)

Fatia 10 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-10.ts` com as 45 entradas do Livro X, os 8 NPCs de quest, os spawns, as interações, os obstáculos, os estados e os 6 cosméticos. A entrada é `b10-c1-01`; a saída é `b10-c3-04`, que abre o pós-jogo.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b10-c1-01` a `b10-c3-04`, de `b10-r1-01` a `b10-r2-08`, de `b10-s1` a `b10-s5` e de `b10-m1-01` a `b10-m2-06`. O XP narrativo é 930; os marcos somam 120.

## Regiões e cenário

- **Torre do Tempo**: usa o parque `park-01` (anel 2, lado 6), no sul. O coreto fica em `(-15.75, -59)`. As horas, engrenagens, ampulhetas e a torre usam os pontos livres `A=(-4.5,-59.5)`, `B=(-8.0,-58.0)` e `C=(-9.5,-62.5)`.
- **Praça da Nova Noite**: usa o parque `park-03` (anel 4, lado 4), no oeste. O coreto fica em `(-86.5, -9)`. Os cadernos, velas, a lição e a vigília usam `V1=(-86.5,-13.0)`, `V2=(-86.5,-20.5)` e `V3=(-86.5,-27.5)`.
- A Vigia fica na rua do parque sul, em `(-15.75,-53.4)`; as crianças ficam na rua do parque oeste, em `(-81.5,-16.5)`. Os seis NPCs compartilhados mantêm as posições canônicas dos Livros I a IX.

As posições foram conferidas contra `sceneColliders(new Set(), false, false)`: NPCs com folga de 0,75 u, spawns e interações com folga de 0,45 u. O teste `apps/client/src/scene/quest-v2/book-10.test.ts` repete a conferência e planeja rotas reais do spawn até os dois parques.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Nina (`nina`), Lia (`lia`), Tomás (`tomas`), Horácio (`horacio`), Papai Noel (`papai-noel`), a Vigia (`vigia`) e as crianças (`criancas`).

- Dona Guida, Nina, Lia, Tomás, Horácio e Papai Noel reusam posições canônicas; o filtro `EARLIER_IDS` remove a duplicata quando os Livros I a IX estiverem na `main`.
- A Vigia e as crianças são novas; ficam nas ruas dos dois parques.
- Horácio mantém o posto canônico no leste; a Torre do Tempo é o coreto do parque sul, onde ficam os props e as horas.
- Papai Noel mantém a posição canônica perto do trenó.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-10/`:

| id | categoria | gerador | orçamento | tamanho | medido (12 sementes) |
|---|---|---|---:|---:|---:|
| `lost-hour` | `quest_item` | `book-10-lost-hour` | 80/200 | 0,18 | 68/148 |
| `time-gear` | `quest_item` | `book-10-time-gear` | 80/200 | 0,18 | 70/196 |
| `short-candle` | `quest_item` | `book-10-short-candle` | 80/200 | 0,16 | 26/88 |
| `small-notebook` | `quest_item` | `book-10-small-notebook` | 80/200 | 0,18 | 66/130 |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio:

- `time-sand` usa o modelo de `lost-hour`; representa a areia do tempo e as ampulhetas pequenas.
- `blank-page` usa o gerador v1 `story-page` (`REUSED` em `quest-v2/catalog.ts`); representa as páginas em branco.
- `lost-hour` representa as horas, a ampulheta, o relógio de areia e a hora certa.
- `time-gear` representa as engrenagens, a Torre do Tempo e o fio do tempo.
- `short-candle` representa as velas, a vigília e a hora do lanche.
- `small-notebook` representa os cadernos, a lição, a canção e a promessa.

Objetos conceituais sem gerador próprio: `stopped-clock`, `right-hour`, `last-hour`, `old-promise`, `two-lights`, `next-long-night`, `first-vigil`, `snack-time`, `sand-clock`, `new-generation`, `first-lesson`, `quiet-child`, `vigil-start`, `new-song` e `first-night`. Ficam como campos narrativos e não inventam estado.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-10/`:

| id | slot | origem | premium | recompensa | medido |
|---|---|---|---|---:|---:|
| `hand-right-watch` | `handRight` | marco | não | `b10-m1-06` | 6/26 |
| `hand-right-candle` | `handRight` | marco | não | `b10-m2-06` | 6/26 |
| `dress-vigil` | `dress` | missão | não | `b10-c2-04` | 35/102 |
| `special-star-guide` | `special` | premium | sim | catálogo e prévia | 7/30 |
| `special-dawn` | `special` | premium | sim | catálogo e prévia | 8/48 |
| `special-vigil-aurora` | `special` | premium | sim | catálogo e prévia | 8/48 |

O id `special-aurora` do prompt colide com o cosmético v1 `special-aurora` de `packages/shared/src/game/cosmetics.ts`. Como `COSMETICS_V2` é o prefixo v1 mais os livros, um id duplicado quebraria a unicidade, o provador e a presença. O repositório vence o cânone: o id usado é `special-vigil-aurora`; a divergência fica registrada aqui e no PR. Nada é comprado: as três peças premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP. As falas de conversa, prop, visita, leitura, entrega e minijogo seguem o contrato de acessibilidade do cânone: objetivo em uma frase com verbo e lugar, sem cronômetro, sem cor como único sinal, com diário, resumo, dica de próximo passo, pausa e pular minijogo depois de três tentativas.

## Minijogos

As três missões de minijogo usam eventos próprios da missão: `b10-c2-04-coro` (Coro dos Nomes), `b10-r2-07-coro` (Coro dos Nomes) e `b10-r1-07-fio` (Fio do Tempo). Os ids das interações são os mesmos eventos, o que mantém a unicidade do mundo. O painel de jogos da fatia 12 grava o evento da missão ativa; os ids `coro-dos-nomes` e `fio-do-tempo` continuam no catálogo de minijogos. Enquanto a fatia 12 não implementar os jogos, as três missões ficam provadas no teste de máquina de estados e a passagem de navegador as pré-conclui.

## Estados de mundo

`STATES` exporta `["last-hour", "new-vigil"]`. `b10-c1-04` e `b10-r1-08` ligam `last-hour`; `b10-c2-04` e `b10-r2-08` ligam `new-vigil`.

A tabela da fatia cita `next-long-night`. Esse estado não existe em `WorldStateId`; nenhum estado foi inventado. `b10-c3-04` fica `worldState: null` e a conclusão do livro é o próprio pré-requisito do pós-jogo.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-10
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
pnpm typecheck
pnpm --filter @vila/shared test
pnpm --filter @vila/client test
pnpm --filter @vila/api exec vitest run --exclude '**/accounts.test.ts'
pnpm build
pnpm check
```

O validador do livro e o do spine imprimem `OK book: manifest=484 entries=11400 XP` e `OK spine: manifest=484 entries=11400 XP`. O `typecheck` passa nos seis pacotes. A suíte compartilhada passa com 26 arquivos e 331 testes; a do cliente, com 62 arquivos e 1.016 testes; a da API, excluindo `accounts.test.ts`, com 14 arquivos e 423 testes. O `build` passa nos seis pacotes. O `pnpm check` termina com a única falha conhecida em `apps/api/src/accounts.test.ts:278` (1 falha de 488 testes da API; o teste compara `KNOWN_EVENTS` com o catálogo v1); o arquivo é proibido pelo cânone e fica para a integração.

O `validate-slice.mjs` do main descartava as colunas do CSV ao montar a lista de capítulos e por isso lia o pré-requisito como vazio. A fatia aplica a mesma correção de uma linha já usada pelos Livros IV a IX: o objeto do capítulo passa a levar `...quest` e `xp: Number(quest.xp)`.

## Navegador e galeria

O verificador oficial do main usa `window.__vila.extra.progress`, que não existe; o devtools expõe `window.__vila.progress`. A fatia usa uma cópia temporária do verificador com o conserto, semeia `b09-c3-04` no progresso local e pré-conclui os três eventos de minijogo.

- Resultado: `OK story book-10`; 45 entradas no catálogo, 33 narrativas, 30 missões jogadas pelo HUD e 3 minijogos entregues a partir dos eventos semeados, delta de 930 XP. Captura em `apps/client/verify-output/story-book-10.png`.
- Chegada a pé: a Vigia em `(-17.54,-53.37)`, 0,03 u do ponto; as crianças em `(-79.68,-16.52)`, 0,03 u; o ponto A do parque sul em `(-4.53,-59.47)`, 0,04 u. Captura em `apps/client/verify-output/arrival-book-10.png`.
- Galeria: `props` com 220 chamadas, 48.142 triângulos e frame p50 33,7 ms, p95 69,3 ms; `cosmetics` com 36 chamadas, 3.612 triângulos e frame p50 19,2 ms, p95 20,6 ms. Na tabela de 8 seeds, `Hora perdida` 68/148, `Engrenagem do tempo` 70/186, `Vela curta` 24/84 e `Caderno pequeno` 42/86. Capturas em `apps/client/verify-output/gallery-props.png` e `gallery-cosmetics.png`.
- A categoria `cosmetics` da galeria exibe as camadas v1; as seis camadas do livro são cobertas pelo teste de orçamento, pelo snapshot e pelo provador.

## Limites conhecidos

- Os três minijogos pertencem à fatia 12. O teste de máquina de estados prova as três missões; o navegador as pré-conclui e joga as outras 30.
- O verificador oficial usa `window.__vila.extra.progress`, que não existe na `main`; a prova de navegador usa uma cópia temporária com o conserto e o seed do pré-requisito. A cópia é removida antes do commit.
- `apps/api/src/accounts.test.ts:278` compara `KNOWN_EVENTS` com o catálogo v1 e falha quando um livro entra; o arquivo é proibido pelo cânone e fica para a integração.
- A galeria mede o catálogo agregado de props, não o custo de um frame da vila. O teste de determinismo e o snapshot garantem que os quatro props do livro não variam entre execuções.

## Arquivos de teste compartilhados

Só as contagens de cosméticos e o snapshot global de geradores mudam com o livro:

- `packages/shared/src/game/cosmetics-v2.test.ts`: a checagem por slot passou a comparar o prefixo v1, como nos Livros I a IX.
- `apps/client/src/ui/Wardrobe.test.tsx`: o total de visuais gratuitos passou a ser calculado do catálogo, em vez de fixo em 80.
- `apps/client/src/scene/gen/__snapshots__/gen.test.ts.snap`: recebeu os quatro props novos.
- Nenhum arquivo da lista de proibições do cânone foi editado.
