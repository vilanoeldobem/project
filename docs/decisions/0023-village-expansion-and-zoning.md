# IMPL-0023: Expansão da Vila e zoneamento (praça, terrenos de ONG, três faixas residenciais, lojas e placas)

**Status:** Proposta — fase 1 implementada (layout, dados, cena, interação). A posse de terrenos residenciais fica
**desligada em produção e homologação** (`RESIDENTIAL_PLOTS_ENABLED = "false"`; política PENDENTE,
[OQ-17](open-questions.md)). Lojas e placas são marcadores honestos: nada é vendido, reservado ou alugado. O plano
final de terrenos continua **PENDENTE** (PEN-017/PEN-023, [OQ-19](open-questions.md))
**Data:** 2026-11-13
**Fontes:** decisões do responsável técnico em 2026-11-12 (modelo de layout, dois tipos de terreno, economia por
desbloqueio, lojas e placas como marcadores, sem veículos, fases seguintes);
[registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md):
DEC-028 (terrenos são de ONGs), DEC-042 (missões dão só XP), PEN-008 (patrocínio), PEN-017/PEN-023 (plano de
terrenos); [IMPL-0002](0002-donations-disabled-until-partner-contract.md) (sem fluxo de dinheiro),
[IMPL-0010](0010-seeded-procedural-voxel-content.md) (conteúdo por semente),
[IMPL-0016](0016-click-navigation-and-colliders.md) (colisores e navegação); código:
`packages/shared/src/game/{world,navigation}.ts`, `migrations/0011_village_expansion.sql`,
`apps/api/src/residential-plots.ts`, `apps/client/src/scene/{Village,Ground,Player}.tsx`,
`apps/client/src/scene/{villageModels,groundRuns}.ts`, `apps/client/src/scene/gen/{houses,shops}.ts`,
`apps/client/src/ui/{Village,VillageAction}.tsx`

## Contexto

A Vila era uma praça de 34 u de raio com oito terrenos de ONG. O responsável técnico decidiu (2026-11-12) fazê-la
crescer para um povoado compacto e caminhável, com a árvore de Natal no centro e à vista das áreas importantes, e
registrou o que vale para esta e para as próximas fases:

- **Terrenos tipo A (só ONG):** os terrenos em volta da praça continuam reservados a ONGs aprovadas (DEC-028), em
  maior número.
- **Terrenos tipo B (residenciais, três faixas por distância: premium, padrão, econômico):** entram no layout e
  ficam visíveis agora, mas **a posse fica desligada**. Nenhuma decisão de produto registrada permite que um
  jogador tenha um terreno (DEC-028 fala de ONGs): é PROPOSTA e pergunta em aberto para o dono do produto.
- **Economia: desbloqueio jogando.** Nada é comprado com dinheiro e não existe moeda no jogo (DEC-042, IMPL-0002).
  O "preço" de uma faixa é um **requisito** configurável (por exemplo um nível mínimo), nunca um valor.
- **Comércio:** lojas de Natal como construções de verdade na área central, cada uma com ponto de interação e lugar
  para um lojista. Nesta fase o painel só diz o que a loja vai oferecer e que ainda não abriu.
- **Placas:** molduras de sinalização nas lojas, cada uma com id próprio. Nesta fase mostram só avisos da própria
  Vila; alugá-las é proposta posterior e desligada (patrocínio é PEN-008; publicidade que alcança crianças pede
  cuidado extra).
- **Sem veículos:** tudo a pé.
- **Fora desta fase** (não construir nem deixar esboço): NPCs e animais que andam, diálogo por IA, chat, voz,
  inventário, API de posse de terreno, lareiras e a quest da lenha, catálogos de loja. O mundo fica pronto para
  eles (pontos nomeados, rede de ruas, posição de lareira por casa).

## Decisão

### 1. Um plano, tudo derivado

`VILLAGE_PLAN` (`packages/shared/src/game/world.ts`, PROPOSTA) é o único lugar com contagens, larguras, recuos e
requisitos. `layoutVillage(plano)` deriva dele os anéis, os terrenos, as lojas, as placas, a rede de ruas e o raio
do mundo; `VILLAGE` é o resultado para o plano em vigor. Mudar um número no plano muda as posições, a semente
conferida pelos testes e a cena.

O modelo é uma **roda em volta da árvore**:

- **8 avenidas** saem da praça entre os lados de um octógono (a 22,5° + 45°·k). São as ruas principais e os
  corredores de vista para a árvore.
- Cada **anel** de terrenos é uma fileira ao longo de cada lado, de frente para a árvore. Uma **travessa** de
  pedestres corta o meio de cada lado, então cada lado tem duas meias fileiras.
- Cada anel fica tão perto da árvore quanto o anel anterior e o comprimento da própria fileira deixam: o mundo
  encolhe ou cresce com o plano.

| Do centro para fora | Distância ao eixo do lado (u) | O que há |
|---|---|---|
| Praça | 0 – 12 | árvore, postes, bancos, cordões de luz (como antes) |
| Rua redonda da praça | 13 – 17 | como antes |
| Faixa festiva | 17 – 26 | feira, trenó e renas, lago, bonecos de neve, lanternas (o que existia, reposicionado) |
| Fachada da praça | 26 – 34 | **12 terrenos de ONG** (os 8 que existiam, com os mesmos ids, e mais 4) e **4 lojas** |
| Rua premium | 35,5 – 39,5 | calçamento de pedra |
| Anel premium | 39,5 – 49,5 | 16 terrenos de 12 × 10 u |
| Rua padrão | 51 – 55 | neve batida |
| Anel padrão | 55 – 63 | 32 terrenos de 9,5 × 8 u |
| Rua econômica | 64,5 – 68,5 | neve pisada |
| Anel econômico | 68,5 – 75,5 | 64 terrenos de 6 × 7 u |
| Borda | até 82,5 | pinheiros altos e o pátio da lenha |

**Em números:** raio do mundo 82,5 u (era 34: 5,9 vezes a área); 12 terrenos de ONG, 4 lojas, 4 placas, 112
terrenos residenciais (16 + 32 + 64); 2 089 u de ruas (92 na rua da praça, 532 em avenidas, 1 041 nas três ruas
dos anéis, 424 em travessas). A pé, a 8,5 u/s: do terreno econômico mais distante até a árvore **8,8 s** (72 u de
caminho); do padrão mais distante, 6,7 s; do premium, 4,6 s.

Cada terreno (de ONG ou residencial) tem id único e estável, zona ou faixa, posição, orientação e limites
explícitos (largura e profundidade). Ids: `plaza-01`…`plaza-12`, `shop-01`…`shop-04`, `billboard-01`…`billboard-04`,
`premium-01`…`premium-16`, `standard-01`…`standard-32`, `economy-01`…`economy-64`.

### 2. Faixas reconhecíveis pelo ambiente, não por selo

| | Premium | Padrão | Econômico |
|---|---|---|---|
| Rua | pedra (como a praça) | neve batida | neve pisada |
| Caminho até a porta | pedra | neve batida | nenhum |
| Terreno e casa | 12 × 10 u; chalé de 7 × 7 com varanda | 9,5 × 8 u; chalé de 7 × 5, varanda em metade | 6 × 7 u; chalé de 5 × 5 sem beiral, lado a lado |
| Frente | muro baixo de pedra com portão entre dois pilares com lanterna | cerca de ripas curta entre os quintais | lanterna numa estaca |
| Entre vizinhos | jardim aberto, dois arbustos | cerca-viva | lenha empilhada |
| Poste na esquina com a avenida | nos dois cantos | em um canto | nenhum |

A casa de um terreno residencial é **cenário** (semente = id do terreno): ninguém é dono, então nenhuma chaminé
solta fumaça. As casas têm um andar e cumeeira paralela à rua (ver "Consequências": o que a câmera esconde).

### 3. Regra de vista para a árvore (`SIGHTLINE`)

1. Toda avenida é um corredor reto e aberto até a árvore: nada com mais de 3 u de altura a menos de 0,25 u das suas
   bordas, da ponta até as ramas da árvore.
2. Todo terreno residencial dá para uma rua que chega a uma avenida em linha reta: da rua em frente ao terreno, o
   trecho até a avenida da sua meia fileira não passa por nada alto, e tem no máximo 30 u. De qualquer terreno, a
   árvore está a uma esquina de distância.
3. Todo terreno e toda loja da fachada dá para a praça: nada alto entre a linha das varandas e a rua redonda, na
   reta até a árvore.

"Alto" são os chalés (de ONG e residenciais), as lojas e os pinheiros. Postes, lanternas, barracas, cercas e
cercas-vivas são finos ou baixos e não contam. Os pinheiros altos ficam só no cinturão atrás do último anel.
`packages/shared/src/game/village.test.ts` confere a regra para o plano em vigor e para variações dele.

### 4. Requisitos, nunca preços

Cada faixa tem um `requirement` em `VILLAGE_PLAN.tiers` (PROPOSTA, [OQ-17](open-questions.md)): hoje um nível mínimo
(premium 5, padrão 3, econômico 2). Os níveis vêm só de missões e quests (DEC-042); o nível 3 em diante depende das
quests, que estão desligadas em produção. Não há valor em reais, moeda, coluna de preço nem botão de compra em
nenhum lugar: o teste da migração e o dos painéis conferem isso.

### 5. Dados e API

- **Migração 0011** (aditiva): move os 8 terrenos que existiam (mesmos ids, mesmo estado, mesma ONG), acrescenta 4
  na tabela `lots`, que continua sendo só de terrenos de ONG, e cria `residential_plots` (id, faixa, posição,
  orientação, `owner_id` e `claimed_at` nulos, que nada grava ainda). Sem coluna de preço.
- **`GET /lots`** não muda de forma nem de comportamento: 8 linhas num banco antes da 0011, 12 depois.
- **`GET /residential-plots`** (pública, sempre ligada): id, faixa, posição e estado de cada terreno, **nunca quem
  é o dono**. Com a bandeira desligada, todo terreno responde `"unavailable"`. Num banco sem a tabela (produção
  está na migração 0003) ou sem banco, responde o layout das constantes compartilhadas, tudo `"unavailable"`, nunca
  um 500.
- **`RESIDENTIAL_PLOTS_ENABLED`** (`"false"` em produção e homologação) aparece em `/config` como
  `residentialPlots` e só vale com as contas ligadas. Hoje só muda o que a leitura responde: **não existe rota de
  posse**.

### 6. Lojas e placas

Quatro lojas na fachada da praça, uma a cada dois lados: construção gerada por semente (sem texto nem marca no
modelo), ponto de interação na porta e um ponto nomeado para o lojista (`ShopDef.keeper`, nada desenhado ainda). O
painel diz o nome, o que a loja vai oferecer e que ainda não abriu. Nomes e ofertas são da própria Vila e são
PROPOSTA (`SHOP_COPY`).

Cada loja tem uma moldura de placa no telhado, sempre virada para a câmera. O texto vem de `VILLAGE_NOTICES`:
avisos fixos da Vila, em pt-BR, escritos no repositório. Nenhum conteúdo de terceiros, nenhuma marca. Inspecionar a
placa mostra o aviso em texto, o id e que o espaço ainda não está disponível para aluguel
([OQ-18](open-questions.md)).

### 7. Interação

Terreno residencial, porta de loja e placa usam a mesma interação "perto de algo" dos terrenos de ONG (E, Enter ou
toque no botão de ação; um clique na construção leva o avatar até o ponto de uso). O botão desses três tipos está em
`ui/VillageAction.tsx`, ao lado do HUD e com as classes dele, porque `Hud.tsx` estava sendo refeito em paralelo;
juntar os três casos ao `switch` do HUD é um passo seguinte, sem mudança visível.

### 8. Navegação

A grade de 0,25 u foi mantida (as rotas em volta da praça ficam exatamente como eram), agora sobre o disco de
82,5 u. O que mudou foi o rascunho da busca: custos em 32 bits e o caminho escrito sobre a fila já usada. `planRoute`
e `stepWalk` não mudaram de contrato; os testes existentes valem com os números novos.

## Desempenho

Orçamento desta fase, no preset Média ou Alta, em qualquer ponto da Vila: **até 150 chamadas de desenho e 250 mil
triângulos por quadro** (sombra incluída), com a câmera no zoom padrão.

Medido em 2026-11-13 no build local (`vite build --mode workers`), Chrome com GPU (Apple M5, Metal), 1280 × 800,
`envTime=2026-12-20T12:00`, `envWeather=SNOW`, avatar parado, antes (`main`) e depois:

| Câmera fixa | Preset | Chamadas antes → depois | Triângulos antes → depois | Quadro p50 / p95 antes → depois |
|---|---|---|---|---|
| Spawn `(0, 9)` | Média | 70 → 124 | 121 570 → 217 312 | 16,7 / 17,3 ms → 16,7 / 18,3 ms |
| Spawn `(0, 9)` | Alta | 84 → 138 | 124 208 → 219 950 | 16,7 / 17,5 ms → 16,7 / 18,6 ms |
| Porta da loja `(5, 25,5)` | Média | — → 99 | — → 182 654 | — → 16,7 / 18,1 ms |
| Rua premium `(37,5, 6)` | Média | — → 98 | — → 212 192 | — → 16,7 / 18,4 ms |
| Rua econômica `(68, −22,5)` | Média | — → 65 | — → 158 708 | — → 16,7 / 18,4 ms |
| Rua padrão norte `(0, −60)` | Média | — → 60 | — → 142 912 | — → 16,7 / 18,6 ms |

O tempo de quadro nessa máquina fica preso aos 60 Hz antes e depois, então **não mostra o custo em aparelho
fraco**: chamadas e triângulos são o que vale comparar. Em renderização por software (SwiftShader, Média, spawn) o
quadro p50 foi de 71,6 ms (com `dpr` 0,75) para 74,7 ms (com `dpr` 1); é medida ruidosa. **Não foi medido em
celular.** O custo muda com a hora: com o sol mais baixo (15:30, céu limpo) a sombra alcança mais blocos e a
mesma câmera no spawn mediu 130 chamadas e 240 mil triângulos. Com o zoom todo afastado sobre a praça, nessa hora,
a cena chegou a 150 chamadas e 271 mil triângulos: acima do orçamento de triângulos, que vale para o zoom padrão.

| Navegação (Node, mesma máquina, todo terreno de ONG com chalé) | Antes | Depois |
|---|---|---|
| Células da grade / caminháveis | 74 529 / 37 379 | 436 921 / 200 600 |
| Colisores | 70 | 546 |
| Construir o campo (mediana) | 1,45 ms | 8,2 ms |
| `planRoute`, mediana de 816 rotas entre frentes de terreno e a árvore | 0,29 ms | 0,51 ms |
| `planRoute`, pior rota | 1,77 ms (77 u, 19 708 nós) | 4,84 ms (166 u, 40 720 nós) |
| Memória do campo + rascunho da busca | 0,4 MB + 2,7 MB | 2,2 MB + 10,5 MB |

O que foi feito para caber no orçamento:

- chão em faixas de mesma cor (um quad por faixa, só a face de cima): 23 mil células em menos de 11,5 mil quads;
- 112 chalés e 272 peças assados em 24 blocos (um por faixa de cada lado), descartados um a um pela câmera e pela
  sombra;
- modelos assados sem a face de baixo da camada do chão; chalés preenchidos por dentro (as faces internas somem);
- a floresta decorativa, que era uma malha só desenhada inteira nas duas passadas, virou 8 setores.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Anéis redondos em vez de lados retos | Casas viradas em ângulos quaisquer; fileiras retas alinham com a grade de voxels (0°, 45°, 90°) e dão ruas retas, que a regra de vista usa |
| Avenidas nos pontos cardeais | Cairiam sobre os postes, os pinheiros pequenos e as barracas que já estavam na praça; a 22,5° a praça fica como era |
| Três terrenos de ONG por lado | Chalés de 7 u com beiral pedem 9 u cada: a fachada iria para 38 u e o mundo para mais de 90 u de raio |
| Terrenos residenciais vazios até terem dono | Fiel ao estado (ninguém é dono), mas a Vila viraria um loteamento vazio; a casa é cenário e o painel diz isso |
| Grade de navegação de 0,5 u | Um quarto da memória, mas passagens com menos de ~2,3 u deixariam de entrar em rota e a linha de visão poderia raspar em cantos; o custo medido da grade de 0,25 u é aceitável |
| Tabela única para ONGs e residenciais | Mudaria o significado de `lots` e de `GET /lots`, que produção usa no esquema v3 |
| Preço em moeda do jogo | Não existe moeda (DEC-042) nem fluxo de compra (IMPL-0002) |

## Consequências

- **Positivas:** a Vila tem para onde crescer sem mexer no código de layout; todo ponto novo é alcançável a pé e
  conferido por teste; nada sólido é atravessado e nada invisível bloqueia (auditoria nos dois sentidos, agora com
  lojas, postes de rua, 272 peças e 112 chalés); produção (esquema v3) continua respondendo todas as rotas públicas.
- **Pior para quem joga hoje:**
  - a câmera olha do sul, de cima: uma casa ao sul de uma rua esconde quem anda rente a ela. As casas residenciais
    têm um andar e cumeeira paralela à rua, e o avatar ganha um contorno vermelho translúcido quando há uma
    construção entre ele e a câmera; ainda assim, nas ruas do lado sul parte do caminho é vista só pelo contorno. Chalés de ONG de
    dois andares (gerador existente) escondem mais;
  - os terrenos de ONG ficaram mais longe da árvore (cerca de 31 u do centro; eram 22 u) e a rua redonda deixou
    de passar na porta deles;
  - o lago, o trenó, o trenó pequeno, dois itens de quest e dois NPCs de quest mudaram de lugar; um morador
    decorativo saiu de onde passa uma avenida;
  - mais triângulos por quadro (cerca de 1,8 vez no spawn) e cerca de 10 MB a mais de memória para a navegação;
  - dos 12 terrenos de ONG, 4 só existem no banco depois da migração 0011: antes dela o jogo os desenha e o painel
    diz que ainda não recebem candidaturas.
- **Riscos:** o plano final (PEN-017/PEN-023) pode mudar contagens e posições; a migração 0011, depois de aplicada
  em produção, não se edita: um plano novo é uma migração nova. Ligar `RESIDENTIAL_PLOTS_ENABLED` sem a rota de
  posse só muda o estado respondido para `"available"`; não ligar antes da resposta à OQ-17.

## Pronto para as próximas fases

| Para | O que já existe |
|---|---|
| Lojistas | `ShopDef.keeper` (posição e orientação ao lado da porta de cada loja), livre de colisores |
| Lenhador e quest da lenha | `WOOD_YARD` (ponta da travessa norte, junto à floresta), com uma pilha de lenha |
| Lareiras | `ResidentialPlot.hearth` (dentro das paredes de cada casa) e `chimneyOf()` (topo da chaminé do modelo; a fumaça de `Smoke` já aceita essas origens) |
| NPCs e animais que andam, entregas, minimapa | `PATH_GRAPH`: 80 nós (avenidas, travessas e esquinas com as três ruas) e 120 arestas com tipo, largura e comprimento, todas em chão livre |
| Posse de terreno | `residential_plots.owner_id` / `claimed_at`, a bandeira, o estado na leitura pública |
| Catálogo de loja, aluguel de placa | ids estáveis (`shop-NN`, `billboard-NN`) e os painéis |

## Relacionados

- [IMPL-0010](0010-seeded-procedural-voxel-content.md): `house()` ganhou opções (pegada fixa por faixa, casa baixa,
  cumeeira ao longo da rua); sem opções a saída é a de sempre. Novos geradores: `shop`, `log-pile`.
- [IMPL-0016](0016-click-navigation-and-colliders.md): mesmo modelo de colisor e de navegação; os números de custo
  daquele ADR valem para o raio de 34 u.
- [IMPL-0008](0008-multiplayer-presence-durable-objects.md): presença anônima sem mudança; o servidor limita a pose
  ao novo `WORLD_RADIUS`, que vem do pacote compartilhado.
- Referência: [architecture.md §2.2 e §10](../reference/architecture.md), [storage.md](../reference/storage.md),
  [api.md](../reference/api.md), [deploy.md](../guides/deploy.md).
- Perguntas ao dono do produto: [OQ-17, OQ-18, OQ-19](open-questions.md).
