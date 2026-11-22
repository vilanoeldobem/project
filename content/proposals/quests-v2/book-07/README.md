# Livro VII, A Ponte de Gelo (PROPOSTA)

Fatia 07 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-07.ts` com as 45 entradas do Livro VII, os 8 NPCs de quest, os spawns, as interações, os obstáculos, os estados e os 6 cosméticos. A entrada é `b07-c1-01`; a saída é `b07-c3-04`, que abre o Livro VIII.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b07-c1-01` a `b07-c3-04`, de `b07-r1-01` a `b07-r2-08`, de `b07-s1` a `b07-s5` e de `b07-m1-01` a `b07-m2-06`. O XP narrativo é 930; os marcos somam 120.

## Regiões e cenário

- **Ponte de Gelo**: usa a avenida 7, entre o raio 66 e o raio 91, com a ponte entre `(63, -24)` e `(70, -27,5)`. O Guardião fica na entrada; o sino, as cordas, as tábuas, a passagem e a pedra que canta ficam no entorno.
- **Vale dos Ecos**: usa o fim da avenida 7, perto de `(80, -33)`. Coral fica no fim da ponte; Eco fica no meio do vale; as conchas, a canção, a casa da avó e o eco de volta ficam no vale.

As posições foram conferidas contra `sceneColliders(new Set())`. O teste `apps/client/src/scene/quest-v2/book-07.test.ts` repete a conferência com folga de 0,45 u para o avatar e 0,75 u para NPC, e mantém tudo fora do raio de 5,0 u da árvore.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Seu Elias (`seu-elias`), Tia Bete (`tia-bete`), Dona Íris (`dona-iris`), Nina (`nina`), o Guardião (`guardian`), Coral (`coral`) e Eco (`eco`).

- Dona Guida, Seu Elias, Tia Bete, Dona Íris e Nina reusam posições canônicas dos Livros I a VI; o filtro `EARLIER_IDS` remove a duplicata quando os livros anteriores estiverem na `main`.
- O Guardião, Coral e Eco são novos. O Guardião não recebe nome próprio; o livro preserva o mistério de `b07-c1-03` e o estado `bridge-named`.
- Tia Bete, Dona Íris e Nina são ambientes: entram no mundo e não aparecem em missão. As outras cinco aparecem como ativadoras ou entregadoras.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-07/`:

| id | categoria | gerador | orçamento | tamanho |
|---|---|---|---:|---:|
| `ice-rope` | `quest_item` | `book-07-ice-rope` | 80/200 | 0,14 |
| `ice-plank` | `quest_item` | `book-07-ice-plank` | 80/200 | 0,16 |
| `echo-shell` | `quest_item` | `book-07-echo-shell` | 80/200 | 0,14 |
| `bridge-bell` | `world_prop` | `book-07-bridge-bell` | 220/600 | 0,24 |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio: a pedra que canta, a canção errada, o eco de volta e a voz da avó reutilizam `echo-shell`; as duas canções e a leitura reutilizam `story-page`; a passagem e a ponte cantada reutilizam `ice-plank`.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-07/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `pants-bridge` | `pants` | marco | não | `b07-m1-06` |
| `helmet-coral` | `helmet` | marco | não | `b07-m2-06` |
| `shoes-bridge` | `shoes` | missão | não | `b07-c3-04` |
| `face-aurora` | `face` | premium | sim | catálogo e prévia |
| `face-bridge-frost` | `face` | premium | sim | catálogo e prévia |
| `face-starlight` | `face` | premium | sim | catálogo e prévia |

O id `face-frost` do prompt colide com o cosmético v1 `face-frost` de `packages/shared/src/game/cosmetics.ts`. Como `COSMETICS_V2` é o prefixo v1 mais os livros, um id duplicado quebraria a unicidade, o provador e a presença. O repositório vence o cânone: o sexto cosmético usa `face-bridge-frost` e a divergência fica registrada aqui e no PR.

Nada é comprado: as três faces premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP. Os três minijogos usam o evento `coro-dos-nomes` e ficam a cerca de 2 u do NPC para a ação do minijogo vencer a prioridade do NPC no `nearby`. Os três labels são iguais e genéricos porque o HUD resolve o label pelo primeiro id global; o nome do NPC fica na descrição da missão. Enquanto a fatia 12 não implementar o jogo, os três objetivos ficam provados no teste de máquina de estados e a passagem de navegador os pré-conclui.

## Estados de mundo

`STATES` exporta `["bridge-named", "echo-whole"]`. `b07-c1-04` e `b07-r1-08` ligam `bridge-named`; `b07-c2-04` e `b07-r2-07` ligam `echo-whole`.

A tabela da fatia cita `ice-road` na saída `b07-c3-04`, mas `ice-road` não existe em `WorldStateId`. Nenhum estado foi inventado: `b07-c3-04` usa `worldState: null`, e a saída do livro é a própria conclusão de `b07-c3-04`, que é o pré-requisito de `b08-c1-01` no manifesto.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-07
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
pnpm --filter @vila/shared test -- book-07
pnpm --filter @vila/client test -- book-07
```

O validador deve imprimir `OK book: manifest=484 entries=11400 XP`.

O `validate-slice.mjs` do main descartava as colunas do CSV ao montar a lista de capítulos e por isso lia o pré-requisito como vazio. A fatia aplica a mesma correção de uma linha já usada nos Livros IV, V e VI: o objeto do capítulo passa a levar `...quest` e `xp: Number(quest.xp)`.

## Resultados desta fatia

- `node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-07`: `OK book: manifest=484 entries=11400 XP`.
- `node content/proposals/quests-v2/validate-slice.mjs --kind=spine`: `OK spine: manifest=484 entries=11400 XP`.
- `pnpm typecheck`: passa nos seis pacotes.
- `pnpm --filter @vila/shared test`: 26 arquivos, 327 testes passam.
- `pnpm --filter @vila/client test`: 62 arquivos, 1.014 testes passam.
- `pnpm --filter @vila/api exec vitest run --exclude '**/accounts.test.ts'`: 14 arquivos, 423 testes passam.
- `pnpm build`: passa nos seis pacotes.
- `pnpm check`: 487 de 488 testes passam; a única falha é `apps/api/src/accounts.test.ts:278`, que compara `KNOWN_EVENTS` com o catálogo v1. O arquivo é proibido pelo cânone e fica para a integração.
- Navegador real: 30 missões não-minijogo concluídas pelo HUD e pelos painéis, 3 minijogos pré-concluídos e `OK story book-07`; XP total 930, delta 830. A captura fica em `apps/client/verify-output/story-book-07.png`.
- Galeria: `props` com 236 chamadas e 51.010 triângulos; `cosmetics` com 36 chamadas e 3.612 triângulos; capturas em `apps/client/verify-output/gallery-props.png` e `gallery-cosmetics.png`. A galeria agrega todos os geradores da categoria, então o número de chamadas é o total do catálogo de props, não o custo de um frame da vila. A categoria `cosmetics` da galeria exibe as camadas v1; as seis camadas do livro são cobertas pelos testes de orçamento, snapshot e pelo provador. O script saiu 1 apenas pelos erros de CSP do Google Analytics já presentes na página; as duas capturas e as medições foram geradas.

A verificação de navegador usou as portas 8789 (API) e 8800 (cliente Worker) porque 8787 e 8799 estavam ocupadas por outras sessões. O cliente foi construído com os endpoints locais padrão e o verificador temporário interceptou `localhost:8787` para `localhost:8789`; a cópia temporária foi removida antes do commit.

## Limites conhecidos

- Os três minijogos `coro-dos-nomes` pertencem à fatia 12. O teste de máquina de estados prova as três missões; o navegador as deixa pré-concluídas e joga as outras 30.
- O verificador oficial tem o defeito de `extra.progress`; a prova de navegador usa uma cópia temporária com o conserto e o preseed de `b06-c3-04`, removida antes do commit.
- `apps/api/src/accounts.test.ts` compara `KNOWN_EVENTS` com o catálogo v1 e falha quando um livro entra; o arquivo é proibido pelo cânone e fica para a integração.
- As três interações de minijogo compartilham o id global `coro-dos-nomes`; a unicidade testada é `${questId}:${id}`. A fatia 12 deve gravar o evento pela missão ativa, não pela primeira interação global.

## Arquivos de teste compartilhados

Só as contagens de cosméticos e props mudam com qualquer livro:

- `packages/shared/src/game/quests-v2/world.test.ts` passou a conferir a unicidade de `${questId}:${id}` nas interações, porque os três minijogos compartilham o id global `coro-dos-nomes`.
- `packages/shared/src/game/cosmetics-v2.test.ts` passou a conferir o prefixo v1 por slot em vez de exigir 10 itens por slot.
- `apps/client/src/ui/Wardrobe.test.tsx` calcula `freeCount`, `helmetFree` e `handLeftFree` a partir de `COSMETICS_V2`.
- `apps/client/src/ui/Village.test.tsx` calcula `freeCards` do primeiro slot a partir de `COSMETICS_V2`.
- `apps/client/src/scene/gen/__snapshots__/gen.test.ts.snap` recebeu as quatro entradas novas de props.

Nenhum arquivo compartilhado de produção foi editado. O `CHANGELOG.md` recebeu uma linha em `[Unreleased]`.
