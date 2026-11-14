# IMPL-0025: Vida na Vila (personagens e animais que andam, simulados pelo relógio compartilhado)

**Status:** Proposta — fase 3 da expansão implementada (elenco, rotinas, reações, falas fixas). Tudo aqui é
**PROPOSTA do responsável técnico**: o elenco final, os nomes, as rotinas e o que cada personagem pode dizer são do
dono do produto ([OQ-20](open-questions.md)). Sem bandeira no servidor: não há dado, rota nem mensagem novos; quem
visita pode esconder os personagens nas configurações
**Data:** 2026-11-13
**Fontes:** decisões do responsável técnico em 2026-11-13 (fase 3 da expansão; a pé, sem veículos; **nenhum modelo
de linguagem nem outro serviço de IA nesta fase**; sem chat, sem texto livre, sem nomes de pessoas; economia por
desbloqueio, nada é vendido; a simulação é função pura do relógio compartilhado e não passa pelo servidor de tempo
real); [IMPL-0024](0024-village-expansion-and-zoning.md) (o plano da Vila e os ganchos que ele deixou: `PATH_GRAPH`,
`ShopDef.keeper`, `WOOD_YARD`), [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md) (relógio
sincronizado, clima e eventos por semente), [IMPL-0010](0010-seeded-procedural-voxel-content.md) (conteúdo por
semente), [IMPL-0013](0013-quests-v1-runtime.md) (NPCs de quest), [IMPL-0016](0016-click-navigation-and-colliders.md)
(colisores e navegação), [IMPL-0022](0022-immersive-entry-and-game-menu.md) (uma ação contextual, E/Enter, Esc),
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) (presença anônima); código:
`packages/shared/src/game/{life,life-dialogue}.ts`, `apps/client/src/game/{village-life,life-reactions,nearby,clicks}.ts`,
`apps/client/src/scene/{Life.tsx,life/castGeometry.ts,life/lifeMaterial.ts,gen/cast.ts}`, `apps/client/src/ui/NpcDialog.tsx`

## Contexto

A Vila cresceu (IMPL-0024), mas ninguém andava nela: três moradores, um cachorro, um gato, dois passarinhos, um
coelho e uma coruja ficavam parados como cenário, e os cinco NPCs de quest só existem com as quests ligadas
(desligadas em produção). A fase 3 pede uma Vila viva, com personagens de Natal e animais autônomos, sob estas
condições do responsável técnico:

- todo visitante vê os mesmos personagens nos mesmos lugares no mesmo momento, **sem o servidor de tempo real
  simular nem retransmitir nada**;
- comportamento leve: horários, máquinas de estado, variação por semente. **Nenhuma IA nesta fase**; falas são
  texto fixo em pt-BR, escolhido pelo contexto;
- sem chat, sem texto livre, sem nomes de pessoas; o protocolo de presença fica como está;
- nada é vendido: lojista e lenhador falam do que o lugar é e que ainda não abriu, nunca oferecem nada;
- o público provável inclui menores: nada que pressione a ficar, voltar, doar ou gastar.

## Decisão

### 1. A posição é uma função pura de (semente do mundo, hora sincronizada da Vila, plano da Vila)

`sampleLife(vida, t)` (`packages/shared/src/game/life.ts`, sem DOM, three.js nem runtime de Workers) devolve onde
está cada personagem no instante `t`. Cada cliente a avalia com o relógio que já compartilha
(`environment/network-clock.ts`) e com a semente do mundo que já recebe em `/environment`. **Não há mensagem nova,
estado no Durable Object nem linha no D1**: o servidor de tempo real não sabe que os personagens existem.

Como se calcula uma posição para um `t` qualquer, sem simular desde o zero:

1. **Fatias.** O tempo de cada grupo de personagens é cortado em fatias de duração fixa (de 75 a 240 s para
   pessoas, de 5 a 29 s para animais; a coruja, 300 s). A fatia `k` é `floor((t + fase) / duração)`; a fase de cada
   grupo sai da semente, então os grupos não se mexem todos juntos.
2. **Onde ficar.** `escolha(personagem, k)` sorteia, por hash de (semente, personagem, número da decisão), um dos
   pontos do próprio personagem, com os pesos da rotina para a hora em que a fatia começa (e para a neve e os
   eventos daquele minuto). Depende só de `k`, nunca do que veio antes. Uma decisão vale de 1 a 3 fatias (número de
   cada personagem, pela semente): é o "quanto tempo fica".
3. **Como chegar.** Dentro da fatia `k` o personagem anda de `escolha(k − 1)` até `escolha(k)` por uma polilinha
   fixa (o grafo de ruas mais o desvio de faixa dele), em passo constante, e depois faz a atividade do ponto até a
   fatia acabar. A posição é uma interpolação linear nessa polilinha: forma fechada, contínua em `t`.

Consequências diretas do modelo, todas conferidas por teste (`life.test.ts`):

- **Determinismo.** Mesma (semente, hora, plano) → mesmas posições, em qualquer ordem de perguntas e com o elenco
  listado em outra ordem. O caminho até uma posição usa só `+ − × ÷`, `sqrt`, `floor` e hashes de inteiros sobre
  coordenadas arredondadas ao centésimo: com `sin`, `cos`, `atan2`, `hypot`, `exp` e `pow` trocados por versões
  que arredondam um ulp para o outro lado (o que outro motor de JavaScript pode fazer), as posições saem **bit a
  bit iguais**; `Math.random` e `Date.now` lançam erro se forem chamados.
- **Continuidade.** Num dia inteiro, de 250 em 250 ms, ninguém anda mais rápido que o próprio passo. Não há
  transição fora de cena com salto: quem sai de cena some e reaparece **na mesma porta**.
- **Relógio um pouco errado.** Um cliente com o relógio `d` ms adiantado vê cada personagem no máximo
  `passo × d` adiante (medido abaixo). É aceito.
- **Custo.** Avaliar o elenco inteiro custa **0,53 µs por quadro (0,018 µs por personagem)** em Node na máquina de
  desenvolvimento (Apple M5), sem alocar: 552 bytes de heap em 800 mil quadros. O cliente chama uma vez por
  quadro, para todos (`evaluateLife`, com a hora num campo: um número passado como argumento pode ser encaixotado
  pelo motor, 16 bytes por chamada). A hora, a neve e os eventos são lidos uma vez por minuto da Vila. A população
  tem teto em configuração (`LIFE.maxPopulation` = 40; `compileLife` recusa um elenco maior).

**O clima e os eventos entram como funções da hora**, não como estado: a rotina pergunta a neve e os eventos do
minuto em que a fatia começa (o clima procedural da IMPL-0006, com os eventos aplicados). No cliente, as mesmas
funções que desenham o céu respondem, então `envTime` e `envWeather` (só em localhost) movem também os
personagens.

### 2. Elenco e rotinas: uma tabela (`LIFE_CAST`, PROPOSTA)

30 personagens. Contagens, passos, alcances e horários são configuração (`LIFE`, `LIFE_PACE`, `LIFE_RADIUS`,
`LIFE_GROUPS`, as rotinas de cada um).

| Quem | Quantos | Onde e o que faz |
|---|---|---|
| Papai Noel | 1 | junto ao trenó e à vista da árvore, das 10:00 às 21:30; descansa no trenó (fora de cena) |
| Duendes | 3 | arrumam o trenó e levam enfeites até perto da árvore, das 8:00 às 21:00 |
| Lojistas | 4 | um por loja, no ponto `ShopDef.keeper` enquanto durar o horário da loja (9:00–19:00, `LIFE.shopHours`), às vezes varrendo a porta; vão de casa à loja um quarto de hora antes e voltam ao fechar |
| Lenhador | 1 | racha e empilha lenha no pátio (`WOOD_YARD`), leva achas pela travessa norte até perto do Empório da Lareira, descansa no caminho; mora no Bairro da Floresta |
| Moradores | 6 | os três que eram decoração (mesma semente, mesmo boneco) e mais três; olham a árvore, as barracas, o lago, as renas; dois vizinhos conversam no banco do sudoeste; cada um mora num chalé do Bairro do Centro |
| Visitantes da temporada | 3 | cada um numa avenida: param para ler a placa da loja, numa esquina, perto da praça; chegam e vão embora pela ponta da avenida |
| Renas | 2 | uma em cada cercado, ao lado das travessas do sudeste e do sudoeste (as duas atreladas ao trenó continuam como estavam) |
| Cachorros | 2 | o que já existia acompanha o morador dele; outro ronda o noroeste da praça e dorme lá |
| Gatos | 2 | o que ficava no banco do sudeste agora fica no chão ao lado dele; outro, junto às barracas do oeste |
| Passarinhos | 4 | os dois dos postes voam entre dois postes vizinhos, acima das cabeças; dois ciscam no chão da praça |
| Coelho, coruja | 1 + 1 | o coelho pula num canto da faixa leste; a coruja aparece à noite no pinheiro de sempre |

- **Reaproveitado, não duplicado.** Os nove bichos e moradores que eram decoração (`CRITTERS`) passaram para a
  tabela com a mesma semente: o boneco de cada um é o mesmo, agora cortado em partes. `CRITTERS` deixou de existir.
- **Rotinas.** Cada personagem tem a sua lista de pontos e, por faixa de horário, o peso de cada ponto. À noite
  (22:00–7:00, `LIFE.quietHours`) quase todos estão em casa e a coruja sai; os passarinhos somem ao escurecer.
  Com neve a partir do limite de cada um (0,5 a 0,9 de `snowfall`; "neve forte" é 0,78) a pessoa vai para casa:
  na neve forte ficam nas ruas os lojistas (sob o toldo, sem varrer), o Papai Noel, os duendes e os mais
  resistentes. Durante um evento da Vila (véspera e dia de Natal, virada do ano) as pessoas ficam até mais tarde.
- **Personalidade por semente:** passo (±12 % do passo do tipo), pontos preferidos (peso × 0,6 a 1,4), quanto
  tempo cada decisão dura, desvio de faixa na rua, e a fase do grupo.
- **Os cinco NPCs de quest não mudaram.** Continuam com nome, lugar, colisor, rótulo e diálogo, parados, e só
  existem com as quests ligadas. Nenhum personagem do elenco fica ou passa a menos de um corpo deles, dos itens de
  quest ou dos pontos de interação (teste). Nenhuma coordenada de quest mudou; `verify-quests.mjs` não foi alterado.
- **Cercados das renas** (`PADDOCKS`, `world.ts`): dois, de 3,5 × 4,5 u, abertos para a praça, feitos com o gerador
  de cerca que já existia; têm colisor como qualquer adereço.

### 3. Não atravessar coisas, não se sobrepor

Garantido por construção e conferido de dois jeitos: **estático** (todos os pontos e todas as rotas de todos os
personagens, para quatro sementes) e **por amostragem** (24 h de 2,7 em 2,7 s; quatro sementes e cinco climas, em
14 combinações, mais de 400 mil instantes).

- **Chão livre.** Todo ponto e toda polilinha ficam fora de qualquer colisor nos dois conjuntos (terrenos vazios e
  quests desligadas; todos os terrenos com chalé e quests ligadas), dentro do mundo e fora do lago congelado.
- **Ruas.** Pessoas viajam pelo grafo `LIFE_PATHS`: o `PATH_GRAPH` da IMPL-0024 sem as cordas da rua redonda (que
  cortam postes e pinheiros) e sem o nó da travessa do nordeste que cai sobre o lago, mais trilhas a pé
  acrescentadas só em chão livre (da travessa de cada lado até a praça, as frentes das lojas, os portões das
  casas). Nas ruas cada um anda deslocado para a direita do sentido da caminhada (até 0,6 u, com esquadria nas
  esquinas): dois que se cruzam passam lado a lado.
- **Um ponto para cada um.** Todo lugar de atividade tem tantos pontos de ficar quantos personagens o usam: a
  capacidade nunca é excedida (o banco do par tem 2; o trenó, 4).
- **Grupos andam um de cada vez.** Personagens cujos caminhos podem se encontrar formam um grupo (os do trenó; os
  de cada loja e da travessa dela; o par do banco): dentro de uma fatia as viagens são agendadas uma depois da
  outra, em ordem que gira com a fatia, e cabem todas na fatia (teste). O cachorro que acompanha o morador anda
  1,7 s atrás e ao lado dele, por uma polilinha própria paralela à do dono.
- **Grupos diferentes nunca se encontram.** As polilinhas e os pontos de dois grupos nunca chegam a menos da soma
  dos dois corpos um do outro.

Na amostragem, a folga entre dois personagens nunca é negativa em nenhuma combinação (ninguém entra no corpo de
ninguém) e nenhuma posição cai em colisor.

### 4. O avatar nunca fica preso: personagens não são obstáculos

**Regra.** Um personagem que anda **não tem colisor e não entra na grade de navegação**: o avatar nunca é bloqueado
nem cercado por um, e `planRoute` não sabe que eles existem. É a única exceção à regra "tudo que é sólido tem
colisor" (IMPL-0016), registrada no `AGENTS.md`. Os moradores e bichos que eram decoração deixaram de bloquear.

Em vez de bloquear, o personagem **dá passagem**, numa camada local e só visual
(`apps/client/src/game/life-reactions.ts`, pura e testada):

- quando um avatar (o do visitante ou o de outro visitante) chega ao corpo dele, é desenhado afastado, na linha
  entre os dois; se o lado para onde iria está ocupado por algo sólido, vira para o primeiro lado livre;
- por tipo, com o avatar do próprio visitante: o cachorro chega perto e abana o rabo, o gato e o coelho mantêm
  distância, o passarinho no chão pula para longe, a rena levanta a cabeça, a pessoa parada vira para olhar e
  acena uma vez por aproximação;
- **limite:** o desenho nunca fica a mais de **1 u** da posição compartilhada (`REACT.maxOffset`, aplicado depois
  de cada passo) e volta sozinho a ela quando o avatar se afasta (em um ou dois segundos);
- **é por espectador.** Cada visitante vê a reação ao que acontece na própria tela; dois visitantes podem ver o
  mesmo morador até 1 u afastado para lados diferentes. A camada nunca escreve na simulação (teste: as posições
  compartilhadas ficam idênticas às de uma simulação à parte, com o avatar em cima de cada personagem).

### 5. Conversar: a ação contextual única, falas fixas

- **Sem IA.** Nenhum modelo de linguagem nem outro serviço escreve ou escolhe falas. `lifeTalk`
  (`life-dialogue.ts`) devolve duas ou três linhas fixas pelo que o personagem é, onde está, o que faz, a hora e o
  clima. O painel (`LifeDialog`, ao lado do `NpcDialog` dos NPCs de quest, o mesmo `Panel`) mostra as linhas e um
  botão "Continuar". Sem árvore de diálogo, sem sequência, sem pergunta ao visitante.
- **Quem fala o quê** (PROPOSTA, OQ-20): o lenhador diz de onde a lenha vai sair e que o pátio ainda não abriu;
  o lojista diz o nome e o tema da loja e que ela ainda não abriu; os dois terminam com "Nada é vendido na Vila.";
  Papai Noel e os duendes apontam para a árvore e para as casas das ONGs; morador e visitante cumprimentam pela
  hora, comentam o clima e o lugar, e o morador aponta um dos três caminhos do HUD pelo nome do botão ("Explorar
  ONGs", "Jogar", "Doação global"). Animais reagem, não falam.
- **Testes de texto** (`life-dialogue.test.ts`, sobre toda linha que pode ser produzida): recusam venda, preço,
  moeda, promessa de data ou de abertura, pressão para ficar, voltar, doar ou gastar, pergunta ao visitante e dado
  pessoal; nenhuma linha mistura a doação global com as ONGs (DEC-010..013), e a doação só aparece com "Doar é
  sempre uma escolha.".
- **Ação contextual** (`game/nearby.ts`): `Nearby` ganhou o tipo `life`. Um personagem parado a até 2,4 u oferece
  "Conversar com …" no mesmo botão, com as mesmas regras de E, Enter, Esc e véu (IMPL-0022) e a mesma histerese.
  **Ele vem por último:** nunca toma a ação de um NPC de quest, de uma interação de quest, do atril, da árvore ou
  de um terreno de ONG (que mantêm o alcance que tinham); contra a porta de uma loja, uma placa ou um terreno
  residencial, vale o que está mais perto do avatar, e o empate é do lugar. Personagem andando não é oferecido.
- **Clique** (`game/clicks.ts`, uma intenção por clique): de perto abre a fala; de longe leva o avatar até 1,3 u
  do personagem (ou de onde ele está indo, se estiver andando), do lado de quem chega, e a ação aparece ali. Um
  diálogo aberto por clique descarta a caminhada. As caixas que recebem o clique são invisíveis e não custam
  chamada de desenho; só pessoas têm caixa.
- **Moderação.** No modo de moderação (IMPL-0021) um clique que cai sobre o avatar de outro visitante seleciona o
  visitante, mesmo com um personagem na frente; um personagem nunca é selecionável (não está na lista de presença).
  Isso segue do código (a caixa do personagem chama primeiro a mesma `selectVisitorAt` do chão) e **não foi
  conferido em navegador** com um personagem na frente de um visitante.
- **Sem rótulo.** Personagens do elenco não têm nome flutuando. Só os NPCs de quest, que têm nome, seguem com o
  rótulo curto de sempre.
- **Oclusão.** Personagens não entram no teste que decide se o avatar está escondido (IMPL-0024): têm pouco mais
  de 3 u de altura e dois voxels de espessura, cobrem as pernas ou o peito do avatar por um passo, como postes e
  barracas, que também ficam fora.

### 6. Desenho: o elenco inteiro numa chamada

- Uma malha contém todos os personagens (`scene/life/castGeometry.ts`: 12 388 triângulos para os 30). Cada vértice
  leva o índice do personagem e o pivô e os pesos da sua parte; um passo no shader de vértice
  (`scene/life/lifeMaterial.ts`) lê uma linha de uma textura de dados (4 texels por personagem, escrita uma vez
  por quadro) e põe o personagem no lugar. **Uma chamada de desenho para o elenco, duas com a sombra**, com 1 ou
  com 30 na tela. As nove peças de decoração que saíram custavam uma ou duas chamadas cada.
- **Animação por transformações baratas, sem esqueleto e sem dependência nova:** pernas, braços, cabeça e rabo são
  partes rígidas que giram em torno de um pivô por uma soma ponderada de três ângulos (a passada e dois gestos),
  como o avatar anda. A passada segue a distância andada na simulação: os pés batem para todos.
- **Só o que está perto.** O buffer de índices tem apenas os personagens a até 46 u do avatar (preset Média; 30 u
  no Baixa, 60 no Alta, 72 no Ultra), com 3 u de histerese; quem está longe não custa triângulo. O preset Baixa
  desenha no máximo os 14 mais próximos.
- **Sombra** onde as regras existentes permitem: presets com sombra; bichos pequenos (gato, passarinho, coelho,
  coruja) ficam fora da passada de sombra, como a decoração pequena ficava.
- **"Menos movimento"** (e `prefers-reduced-motion`, que é o padrão dessa opção): os personagens continuam onde
  estão e dão passagem, mas nada balança, acena, pula ou abana.
- **Configurações:** "Mostrar os moradores e os animais da Vila" (ligado por padrão). Desligado, nada é desenhado
  nem oferecido; nada mais muda (não há estado de jogo neles).

## Medido

Tudo em 2026-11-13, na máquina de desenvolvimento (Apple M5), com o build local (`vite build --mode workers`) e
os Workers locais. "Antes" é o commit de onde este ramo partiu (`6678b70`).

**Custo da simulação** (Node, `life.test.ts`): **0,53 µs por quadro para os 30 personagens (0,018 µs por
personagem)**, 552 bytes de heap em 800 mil quadros (nenhuma alocação por quadro). O teste falha acima de 1 µs por
personagem ou de 2 bytes por quadro.

**Dois visitantes, mesmo momento** (`verify-life.mjs`, dois contextos de navegador separados):

| O que foi comparado | Relógios | Posições comparadas | Idênticas | Maior diferença | Diferença média |
|---|---|---|---|---|---|
| Mesma hora pedida aos dois (48 horas ao longo de um dia) | — | 1 440 | **todas, bit a bit** | 0 | 0 |
| Relógio sincronizado de cada um (os dois sincronizam com a API local), nos mesmos 1 416 instantes reais ao longo de 24 h | 0,45 ms de diferença | 42 480 | 41 819 | **0,0024 u** (um passarinho em voo) | 0,000013 u |
| Relógios propositalmente desencontrados (duas páginas com o relógio de desenvolvimento, abertas uma depois da outra) | 1,79 s de diferença | 42 480 | 40 923 | 9,2 u (o mesmo passarinho, que voa a mais de 5 u/s) | 0,057 u |

O relógio de cada página é lido ao lado do relógio do aparelho, que as duas compartilham; a diferença entre os
dois é a diferença de relógio, e cada página diz onde está cada personagem nos mesmos instantes reais pelo seu
relógio. Em toda comparação, nenhum personagem ficou mais longe do que o próprio passo vezes a diferença dos
relógios. **Medido com a API na mesma máquina:** pela internet, o relógio de rede erra na ordem da latência (metade
da assimetria de ida e volta), o que para uma pessoa a 2,4 u/s são centímetros a decímetros; isso não foi medido.

**Orçamento de desenho** (150 chamadas e 250 mil triângulos por quadro, IMPL-0024). Chrome com GPU (Metal),
1280 × 800, avatar parado, hora e clima fixos por `envTime` e `envWeather` (dia 2026-12-20), mesmo roteiro de 18
vistas do acompanhamento da IMPL-0024; contadores de todas as passadas, sombra incluída:

| Câmera fixa (avatar) | Zoom | Hora, clima | Preset | Chamadas antes → depois | Triângulos antes → depois |
|---|---|---|---|---|---|
| Spawn `(0, 9)` | 1 | 12:00, neve | Média | 101 → 91 | 112 786 → 138 354 |
| Spawn `(0, 9)` | 1 | 12:00, neve | Alta | 115 → 105 | 115 424 → 140 992 |
| Spawn `(0, 9)` | 1 | 15:30, céu limpo | Média | 102 → 92 | 114 870 → 139 454 |
| Spawn `(0, 9)` | 1 | 17:50, céu limpo | Alta | 118 → 108 | 126 964 → 151 476 |
| Spawn `(0, 9)` | 0,55 | 12:00, neve | Média | 78 → 73 | 80 008 → 106 828 |
| Praça, spawn `(0, 9)` | 1,6 | 12:00, neve | Média | 111 → 101 | 147 650 → 173 218 |
| Praça, spawn `(0, 9)` | 1,6 | 15:30, céu limpo | Média | 113 → 103 | 154 630 → 179 214 |
| Praça, spawn `(0, 9)` | 1,6 | 15:30, céu limpo | Alta | 127 → 117 | 157 268 → 182 836 |
| Praça, spawn `(0, 9)` | 1,6 | 17:50, céu limpo | Média | 116 → 106 | 166 886 → 191 398 |
| Praça, spawn `(0, 9)` | 1,6 | 17:50, céu limpo | Alta | 130 → 120 | 169 524 → 194 036 |
| Praça, spawn `(0, 9)` | 1,6 | 08:00, céu limpo | Média | 114 → 104 | 159 466 → 173 074 |
| Praça, spawn `(0, 9)` | 1,6 | 23:00, céu limpo | Alta | 126 → 116 | 152 604 → 158 852 |
| Porta da loja `(5, 25,5)` | 1 | 12:00, neve | Média | 89 → 85 | 101 518 → 126 590 |
| Rua premium `(37,5, 6)` | 1 | 12:00, neve | Média | 73 → 71 | 127 832 → 149 524 |
| Rua premium `(37,5, 6)` | 1,6 | 15:30, céu limpo | Média | 105 → 98 | 171 764 → 191 200 |
| Rua econômica `(68, −22,5)` | 1 | 12:00, neve | Média | 63 → 66 | 120 360 → 127 380 |
| Rua econômica `(68, −22,5)` | 1,6 | 15:30, céu limpo | Média | 73 → 75 | 138 840 → 145 824 |
| Rua padrão norte `(0, −60)` | 1 | 12:00, neve | Média | 60 → 62 | 117 802 → 124 986 |

- **Chamadas:** caem cerca de 10 na praça (as nove peças de decoração saíram; o elenco inteiro é uma chamada, duas
  com a sombra) e sobem 2 ou 3 nas ruas onde antes não havia nenhum personagem. A pior das 18 vistas tem
  120 chamadas (eram 130).
- **Triângulos:** sobem de 6 mil a 27 mil conforme quantos personagens estão perto (na praça à tarde, 28 dos 30:
  cerca de 12 mil na passada principal e outro tanto na de sombra). No spawn, Média, 12:00 com neve: de 112 786
  para 138 354 (+23 %). A pior vista tem 194 036 triângulos, **22 % abaixo do orçamento** (era 169 524).
- O tempo de quadro nessa máquina fica preso aos 60 Hz antes e depois e não mostra o custo em aparelho fraco.
  **Não foi medido em celular.**
- `verify-life.mjs` confere o orçamento em seis vistas com os personagens na tela (as quatro do `verify.mjs`, a
  porta da loja e a rua premium), em renderização por software: de 75 a 106 chamadas e de 127 mil a 179 mil
  triângulos; `verify.mjs` segue conferindo as suas quatro.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Simular no Durable Object e transmitir poses | Custo e estado no servidor para algo que todos podem calcular; a sala guardaria mais que presença (IMPL-0008) e cada visitante novo dependeria de um instantâneo |
| Simulação integrada no cliente (passo a passo, com desvio entre agentes) | Dois clientes divergem com o tempo, e quem entra depois teria de simular desde um instante comum; não há forma fechada |
| Sorteio de destino com planejador (`planRoute`) por personagem | A grade de navegação e `hypot` dão empates que outro motor pode resolver diferente; e planejar por personagem custa por quadro o que a regra do projeto reserva ao clique |
| Personagens como colisores | O avatar ficaria preso num banco cheio ou numa rua estreita; rotas planejadas no clique ficariam erradas quando o personagem andasse |
| Um `InstancedMesh` por parte e por boneco, como os outros visitantes | 5 chamadas por boneco distinto: o elenco passaria de 100 chamadas, num orçamento de 150 |
| Falas geradas por IA | Fora desta fase por decisão do responsável técnico; público com menores, texto precisa ser revisável linha a linha |

## Consequências

- **Positivas:** a Vila tem gente e bichos com rotina, iguais para todos, sem custo de servidor nem de rede; o
  orçamento de desenho ficou com mais folga do que antes (ver "Medido"); acrescentar um personagem é uma linha na
  tabela, e os testes dizem se o lugar dele serve.
- **Pior para quem joga hoje:**
  - os três moradores, o cachorro, o gato e o coelho **deixaram de bloquear** o avatar e o gato desceu do banco;
  - perto de um personagem parado, longe de tudo o mais, o botão de ação passa a oferecer "Conversar com …" (a
    linha de como andar cede o lugar, como para qualquer ação);
  - junto à árvore, a um terreno de ONG ou a um NPC de quest o botão continua sendo deles: para conversar com o
    Papai Noel ou um duende ao pé da árvore é preciso clicar no personagem ou chegar pelo lado de fora;
  - quem conversa com um personagem pode vê-lo ir embora com o diálogo aberto (a fatia dele acabou): o texto
    fica, o personagem não espera;
  - dois visitantes lado a lado podem ver o mesmo personagem até 1 u afastado para lados diferentes (a reação é
    por espectador), e relógios diferentes mostram posições um pouco diferentes;
  - à noite (22:00–7:00) e na neve forte a Vila fica quase sem gente, por desenho;
  - mais triângulos por quadro com gente na tela (até 12 mil; ver "Medido") e uma textura de 4 × 40 texels
    escrita por quadro. **Não foi medido em celular.**
- **Riscos:** o elenco e as falas são PROPOSTA e aparecem para todos: se o dono do produto mudar o elenco (OQ-20),
  a tabela muda e os testes de lugar valem para o novo; uma mudança no plano da Vila (PEN-017/PEN-023) pode tirar
  um ponto do chão livre, e `life.test.ts` falha dizendo qual. As salas de presença não carregam versão do mundo
  (IMPL-0008): uma aba aberta antes da publicação segue sem personagens até recarregar.

## Fora desta fase (não construído, sem esboço no código)

Falas escritas por IA (proposta posterior, desligada); catálogos de loja; lenha como recurso, lareiras e a quest da
lenha; inventário; personagens entrando em construções de verdade; qualquer coisa que um personagem dê, venda ou
peça.

## Relacionados

- [IMPL-0024](0024-village-expansion-and-zoning.md): o plano, o `PATH_GRAPH`, os pontos de lojista e o pátio da
  lenha; o orçamento de 150 chamadas e 250 mil triângulos.
- [IMPL-0016](0016-click-navigation-and-colliders.md): a exceção à regra dos colisores (§4 acima).
- [IMPL-0008](0008-multiplayer-presence-durable-objects.md): o protocolo de presença não mudou.
- Referência: [architecture.md §2.5, §5 e §10](../reference/architecture.md), [content.md](../reference/content.md).
- Pergunta ao dono do produto: [OQ-20](open-questions.md).
