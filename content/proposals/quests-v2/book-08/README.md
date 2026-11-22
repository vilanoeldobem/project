# Livro VIII, O Verão da Vila (PROPOSTA)

Fatia 08 da saga das Longas Noites. Preenche o módulo `packages/shared/src/game/quests-v2/books/book-08.ts` com as 45 entradas do Livro VIII, os 8 NPCs de quest, os spawns, as interações, os obstáculos, os estados e os 6 cosméticos. A entrada é `b08-c1-01`; a saída é `b08-c3-04`, que abre o Livro IX.

## Contagens

| Bloco | Entradas | XP |
|---|---:|---:|
| Principais | 12 | 375 |
| Regionais | 16 | 480 |
| Secundárias | 5 | 75 |
| Marcos | 12 | 120 |
| **Total** | **45** | **1.050** |

Os 45 IDs vão de `b08-c1-01` a `b08-c3-04`, de `b08-r1-01` a `b08-r2-08`, de `b08-s1` a `b08-s5` e de `b08-m1-01` a `b08-m2-06`. O XP narrativo é 930; os marcos somam 120.

## Regiões e cenário

- **Jardim do Sol**: usa o corredor da avenida 1 (22,5°), entre o raio 60 e o raio 77. Dona Hélia fica na redoma, em `(66, 26)`; Bento fica no canteiro, em `(70, 29)`. As sementes, flores de vidro, aquecedor, sol de dentro, degelo, canal, promessa, sombra, abelha e guarda-sol ficam no entorno, com desvio lateral máximo de 1,1 u.
- **Mercado das Estações**: usa o mesmo corredor, entre o raio 40 e o raio 58. Seu Tempo fica no relógio, em `(47, 19)`; Dona Estação fica na banca, em `(52, 21)`. As mercadorias, aromas, balança, calendário, receitas, banca e sorvete ficam no entorno.
- A praça recebe Dona Guida, Dona Filó, Dona Cida e Pip nas posições canônicas dos Livros I a III. A visita da receita (`b08-r2-05`) tem uma página perto de Dona Guida, em `(7, 5)`, e outra perto de Seu Tempo, em `(47,7, 20,7)`.

As posições foram conferidas contra `sceneColliders(new Set())`. O teste `apps/client/src/scene/quest-v2/book-08.test.ts` repete a conferência com folga de 0,45 u para o avatar e 0,75 u para NPC, e mantém tudo fora do raio de 5,0 u da árvore. O navegador confirma a chegada a pé a Dona Hélia e a Seu Tempo.

## NPCs

Os oito NPCs lógicos são Dona Guida (`storyteller`), Dona Filó (`market-keeper`), Dona Cida (`dona-cida`), Pip (`pip`), Dona Hélia (`dona-helia`), Bento (`bento`), Seu Tempo (`seu-tempo`) e Dona Estação (`dona-estacao`).

- Dona Guida, Dona Filó, Dona Cida e Pip reusam posições canônicas dos Livros I a III; o filtro `EARLIER_IDS` remove a duplicata quando os livros anteriores estiverem na `main`.
- Dona Hélia, Bento, Seu Tempo e Dona Estação são novos. Dona Hélia e Bento cuidam do Jardim do Sol; Seu Tempo e Dona Estação guardam o calendário e a banca da primavera.
- Dona Filó, Dona Cida e Pip são ambientes: entram no mundo e não aparecem em missão. As outras cinco aparecem como ativadoras ou entregadoras.

## Props

Os quatro props novos ficam em `apps/client/src/scene/gen/quest-v2/book-08/`:

| id | categoria | gerador | orçamento | tamanho |
|---|---|---|---:|---:|
| `sun-seed` | `quest_item` | `book-08-sun-seed` | 80/200 | 0,14 |
| `glass-flower` | `quest_item` | `book-08-glass-flower` | 80/200 | 0,14 |
| `season-spice` | `quest_item` | `book-08-season-spice` | 80/200 | 0,14 |
| `summer-flower` | `world_prop` | `book-08-summer-flower` | 220/600 | 0,24 |

Cada gerador é determinístico por seed, usa só `PALETTE`/`V`, base em `y = 0`, coordenadas inteiras e pelo menos seis variantes em doze sementes. O teste do gerador cobre orçamento, determinismo, variantes e o snapshot de oito seeds da galeria.

Objetos derivados não têm gerador próprio:

- `story-page` (REUSED de `quest-items.ts`) para o calendário (`b08-c2-04`), a promessa (`b08-c3-03`) e as duas receitas (`b08-r2-05`).
- `sun-seed` para o aquecedor (`b08-c1-03`), o sol de dentro (`b08-r1-03`) e a semente de inverno (`b08-s5`).
- `glass-flower` para as flores de vidro (`b08-r1-02`) e o degelo (`b08-c3-01`).
- `season-spice` para as mercadorias (`b08-c2-03`), os aromas (`b08-r2-02`), a balança (`b08-r2-03`), a banca (`b08-r2-06`), a colheita (`b08-r2-08`) e o sorvete (`b08-s2`).
- `summer-flower` para a flor (`b08-c1-04`), o canal (`b08-c3-02`), a sombra (`b08-r1-04`), a abelha (`b08-r1-06` e `b08-s3`), a primeira flor (`b08-r1-08`) e o guarda-sol (`b08-s1`).

Objetos conceituais sem gerador próprio: `cold-dome`, `cracked-dome`, `first-warmth`, `empty-spring`, `four-seasons`, `thaw`, `summer-promise`, `broken-parasol`, `good-shade`, `stubborn-bee`, `patient-customer`, `monthly-recipes`, `spring-return`, `spring-goods`, `parasol`, `ice-cream` e `winter-seed`.

## Cosméticos

Os seis cosméticos ficam em `apps/client/src/scene/gen/cosmetics/book-08/`:

| id | slot | origem | premium | recompensa |
|---|---|---|---|---|
| `dress-summer` | `dress` | marco | não | `b08-m1-06` |
| `special-apron` | `special` | marco | não | `b08-m2-06` |
| `face-paint` | `face` | missão | não | `b08-c3-04` |
| `hand-left-aurora` | `handLeft` | premium | sim | catálogo e prévia |
| `hand-left-frost` | `handLeft` | premium | sim | catálogo e prévia |
| `hand-left-summer-star` | `handLeft` | premium | sim | catálogo e prévia |

O id `hand-left-star` do prompt colide com o cosmético v1 `hand-left-star` de `packages/shared/src/game/cosmetics.ts`. Como `COSMETICS_V2` é o prefixo v1 mais os livros, um id duplicado quebraria a unicidade, o provador e a presença. O repositório vence o cânone: o sexto cosmético usa `hand-left-summer-star` e a divergência fica registrada aqui e no PR.

Nada é comprado: as três peças de mão premium são catálogo e prévia, sem preço, moeda ou equipar. Cada camada usa `dedupe`, `size: 0.3`, no máximo 40 voxels e 140 faces.

## Diálogo e acessibilidade

As 33 falas de oferta e as 33 de entrega estão em `dialogues.csv`, com duas ou três frases curtas em pt-BR. Toda oferta diz o verbo e o lugar do objetivo. Nenhum texto usa travessão, marca, ONG, doação, preço, moeda, loot ou sorte.

Cada missão tem tipo de objetivo, unidade e XP conferidos pelo validador. As cinco secundárias pagam 15 XP. Os dois minijogos usam o evento `jardim-das-estacoes` e ficam a cerca de 2 u do NPC para a ação do minijogo vencer a prioridade do NPC no `nearby`. Os dois labels são iguais e genéricos; o nome do NPC fica na descrição da missão. Enquanto a fatia 12 não implementar o jogo, os dois objetivos ficam provados no teste de máquina de estados e a passagem de navegador os pré-conclui.

## Estados de mundo

`STATES` exporta `["summer-bloom", "seasons-complete"]`. `b08-c1-04` e `b08-r1-08` ligam `summer-bloom`; `b08-c2-04` e `b08-r2-08` ligam `seasons-complete`.

A tabela da fatia cita `first-warmth` na entrada `b08-c1-03` e `summer-promise` na saída `b08-c3-04`. Nenhum dos dois existe em `WorldStateId`; nenhum estado foi inventado. `b08-c1-03` fica `worldState: null` e usa a interação `sun-seed`; `b08-c3-04` fica `worldState: null`, e a saída do livro é a própria conclusão, pré-requisito de `b09-c1-01` no manifesto.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-08
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
pnpm typecheck
pnpm --filter @vila/shared test
pnpm --filter @vila/client test
pnpm --filter @vila/api exec vitest run --exclude '**/accounts.test.ts'
pnpm build
```

O validador do livro e o do spine imprimem `OK ... manifest=484 entries=11400 XP`. O `typecheck` passa nos seis pacotes. A suíte compartilhada passa com 26 arquivos e 327 testes; a do cliente, com 62 arquivos e 1.014 testes; a da API, com 14 arquivos e 423 testes quando `accounts.test.ts` é excluído. O `build` passa nos seis pacotes. O `pnpm check` termina com a única falha conhecida em `apps/api/src/accounts.test.ts:278` (487 de 488 testes da API); o arquivo é proibido pelo cânone e fica para a integração.

O `validate-slice.mjs` do main descartava as colunas do CSV ao montar a lista de capítulos e por isso lia o pré-requisito como vazio. A fatia aplica a mesma correção de uma linha já usada pelos Livros IV a VII: o objeto do capítulo passa a levar `...quest` e `xp: Number(quest.xp)`.

## Navegador e galeria

O verificador oficial ficou preso no `enter` porque a porta 8787 já estava ocupada por outra sessão e a API do livro respondeu em 8791. A cópia temporária do verificador redirecionou `http://localhost:8787` para `http://127.0.0.1:8791`, trocou `window.__vila.extra.progress()` por `window.__vila.progress()`, semeou `b07-c3-04` no progresso local e pré-concluiu os dois minijogos. O cliente foi servido pelo build de produção em `http://localhost:8802`.

- Resultado: `OK story book-08`; 31 missões jogadas pelo HUD e pelos painéis, 2 minijogos pré-concluídos, delta de 850 XP. Captura em `apps/client/verify-output/story-book-08.png`.
- Chegada a pé: Dona Hélia em `(64,71, 25,98)`, 1,29 u do centro; Seu Tempo em `(48,08, 19,57)`, 1,22 u do centro.
- Galeria: `props` com 236 chamadas e 46.906 triângulos; `cosmetics` com 36 chamadas e 3.612 triângulos. Capturas em `apps/client/verify-output/gallery-props.png` e `gallery-cosmetics.png`.

A categoria `cosmetics` da galeria exibe as camadas v1; as seis camadas do livro são cobertas pelo teste de orçamento, pelo snapshot e pelo provador. A galeria agrega todos os geradores da categoria, então o número de chamadas é o total do catálogo de props, não o custo de um frame da vila.

## Limites conhecidos

- Os dois minijogos `jardim-das-estacoes` pertencem à fatia 12. O teste de máquina de estados prova as duas missões; o navegador as pré-conclui e joga as outras 31.
- O verificador oficial usa `window.__vila.extra.progress`, que não existe na `main` (o devtools expõe `window.__vila.progress`). A prova de navegador usa uma cópia temporária com o conserto, o seed de `b07-c3-04` e o redirecionamento da API local; a cópia é removida antes do commit.
- `apps/api/src/accounts.test.ts:278` compara `KNOWN_EVENTS` com o catálogo v1 e falha quando um livro entra; o arquivo é proibido pelo cânone e fica para a integração.

## Arquivos de teste compartilhados

Só as contagens de cosméticos, props e o validador mudam com o livro:

- `packages/shared/src/game/cosmetics-v2.test.ts` passou a conferir o prefixo v1 por slot em vez de exigir 10 itens por slot.
- `apps/client/src/ui/Wardrobe.test.tsx` calcula `freeCount` a partir de `COSMETICS_V2`.
- `apps/client/src/ui/Village.test.tsx` calcula `freeCards` do primeiro slot a partir de `COSMETICS_V2`.
- `apps/client/src/scene/gen/__snapshots__/gen.test.ts.snap` recebeu as quatro entradas novas de props.
- `content/proposals/quests-v2/validate-slice.mjs` recebeu a correção de uma linha do capítulo.

Nenhum arquivo compartilhado de produção foi editado. O `CHANGELOG.md` recebeu uma linha em `[Unreleased]`.
