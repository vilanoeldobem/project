# Livro IX, As Fundações (PROPOSTA)

Fatia 09 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-09.ts` com as 45 entradas do Livro IX, os 8 NPCs de quest, os spawns, as interações, os obstáculos, os estados e os 6 cosméticos. A entrada é `b09-c1-01`; a saída é `b09-c3-04`, que abre o Livro X.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b09-c1-01` a `b09-c3-04`, de `b09-r1-01` a `b09-r2-08`, de `b09-s1` a `b09-s5` e de `b09-m1-01` a `b09-m2-06`. O XP narrativo é 930; os marcos somam 120.

## Regiões e cenário

- **Pedra Fundamental**: usa a avenida 2, entre os raios 42 e 70. Mestre Fundo fica em `(19.8, 50.2)` e Dona Pedra em `(22.1, 55.8)`. As ferramentas, marcas, paredes, alicerces, fundações e a promessa ficam no entorno, com desvio lateral máximo de 0,9 u.
- **Arquivo das Neves**: usa a avenida 3, entre os raios 42 e 70. Dona Clara fica em `(-21.5, 49.6)` e o Arquivista em `(-23.8, 55.1)`. As páginas, lápis, letras, estante, livro e a primeira palavra ficam no entorno.
- A praça recebe Dona Guida, Seu Nivaldo, Tia Bete e Dona Íris nas posições canônicas dos Livros II, III, VI e VII.

As posições foram conferidas contra `sceneColliders(new Set(), false, false)`. Os quatro NPCs do livro têm folga mínima de 2,47 u para o avatar e 2,17 u para NPC; os props e interações têm folga mínima de 0,67 u para o avatar e 0,37 u para NPC. Tudo fica fora do raio da árvore. O teste `apps/client/src/scene/quest-v2/book-09.test.ts` repete a conferência com folga de 0,45 u para o avatar e 0,75 u para NPC.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Seu Nivaldo (`postmaster`), Tia Bete (`tia-bete`), Dona Íris (`dona-iris`), Mestre Fundo (`mestre-fundo`), Dona Pedra (`dona-pedra`), Dona Clara (`dona-clara`) e o Arquivista (`arquivista`).

- Dona Guida, Seu Nivaldo, Tia Bete e Dona Íris reusam posições canônicas; o filtro `EARLIER_IDS` remove a duplicata quando os livros anteriores estiverem na `main`.
- Mestre Fundo, Dona Pedra, Dona Clara e o Arquivista são novos. Mestre Fundo e Dona Pedra cuidam da Pedra Fundamental; Dona Clara e o Arquivista guardam o Arquivo das Neves.
- Seu Nivaldo, Tia Bete e Dona Íris são ambientes: entram no mundo e não aparecem em missão.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-09/`:

| id | categoria | gerador | orçamento | tamanho | medido na galeria |
|---|---|---|---:|---:|---:|
| `old-tool` | `quest_item` | `book-09-old-tool` | 80/200 | 0,14 | 16/58 |
| `blank-page` | `quest_item` | `book-09-blank-page` | 80/200 | 0,14 | 27/78 |
| `stone-mark` | `quest_item` | `book-09-stone-mark` | 80/200 | 0,14 | 32/92 |
| `first-book` | `world_prop` | `book-09-first-book` | 220/600 | 0,24 | 79/170 |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio:

- `old-tool` para as ferramentas (`b09-c1-02`) e as vigas (`b09-r1-06`).
- `blank-page` para as páginas (`b09-c2-02`), os lápis (`b09-r2-02`), a primeira palavra (`b09-r2-06`), a primeira página (`b09-r2-08`) e o lápis do Arquivista (`b09-s2`).
- `stone-mark` para a primeira parede (`b09-c1-03`), a casa antiga (`b09-c1-04`), a fundação (`b09-c3-01`), o nome na pedra (`b09-c3-02`), as marcas (`b09-r1-02`), o alicerce (`b09-r1-03`), a casa sem porta (`b09-r1-04`), a primeira casa (`b09-r1-08`) e as pedras pequenas (`b09-s1`).
- `first-book` para o livro da origem (`b09-c2-04`), a letra do fundador (`b09-r2-03`), a estante (`b09-r2-05` e `b09-s3`).
- `story-page` (REUSED de `quest-items.ts`) para a primeira promessa (`b09-c3-03`) e a primeira palavra (`b09-s5`).

Objetos conceituais sem gerador próprio: `buried-stone`, `first-wall`, `foundation-named`, `authorless-book`, `old-handwriting`, `foundation`, `stone-name`, `first-house`, `small-stone`, `old-neighbor`, `doorless-house`, `old-beam`, `founder-hand`, `forgotten-shelf`, `first-word`, `old-pencil`, `sharp-pencil` e `neighbor-story`.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-09/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `hand-right-hammer` | `handRight` | marco | não | `b09-m1-06` |
| `face-origin-glasses` | `face` | marco | não | `b09-m2-06` |
| `shoes-archive` | `shoes` | missão | não | `b09-c3-04` |
| `hand-right-aurora` | `handRight` | premium | sim | catálogo e prévia |
| `hand-right-frost` | `handRight` | premium | sim | catálogo e prévia |
| `hand-right-origin-star` | `handRight` | premium | sim | catálogo e prévia |

O id `face-glasses` do prompt colide com o cosmético v1 `face-glasses` de `packages/shared/src/game/cosmetics.ts:133`. O id `hand-right-star` colide com `hand-right-star` de `cosmetics.ts:165`. Como `COSMETICS_V2` é o prefixo v1 mais os livros, um id duplicado quebraria a unicidade, o provador e a presença. O repositório vence o cânone: os ids usados são `face-origin-glasses` e `hand-right-origin-star`. A divergência fica registrada aqui e no PR.

Nada é comprado: as três peças de mão premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP. Os dois minijogos usam o evento `ponte-das-pegadas` e `fio-do-tempo` e ficam a cerca de 2,3 u do NPC para a ação do minijogo vencer a prioridade do NPC no `nearby`. Os labels são genéricos; o nome do NPC fica na descrição da missão. Enquanto a fatia 12 não implementar os jogos, os dois objetivos ficam provados no teste de máquina de estados e a passagem de navegador os pré-conclui.

## Estados de mundo

`STATES` exporta `["foundation-named", "archive-authored"]`. `b09-c1-04` e `b09-r1-08` ligam `foundation-named`; `b09-c2-04` e `b09-r2-08` ligam `archive-authored`.

A tabela da fatia cita `first-wall`, `foundation` e `first-house`. Nenhum desses estados existe em `WorldStateId`; nenhum estado foi inventado. As missões correspondentes ficam `worldState: null` e usam a interação do prop. A saída do livro é a própria conclusão de `b09-c3-04`, pré-requisito de `b10-c1-01` no manifesto.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-09
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
pnpm typecheck
pnpm --filter @vila/shared test
pnpm --filter @vila/client test
pnpm --filter @vila/api exec vitest run --exclude '**/accounts.test.ts'
pnpm build
```

O validador do livro e o do spine imprimem `OK ... manifest=484 entries=11400 XP`. O `typecheck` passa nos seis pacotes. A suíte compartilhada passa com 26 arquivos e 327 testes; a do cliente, com 62 arquivos e 1.014 testes; a da API, com 14 arquivos e 423 testes quando `accounts.test.ts` é excluído. O `build` passa nos seis pacotes. O `pnpm check` termina com a única falha conhecida em `apps/api/src/accounts.test.ts:278` (487 de 488 testes da API); o arquivo é proibido pelo cânone e fica para a integração.

O `validate-slice.mjs` do main descartava as colunas do CSV ao montar a lista de capítulos e por isso lia o pré-requisito como vazio. A fatia aplica a mesma correção de uma linha já usada pelos Livros IV a VIII: o objeto do capítulo passa a levar `...quest` e `xp: Number(quest.xp)`.

## Navegador e galeria

O verificador oficial ficou preso no `enter` porque a porta 8787 já estava ocupada por outra sessão e o cliente respondeu em 8802; a API do livro respondeu em 8791. A cópia temporária do verificador redirecionou `http://localhost:8787` para `http://127.0.0.1:8791`, trocou `window.__vila.extra.progress()` por `window.__vila.progress()`, semeou `b08-c3-04` no progresso local e pré-concluiu os dois minijogos. O cliente foi servido por `vite build --mode workers` (o `build` padrão aponta para a API de produção) e `vite preview` em `http://localhost:8802`.

- Resultado: `OK story book-09`; 31 missões jogadas pelo HUD e pelos painéis, 2 minijogos pré-concluídos, delta de 850 XP. Captura em `apps/client/verify-output/story-book-09.png`.
- Chegada a pé: Mestre Fundo em `(19.57, 48.98)`, 1,24 u do centro; Dona Pedra em `(21.66, 54.64)`, 1,24 u; Dona Clara em `(-21.13, 48.44)`, 1,22 u; o Arquivista em `(-23.40, 53.95)`, 1,22 u.
- Galeria: `props` com 228 chamadas, 46.910 triângulos e frame p50 35,3 ms, p95 106,8 ms; `cosmetics` com 36 chamadas, 3.612 triângulos e frame p50 19,0 ms, p95 20,3 ms. Capturas em `apps/client/verify-output/gallery-props.png` e `gallery-cosmetics.png`.

A categoria `cosmetics` da galeria exibe as camadas v1; as seis camadas do livro são cobertas pelo teste de orçamento, pelo snapshot e pelo provador. A galeria agrega todos os geradores da categoria, então o número de chamadas é o total do catálogo de props, não o custo de um frame da vila.

## Limites conhecidos

- Os dois minijogos `ponte-das-pegadas` e `fio-do-tempo` pertencem à fatia 12. O teste de máquina de estados prova as duas missões; o navegador as pré-conclui e joga as outras 31.
- O verificador oficial usa `window.__vila.extra.progress`, que não existe na `main` (o devtools expõe `window.__vila.progress`). A prova de navegador usa uma cópia temporária com o conserto, o seed de `b08-c3-04` e o redirecionamento da API local; a cópia é removida antes do commit.
- `apps/api/src/accounts.test.ts:278` compara `KNOWN_EVENTS` com o catálogo v1 e falha quando um livro entra; o arquivo é proibido pelo cânone e fica para a integração.
- A galeria mede o catálogo agregado de props, não o custo de um frame da vila. O teste de determinismo e o snapshot garantem que os quatro props do livro não variam entre execuções.

## Arquivos de teste compartilhados

Só as contagens de cosméticos, props e o validador mudam com o livro:

- `packages/shared/src/game/cosmetics-v2.test.ts` passou a conferir o prefixo v1 por slot em vez de exigir 10 itens por slot.
- `apps/client/src/ui/Wardrobe.test.tsx` calcula `freeCount` a partir de `COSMETICS_V2`.
- `apps/client/src/ui/Village.test.tsx` calcula `freeCards` do primeiro slot a partir de `COSMETICS_V2`.
- `apps/client/src/scene/gen/__snapshots__/gen.test.ts.snap` recebeu as quatro entradas novas de props.
- `content/proposals/quests-v2/validate-slice.mjs` recebeu a correção de uma linha do capítulo.

Nenhum arquivo compartilhado de produção foi editado. O `CHANGELOG.md` recebeu uma linha em `[Unreleased]`.
