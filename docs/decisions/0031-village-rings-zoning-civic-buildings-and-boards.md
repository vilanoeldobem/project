# IMPL-0031: A Vila em anéis zoneados — 80 % para ONGs, prédios cívicos, parques e placas

**Status:** Proposta — implementada, a validar. Pedido do responsável técnico em 2026-11-19; nenhuma DEC do
repositório de documentação cobre o tamanho da Vila, a proporção entre terrenos de ONG e casas, prédios cívicos ou
placas. A planta final segue **PENDENTE** (PEN-017, PEN-023, OQ-19), a posse de terrenos residenciais segue
desligada e indecisa (OQ-17) e o conteúdo das placas segue restrito aos avisos da própria Vila (PEN-008, OQ-18).
**Data:** 2026-11-19
**Fontes:** pedido do responsável técnico em 2026-11-19 (aumentar a Vila; prédios comuns em lugares espalhados;
"80/20" entre ONGs e casas; áreas de publicidade com o tamanho das artes já definido) e as escolhas dele na sessão de
planejamento: **quatro anéis, raio de cerca de 99 u**, e **Posto do Trenó no lugar do posto de gasolina**;
DEC-028 (terrenos da Vila começam como terrenos para ONGs) e DEC-035 (a Vila ganha ruas e terrenos conforme ONGs
aprovadas ocupam os espaços); [IMPL-0024](0024-village-expansion-and-zoning.md) (plano único, ids posicionais, regra
de vista, orçamento de desenho), [IMPL-0016](0016-click-navigation-and-colliders.md) (colisores e navegação),
[IMPL-0025](0025-village-life.md) (personagens), [IMPL-0030](0030-thawed-village-and-readable-streets.md) (chão e
neve); código: `packages/shared/src/game/world.ts`, `migrations/0015_village_growth.sql`,
`apps/client/src/scene/{Village.tsx,Props.tsx,Ground.tsx,groundRuns.ts,boardAtlas.ts,sectors.ts,villageModels.ts}`,
`apps/client/src/scene/gen/civic.ts`, `apps/client/src/ui/{Village.tsx,Explore.tsx,MapPanel.tsx}`.

## Contexto

A Vila da IMPL-0024 tinha 82,5 u de raio, 12 terrenos de ONG (só na fachada da praça), 4 lojas, 4 placas e 112
terrenos residenciais em três anéis: os terrenos de ONG eram cerca de 10 % das parcelas. O pedido inverte a
proporção, aumenta a Vila e pede prédios e placas espalhados.

Limites encontrados antes de desenhar:

- **Ids posicionais gravados em produção.** A migration 0012 está aplicada (schema v13 em produção). Alargar a
  fachada (`frontage.perHalf`) moveria e renomearia todos os terrenos existentes e toda a praça montada à mão.
- **Cada chalé de ONG publicado era uma malha própria** (duas ou três chamadas de desenho). Com muitos terrenos
  publicados à vista o orçamento de 150 chamadas estouraria; nunca foi medido porque nenhuma ONG está publicada no
  ambiente local.
- **Navegação:** a memória de busca é de 10 bytes por célula da grade de 0,25 u; um teste limitava em 5 MB, o que
  dá cerca de 90 u de raio.
- **Sem veículos** (IMPL-0024, `AGENTS.md`): um posto de gasolina contradiz a regra.

## Decisão

### 1. O plano é uma lista de anéis

`VILLAGE_PLAN.rings` substitui os três anéis fixos por faixa. Cada anel tem um id (`ring1`…), a faixa das suas casas
(`tier`: planta da casa, requisito em estudo e calçamento da rua continuam em `tiers`), quantas parcelas por meia
fileira, o tamanho da parcela e um **zoneamento**: uma letra por meia fileira (duas por lado, a partir do lado leste,
no sentido anti-horário).

| Letra | Uso da meia fileira |
|---|---|
| `N` | terrenos de ONG (um por parcela) |
| `R` | casas residenciais (uma por parcela) |
| `C` | um prédio cívico (o próximo de `VILLAGE_PLAN.civic`) |
| `P` | um parque |
| `S` | uma praça pequena |

**A fachada e a praça não mudam:** `plaza-01`…`plaza-12`, as quatro lojas e todo o cenário montado à mão ficam onde
estavam (um teste fixa as coordenadas). **Crescer é acrescentar um anel ao fim da lista:** nada do que existe muda de
lugar nem de id (teste: "adds a ring without moving or renaming anything").

### 2. O plano em vigor: quatro anéis, raio de 99 u

| Anel | Frente – fundo (u) | Parcela | Por meia fileira | Faixa | ONG | Casas | Cívico | Parque/praça |
|---|---|---|---:|---|---:|---:|---|---|
| Fachada | 26 – 34 | 7 × 8 | 1 | — | 12 | — | 4 lojas | — |
| `ring1` | 39,5 – 49,5 | 12 × 10 | 1 | premium | 7 | 5 | banco, cantina, academia | 1 praça |
| `ring2` | 55 – 63 | 9,5 × 8 | 2 | padrão | 18 | 6 | escola, cinema, teatro | 1 parque |
| `ring3` | 68,5 – 76,5 | 8 × 8 | 3 | padrão | 30 | 6 | mercado, hospital, Posto do Trenó | 1 parque |
| `ring4` | 82 – 91 | 10 × 9 | 3 | econômico | 30 | 6 | galeria, ginásio | 1 parque, 1 praça |
| **Total** | | | | | **97** | **23** | **11** | **5** |

- **Proporção:** 97 terrenos de ONG e 23 casas: **80,8 % por parcelas**, 79 % por área de chão. Um teste mantém as
  duas medidas entre 77 % e 83 %.
- **Disposição:** as letras foram arrumadas **à mão**, espalhadas, com três restrições: dois prédios cívicos nunca
  lado a lado; casas, parques e praças em todos os quadrantes; e as meias fileiras onde mora um personagem da Vila
  (IMPL-0025) continuam residenciais. O plano aprovado falava em sorteio com semente; a terceira restrição tornou a
  arrumação manual mais simples de ler e de revisar. Trocar uma letra é mudar o plano (e exige migration: ver 4).
- **Diferença para o plano aprovado na sessão:** 97 terrenos e 23 casas (eram 96 e 24), porque dez personagens moram
  em casas e cinco delas ficam no primeiro anel.

### 3. Ids e números

- Terrenos dos anéis: `ring1-01`…`ring4-30`. `lots.street` é o id do anel e `slot` conta dentro dele
  (`UNIQUE (street, slot)`). Os da praça seguem `plaza-NN`.
- **Número na tela** (`LotDef.number`): conta todos os terrenos da Vila, a praça primeiro e depois anel por anel
  ("Terreno 13" é `ring1-01`). `lotNumber()` e a validação da candidatura passaram a consultar o plano em vez de
  interpretar o id (antes: `split("-")[1]` e `/^plaza-\d{2}$/`).
- Casas: `<faixa>-NN`, numeradas dentro da faixa, anel por anel. Prédios e praças: `civic-NN`, `park-NN`,
  `square-NN`. Placas: `billboard-NN` (as quatro dos telhados das lojas, inalteradas), `outdoor-NN`, `lawn-NN`,
  `screen-NN`.

### 4. Migration 0015 (schema v15)

Só estrutura do mundo. Insere os 85 terrenos dos anéis, todos `available`; apaga e semeia de novo
`residential_plots` (112 → 23 linhas). A tabela não tem coluna de posse e nenhuma linha de outra tabela aponta para
ela (OQ-17), então trocar o conteúdo inteiro não perde nada. **Não toca nas linhas da praça**: estado, ONG e posição
dos doze terrenos ficam como estão (teste em SQLite a partir de um banco v14 com casa publicada, candidatura em
análise e dados de doação). As rotas públicas respondem em todo schema de v3 a v15: antes da 0015, o jogo mostra os
terrenos dos anéis como "Terreno em preparação", como já fazia com os da 0012.

### 5. Prédios cívicos, parques e praças (cenário)

- **Onze prédios**, cada um com nome próprio da Vila e uma linha sobre o que é. Nada é vendido, atendido nem
  agendado em nenhum deles, e o painel diz isso com as palavras de hoje ("Este prédio é cenário da Vila: não há
  atendimento e nada é vendido aqui."). Nenhum carrega texto, logo ou marca.
- **Posto do Trenó** no lugar do posto de gasolina: cobertura sobre quatro postes, a cabana do zelador, feno e um
  trenó estacionado. A regra "sem veículos, tudo a pé" fica como está.
- **Hospital:** uma cruz verde sobre a porta, sinal de lugar de cuidado; não é o emblema de ninguém.
- **Parques** (coreto, banco, pinheiro, um outdoor e duas placas de jardim) e **praças** (fonte, dois postes, bancos
  onde cabem, um telão e duas placas de jardim).
- Cada coisa sólida tem o seu colisor em `world.ts`, e a auditoria de colisores passou a incluir todas elas. O
  prédio nasce de `scene/gen/civic.ts` (categoria nova `civic` no orçamento de voxels); a semente só escolhe cores,
  nunca a forma, e um teste confere que a forma bate com o colisor.

### 6. Placas: quatro formatos, tamanho das artes definido

| Formato | Painel no mundo | Arte a entregar | Célula no atlas | Quantas | Onde |
|---|---|---|---|---:|---|
| Placa de telhado (`rooftop`) | 5 × 2 u | 1280 × 512 px | 320 × 128 | 4 | telhado de cada loja (como antes) |
| Outdoor (`outdoor`) | 8 × 4 u | 2048 × 1024 px | 512 × 256 | 7 | um em cada parque; um no fim de cada avenida alternada |
| Placa de jardim (`lawn`) | 2 × 1,5 u | 512 × 384 px | 128 × 96 | 21 | ao lado de cada prédio; duas em cada parque e praça |
| Telão (`screen`) | 8 × 4,5 u | 1920 × 1080 px | 384 × 216 | 5 | um em cada praça; telhado do cinema, da galeria e do ginásio |

- **Conteúdo: só avisos da própria Vila**, texto fixo do repositório, como antes. As placas de jardim usam avisos
  curtos (até 18 caracteres). Nenhum painel fala em alugar, anunciar ou "em breve". A arte de terceiros **não** está
  implementada: depende da resposta à OQ-18.
- **Uma textura para todas** (`boardAtlas`, 2048 px de largura) e **duas chamadas de desenho** (as impressas, que a
  cena ilumina; os telões, que brilham). A célula é a resolução em que o jogo desenha a placa; a arte a entregar tem
  o quádruplo (o quíntuplo no telão) para o caso de uma versão futura aproximar mais a câmera.
- **Telão:** troca de aviso a cada 8 s entre dois avisos; com "menos movimento" ligado fica no primeiro.
- **Nenhuma placa gira:** todas ficam de frente para a câmera, como as das lojas. Por isso outdoor e telão ficam num
  mastro só (o colisor cabe em qualquer ângulo de fileira).
- Entrega das artes: [`docs/reference/display-boards.md`](../reference/display-boards.md).

### 7. Desenho dentro do orçamento (150 chamadas, 250 000 triângulos)

- **Um bloco por anel e por lado** para tudo o que é fixo (casas, cercas, sebes, prédios, coretos, fontes, molduras
  das placas), com as esferas de sombra de cada peça (`casters`).
- **Chalés de ONG publicados em blocos**: um por lado em cada anel e um por quarto da praça, refeitos quando `/lots`
  responde. Substitui uma malha por chalé.
- **Chão em nove pedaços** (o miolo da Vila e um setor por lado), para a câmera desenhar só o trecho à vista.
- Rótulo "Terreno disponível" só a menos de 13 u (era 28 u): com fileiras de terrenos livres as mesmas duas palavras
  cobriam a Vila.

Medido em Chrome com GPU (build local `--mode workers`, preset médio, contadores do painel de depuração, todos os
passes):

| Vista | Lotes livres (hoje) | Uma casa em cada um dos 97 terrenos |
|---|---|---|
| Praça, zoom padrão, 12h | 96 chamadas / 148 530 triângulos | 114 / 171 234 |
| Praça, zoom todo para fora, 15h30 | 106 / 162 844 | 130 / 192 530 |
| Praça, zoom todo para fora, 06h20 | — | **139** / 194 584 |
| Segunda rua, zoom todo para fora, 06h20 | — | 137 / **217 480** |
| Rua da escola (ring2), 12h | 99 / 155 988 | 131 / 202 950 |
| Galeria (ring4), 15h30 | 93 / 149 682 | 121 / 181 156 |

A Vila cheia cabe no orçamento com **11 chamadas e 32 000 triângulos de folga** na pior vista medida. Tentado e
revertido: um bloco de chalés por quarto de anel (em vez de por lado) piorou as duas contas (153 chamadas, 280 000
triângulos: blocos grandes demais para a câmera descartar).

### 8. Navegação

| | Raio 82,5 (IMPL-0024) | Raio 99 |
|---|---:|---:|
| Células da grade | 436 921 | 628 849 |
| Células andáveis (lotes livres / todos com chalé) | não registrado | 359 363 / 290 507 |
| Memória de busca | 4,4 MB | 6,3 MB |
| Pior busca em 3 000 pares sorteados (células expandidas) | 72 464 | 104 729 |
| Colisores (lotes livres / todos com chalé e quests) | ≈ 550 | 820 / 535 |
| Montar a grade (mediana) | ≈ 8 ms | 20 ms (lotes livres), 23 ms (todos com chalé; pior de 21 medidas: 49 ms) |
| Planejar um caminho, 3 000 pares sorteados (mediana / p99 / pior) | 0,45 / 3,7–4,1 / 6,5–8 ms | 0,95 / 8,5 / 13,5 ms |

Tempos medidos em Node num MacBook, com a máquina parada (os da coluna da esquerda são os da IMPL-0024, em outra
medição). A grade é montada ao carregar e quando uma casa é publicada; um caminho é planejado a cada clique, nunca
por quadro. O pior clique medido (13,5 ms) cabe num quadro de 16,7 ms; num celular lento pode custar um quadro.

O limite do teste de memória subiu de 5 MB para **7 MB**, e o da pior busca de 100 000 para 150 000 células. Um
quinto anel precisa ser medido antes de os limites mudarem de novo. A regra de vista 2 (até 30 u de caminhada da
frente de uma parcela até a avenida) vale para terrenos de ONG e prédios dos anéis também; o anel mais longe do
plano em vigor fica em 26,6 u.

### 9. Personagens (IMPL-0025)

Dez personagens moram em casas. Os quatro lojistas e o morador 1 ficam no primeiro anel, onde estavam; os moradores
2 a 6 mudaram para casas da segunda rua (a caminhada até a praça ficou cerca de 15 u mais longa); o lenhador fica no
anel de fora, ao lado do pátio de lenha, que acompanhou a borda do mundo. As casas da faixa padrão têm varanda até
meio metro da rua: o personagem entra pelo quintal ao lado dela.

## Alternativas consideradas

- **Alargar a fachada da praça para mais terrenos de ONG:** renomearia e moveria os terrenos gravados em produção e
  pediria refazer a praça à mão. Rejeitada.
- **Rezonear sem crescer (três anéis, raio 83,5):** 70 terrenos e 15 casas, mas só 8 prédios e 3 parques. Oferecida
  ao responsável e não escolhida.
- **Cinco anéis (raio 114,5):** cerca de 138 terrenos; 8,4 MB de memória de busca, a regra de vista 2 teria de
  afrouxar e a memória em celular não foi medida. Oferecida e não escolhida; fica a um anel de distância.
- **Posto de gasolina sem carros:** pediria emendar a regra "sem veículos". O responsável preferiu o Posto do Trenó.
- **Casas misturadas aos terrenos na mesma meia fileira:** colisores e sebes por parcela, e a auditoria de fileiras
  deixaria de valer. O zoneamento por meia fileira mantém cada fileira de um só tipo.

## Consequências

- **Implantação.** (1) Aplicar a 0015 antes ou junto da API quando as contas estiverem ligadas (com elas desligadas
  as rotas públicas respondem em qualquer ordem). (2) **Publicar o servidor de tempo real junto com o cliente:** ele
  limita a posição ao raio do mundo, e um servidor antigo prenderia os visitantes no raio de 82,5 u. (3) As salas
  continuam sem versão do mundo: uma aba aberta antes da publicação vê os outros andando fora do seu mundo até
  recarregar (limite conhecido da IMPL-0024).
- **Vila vazia.** Com nenhuma ONG publicada, os 97 terrenos mostram o marcador de terreno livre. A DEC-035 fala em a
  Vila crescer **conforme** ONGs aprovadas ocupem os espaços; quantos anéis abrir no lançamento é pergunta para o
  dono do produto (OQ-19). Tecnicamente, abrir menos é tirar anéis do fim da lista antes de a 0015 ir a produção.
- **Antes de a 0015 ser aplicada em produção o tamanho ainda custa pouco para mudar:** editar o plano e gerar a
  migration de novo. Depois, qualquer mudança que mova ou renomeie é uma migration nova.
- **Testes de oclusão:** as 48 amostras medidas na cena da IMPL-0024 foram retiradas (as ruas mudaram) e trocadas
  por casos construídos da geometria dos prédios novos, **não medidos no navegador**.
- **Não medido:** tempo de quadro e memória num celular real; memória de GPU; a sala cheia (40 pessoas) com a Vila
  cheia.
- **Pendente do dono do produto:** OQ-17 (casas), OQ-18 (o que as placas podem mostrar), OQ-19 (planta final e
  quantos anéis abrir), OQ-22 (prédios cívicos: lista, nomes e se algum terá função).
