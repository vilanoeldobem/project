# Changelog

Todas as mudanças notáveis da Vila Noel do Bem são registradas neste arquivo.

O formato segue [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota
[Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/). A política completa (o que cada número significa,
versão do schema D1, processo de release) está em [`docs/reference/versioning.md`](docs/reference/versioning.md).
Cada versão indica o schema D1 que entrega.

## [Unreleased]

### Added

- Teste da retomada do recebimento de Pix pela ONG após falha na gravação da auditoria: o provedor simulado devolve a mesma subconta, o D1 registra um único vínculo e a cobrança seguinte usa esse destino.
- Teste de confirmação tardia de Pix após a retirada da ONG e a reocupação do terreno: o pagamento mantém o destino original e o saldo da nova ocupante continua zerado.

## [0.8.0] - 2026-11-22

**Visual de blocos, prontidão das dependências e a saga v2 completa atrás de flags**
([IMPL-0033](docs/decisions/0033-block-look.md)). Schema D1 **v15**, o mesmo da 0.7.0: nenhuma migration e nenhuma
bandeira nova em produção (`QUESTS_V2_ENABLED = "false"` passa a constar no `wrangler.jsonc` da API). Os dez livros da
saga (PEN-025) e as doações (PEN-004, PEN-006) seguem desligados; o provador recebe as pendências da revisão do PR #48.

### Removed — código morto

- As regras do catálogo v1 de visuais (`isUnlocked`, `unlockedIds`, `wear`, `sanitizeLook`, `requirement` em
  `cosmetics.ts`) repetiam as do catálogo unificado (`*In` em `cosmetics-v2.ts`), que é o que o jogo usa. Os testes
  passam a usar as do catálogo unificado.
- `CHAIN_TITLES` (o título de cada cadeia já vem em cada missão), `NIGHT_ONLY`, `BILLBOARD_PANEL` e `MINIGAME_IDS`:
  nenhum código os lia.

### Fixed — Recebimento das ONGs

- A troca de CNPJ invalida a configuração do beneficiário para novos Pix. O painel financeiro exige a revisão atual da candidatura e os pagamentos anteriores preservam seu destino.

### Fixed — provador (P08), pendências da revisão do PR #48

- O foco do teclado fica no cartão depois de "Equipar" (antes caía no `body` quando o botão virava "Em uso").
- O nome do cartão diz se o visual é grátis ou pago ("Provar Gorro, grátis"), para o leitor de tela.
- A presença aplica a regra do vestido a todo visual recebido: com vestido, blusa e calça voltam ao padrão
  (`parseLook`), como no próprio provador.
- Testes de comportamento no lugar do teste tautológico: um item pago aparece na prévia, mas nunca fica no visual
  salvo nem na presença.
- **Nota de migração:** quem tinha só o gorro de azevinho do nível 2 (`hat-holly`, v1) recebe `helmet-holly`, que no
  catálogo v2 se ganha visitando um terreno; até lá o visual volta ao gorro padrão.

### Added — prontidão das dependências (auditoria §7.6)

- **`GET /ready` na API**: um `SELECT 1` no D1 e um `head` no bucket R2 (de uma chave que nunca existe); `503` quando
  algo falha, sem mensagem de erro. `/health` continua leve.
- **`GET /ready` no servidor de tempo real**: a sala `plaza-0` responde a um ping da memória, sem WebSocket nem
  storage.
- `scripts/smoke-api.sh` confere as duas rotas.

### Changed — visual de blocos (IMPL-0033)

- Cada bloco aparece sozinho: o topo fica mais claro que os lados, cada bloco tem um tom próprio (±4,5 %, o mesmo em
  todo cliente) e uma aresta fina e mais escura em volta de cada face. A árvore da praça e os pinheiros deixam de
  parecer massas lisas.
- Sem triângulo nem chamada de desenho a mais; o chão e a paleta não mudam.

### Added — Livro I da saga v2: A Chegada (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas** de `b01-c1-01` a `b01-c3-04`, 1.050 XP, 11 NPCs de mundo (8 novos), 4 props voxel e 6 cosméticos; a primeira página do Caderno abre o Livro II.
- A verificação local da API confirma que a primeira missão do livro persiste no D1, mantém o progresso anterior e concede seus 20 XP uma única vez entre duas sessões.

### Added — Livro II da saga v2: As Casas e os Nomes (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas** de `b02-c1-01` a `b02-c3-04`, 1.050 XP, 8 NPCs de quest, 4 props voxel e 6 cosméticos; a casa de Alba ganha nome e abre o Livro III.

### Added — Livro III da saga v2: O Tempo e as Cartas (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas** de `b03-c1-01` a `b03-c3-04`, 1.050 XP, 8 NPCs de quest, 4 props voxel e 6 cosméticos; a saída `b03-c3-04` abre o Livro IV.

### Added — Livro IV da saga v2: O Bosque e o Lago (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas** de `b04-c1-01` a `b04-c3-04`, 1.050 XP, 8 NPCs de quest, 4 props voxel e 6 cosméticos; o caminho branco abre o Livro V.

### Added — Livro V da saga v2: A Longa Noite (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b05-c1-01`, saída `b05-c3-04`, que abre o epílogo.

### Added — Livro VI da saga v2: O Amanhecer (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b06-c1-01`, saída `b06-c3-04`, que abre o Livro VII.

### Added — Livro VII da saga v2: A Ponte de Gelo (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b07-c1-01`, saída `b07-c3-04`, que abre o Livro VIII.

### Added — Livro VIII da saga v2: O Verão da Vila (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b08-c1-01`, saída `b08-c3-04`, que abre o Livro IX.

### Added — Livro IX da saga v2: As Fundações (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b09-c1-01`, saída `b09-c3-04`, que abre o Livro X.

### Added — Livro X da saga v2: A Próxima Noite (PROPOSTA, atrás das flags existentes, desligado)

- **45 entradas**, 1.050 XP, 4 props e 6 cosméticos, atrás de `QUESTS_V2_ENABLED`; entrada `b10-c1-01`, saída `b10-c3-04`, que abre o pós-jogo.

### Added — missões: epílogo "O ramo da chegada" (PROPOSTA, PEN-025; atrás das flags existentes, desligado)

- **Três missões novas** em `quests-v1`: `bough-ribbon` (15 XP), `bough-sprigs` (20 XP) e `bough-delivery`
  (50 XP), abertas só depois de `story-page-delivery`. O catálogo passa a 18 missões, 6 cadeias e **550 XP**;
  com as quatro missões rápidas, 660 XP e nível 7.
- O epílogo reusa Dona Guida, Seu Nivaldo, a caixa de correio e os dois pontos livres das caixas do mercado;
  não há NPC, coordenada, minijogo, doação, ONG, bandeira, migration ou dependência nova.
- **Um objeto voxel novo**, `winter-sprig` (gerador `quest-winter-sprig`, 0,18 u, 80/200), para a coleta dos
  dois ramos e a entrega final.

### Added — doações e ONGs: testes, diagnósticos e documentação (#65, PROPOSTA, doações desligadas)

- Teste de doações com duas ONGs e uma parceira global fictícias: confere o destino e o valor do split de cada Pix e
  os totais confirmados após a reentrega do webhook.
- Consulta de diagnóstico que conta os Pix globais pagos no D1 local (`apps/api/scripts/count-paid-global-pix.sql`),
  com o comando no dicionário de indicadores.
- [Contrato de beneficiário para o Pix](docs/reference/ngo-beneficiary-contract.md): as três rotas de recebimento, a
  recuperação do vínculo e as decisões pendentes.
- [Dicionário de contagem da Vila](docs/reference/indicator-sources.md): fontes de presença, progresso e doações, o
  tratamento de repetições e as definições pendentes.
- [Evidência do provador gratuito e matriz de compra de cosméticos](docs/implementation/wardrobe-inventory-qa.md).
- [Cadastro, sessão e retorno ao jogo](docs/implementation/visitor-account-access.md), com roteiro local e matriz das
  cinco ações.

### Fixed — candidatura de ONG

- O cadastro de ONG só pede o meio de recebimento quando a API aceita a configuração. Ao trocar de link próprio
  para AbacatePay, a candidatura grava a nova escolha e descarta o link anterior.

### Changed — produção na 0.7.0 e no schema D1 v15

- **A 0.7.0 foi publicada em 2026-11-19** (2026-11-20 02h36 a 02h40 UTC), os cinco Workers, na ordem API → migrations
  → servidor → jogo → painel → site, com autorização do responsável técnico. As migrations `0014` e `0015` foram
  aplicadas em produção (v13 → v15), com ponto de restauração registrado em `docs/reference/releases.md`. Nenhuma
  bandeira mudou.

### Added — runtime da saga v2 (PROPOSTA, atrás de flags)

- **Spine da saga:** manifesto de 484 IDs, catálogo v2 agregado aos dez livros e ao epílogo v1, motor de estados
  parametrizado com paridade v1, marcos, minijogos, mundo e estados de mundo, cosméticos unidos (100 v1 + 60 dos
  livros), UI/API genéricas e verificador de navegador. `QUESTS_V2_ENABLED` e `VITE_QUESTS_V2_ENABLED` ficam
  desligados em produção e homologação; nenhuma história de livro é escrita nesta fatia.

## [0.7.0] - 2026-11-19

**A Vila em quatro anéis, com menos neve, ruas legíveis e casas de ONG em cinco níveis**
([IMPL-0030](docs/decisions/0030-thawed-village-and-readable-streets.md),
[IMPL-0031](docs/decisions/0031-village-rings-zoning-civic-buildings-and-boards.md),
[IMPL-0032](docs/decisions/0032-ngo-building-levels.md)), o logotipo em teste nas três aplicações
([IMPL-0029](docs/decisions/0029-brand-logo-in-the-apps.md)) e a conciliação endurecida das doações
([IMPL-0028](docs/decisions/0028-donation-durable-intent.md)). Schema D1 **v15** no código: as migrations `0014`
(motivo da espera de um evento de doação, aditiva) e `0015` (terrenos dos anéis e casas semeadas de novo) vão para
produção nesta publicação, com autorização; o que foi aplicado e observado fica em
[`docs/reference/releases.md`](docs/reference/releases.md). O clima mudou de versão (`WEATHER_ALGORITHM_VERSION = 2`)
e o raio do mundo passou a 99 u: API, servidor de tempo real e jogo são publicados juntos, nessa ordem. Tudo o que é
**PROPOSTA** segue como proposta: contas, arquivos e fotos de ONG, retirada, bloqueio, remoção de visitante, terrenos
residenciais, doações e os níveis da casa da ONG (`NGO_LEVELS_ENABLED`) seguem **desligados**. Desempenho medido só
em computador; nenhum teste em celular foi feito.

### Added — casa da ONG em cinco níveis, conforme as doações confirmadas (IMPL-0032, **PROPOSTA**; atrás de `NGO_LEVELS_ENABLED`, desligada em produção e homologação; sem mudança de schema)

- **`GET /lots` ganha `ngo_level`** (1 a 5, ou `null`): o total confirmado das doações de cada ONG publicada
  transformado em nível. O valor nunca vem nessa rota. É `null` com `NGO_LEVELS_ENABLED` ou `DONATIONS_ENABLED`
  desligada, em terreno sem ONG publicada e em banco sem a tabela de doações. `GET /config` ganha `ngoLevels`.
- **Cinco construções** com as cores da própria ONG: cabana, chalé com varanda, casa de dois andares, a mesma com
  torre de pedra e luzes, e três andares com estrela na torre. Todas cabem no terreno e têm o colisor do seu nível.
- Limites (marcadores do responsável técnico, a decidir na OQ-23): R$ 500, R$ 2.500, R$ 10.000 e R$ 50.000.
- A prévia local `?villageDemo=full` alterna os cinco níveis.

### Changed — casa de ONG publicada (IMPL-0032)

- Com os níveis desligados (o estado de produção), toda casa publicada é desenhada no nível 1, a cabana de 5 × 5.
  Antes era um chalé de tamanho sorteado pela semente do terreno.

### Added — a Vila em quatro anéis: 80 % para ONGs, prédios cívicos, parques e placas (IMPL-0031, **PROPOSTA**; schema v15; migration 0015 aplicada em produção na publicação da 0.7.0)

- **A Vila cresceu de 82,5 u para 99 u de raio**, em quatro anéis atrás da praça. O plano virou uma lista de anéis
  com um zoneamento por meia fileira; acrescentar um anel não move nem renomeia nada do que existe.
- **97 terrenos de ONG e 23 casas** (80,8 % das parcelas para ONGs; eram 12 terrenos e 112 casas). Os doze terrenos
  da praça ficaram onde estavam, com os mesmos ids. Os novos são `ring1-01`…`ring4-30`; o número na tela conta todos
  os terrenos da Vila ("Terreno 13" é o primeiro do primeiro anel).
- **Onze prédios cívicos como cenário** (banco, cantina, academia, escola, cinema, teatro, mercado, hospital, Posto
  do Trenó, galeria e ginásio), **três parques e duas praças**. Cada um tem nome, painel próprio ("Ver prédio",
  "Ver parque", "Ver praça") e a frase de que nada é vendido nem atendido ali. O Posto do Trenó ocupa o lugar do
  posto de gasolina pedido: a Vila segue sem veículos.
- **37 placas em quatro formatos** (placa de telhado, outdoor, placa de jardim e telão), com o tamanho das artes
  definido em `docs/reference/display-boards.md`. Todas mostram avisos da própria Vila; arte de terceiros não está
  implementada e depende da OQ-18.
- **Migration 0015:** insere os 85 terrenos dos anéis e semeia `residential_plots` de novo; não toca nos terrenos da
  praça. `GET /lots` passa a listar 97 terrenos depois dela, a praça primeiro; `GET /residential-plots` lista 23.
- **Explorar ONGs** agrupa os terrenos por rua, com as casas publicadas primeiro; o mapa (P10) mostra as ruas dos
  anéis, os prédios e os parques.
- **Prévia local `?villageDemo=full`** (só em build local ou de desenvolvimento): desenha uma casa em cada terreno
  para medir o orçamento de desenho; uma Vila publicada ignora o parâmetro.

### Changed — desenho e navegação para a Vila maior (IMPL-0031)

- Os chalés das ONGs publicadas passam a ser assados em blocos (um por lado de cada anel), em vez de uma malha por
  chalé; o chão é desenhado em nove pedaços; tudo o que fica nos anéis é um bloco por anel e por lado. Com uma casa
  em cada um dos 97 terrenos, a pior vista medida tem 139 chamadas de desenho e 217 480 triângulos (limites: 150 e
  250 000).
- Navegação: a grade passou de 436 921 para 628 849 células e a memória de busca de 4,4 MB para 6,3 MB; os limites
  dos testes subiram para 7 MB e 150 000 células expandidas.
- O rótulo "Terreno disponível" aparece só a menos de 13 u do avatar.
- **Publicar junto:** o servidor de tempo real com o cliente (o limite de posição acompanha o raio do mundo).

### Changed — cena: menos neve, ruas legíveis e casas variadas (IMPL-0030, **PROPOSTA**; sem mudança de schema)

- **A neve virou detalhe.** O chão da Vila passa a ser grama com geada e manchas de neve, a praça é de pedra
  quente e a neve só toma o chão na borda do mundo. Nos telhados ela fica na cumeeira; pinheiros, muros e cercas
  têm cerca de um terço da neve de antes.
- **Ruas legíveis.** Asfalto, paralelepípedo escuro e terra batida no lugar da "neve batida", sem manchas de neve
  sobre a rua; meio-fio claro dos dois lados; cruzamentos calçados onde uma rua cruza uma avenida; vielas de tijolo;
  um poste por lado também na rua econômica. O contraste entre rua e quintal foi de 1,2–1,6 para pelo menos 3:1.
- **Clima v2** (`WEATHER_ALGORITHM_VERSION = 2`): céu limpo em 42 % das janelas (era 12 %), nevasca em 2 % (era
  5 %), névoa mais leve e flocos menores. **Publicar API e cliente juntos:** versões diferentes não sincronizam.
- **Casas residenciais com quatro formas** sorteadas pela semente do terreno (chalé, água-furtada, sobrado, casa
  com terraço), mais cores de parede e de telhado, paredes em enxaimel, tábuas ou tijolos, base de pedra,
  venezianas e canteiros. Pegada, colisores e altura máxima de cada faixa não mudaram.

### Added — identidade: logotipo da marca nas três aplicações (IMPL-0029, logo final **PENDENTE**, PEN-016)

- O logotipo Modelo B (render voxel em teste) passa a ser a marca do site (cabeçalho e rodapé), do jogo (tela de
  carregamento e barra do HUD) e do painel administrativo (entrada, estados de sessão e cabeçalho); o favicon dos
  três apps vira a estrela do logotipo e a imagem de compartilhamento do site passa a ser a peça 1200 × 630 com a
  marca, sem slogan. A aprovação da logo final continua pendente (DEC-024, PEN-016).

### Added — documentação de marca

- Roteiro local para elaboração de manual da marca em `docs/skills/`, identificado como **PROPOSTA** e vinculado às decisões do produto.

### Fixed — doações: conciliação endurecida antes de ligar (IMPL-0028, **PROPOSTA**; schema v14 no código; atrás de `DONATIONS_ENABLED`, desligada)

- **A repetição com a mesma `idempotencyKey` é respondida antes do limite de abuso** (`DONATION_LIMITER`) e não
  consome o limite; uma chave nova continua passando pelo limite antes de qualquer gravação.
- **Um `transparent.completed` atrasado não tira mais a doação de `under_dispute`** nem credita o Título de novo; só o
  resultado da própria disputa devolve a doação a `paid`.
- **Evento do webhook recusado pela guarda de status não é mais gravado como processado:** fica em
  `abacatepay_pending_events` como `transition_refused`, visível ao operador e nunca aplicado sozinho; a resposta é
  `{ok: true, applied: false, refused: true}`.
- **Ações do operador:** `POST /admin/donations/intents/:id/resolve` (encerra intenção `unknown` ou `pending_provider`
  parada como `failed`/`resolved_by_admin`) e `POST /admin/donations/events/:id/dismiss` (dispensa evento em espera),
  só para administradores, auditadas, sem chamar o provedor. Uma intenção que guarda a cobrança do provedor nunca é
  encerrada (`409 intent_has_charge`), nem o evento que espera por ela é dispensado: a repetição com a mesma chave
  conclui a doação.
- **Migration `0014_pending_event_hold_reason.sql`** (coluna `hold_reason`, aditiva): aplicada em produção na publicação da
  0.7.0. Com as doações ligadas e o banco em v13, as rotas de doação respondem
  `503 schema_outdated`.

### Changed — produção no schema D1 v13

- **A migration `0013_donation_durable_intent.sql` foi aplicada em produção** (2026-11-15 01h27 UTC, aditiva, depois
  da publicação da 0.6.0, com ponto de restauração registrado em `docs/reference/releases.md`). As tabelas novas só são
  lidas com `DONATIONS_ENABLED` ligada; hoje desligada.
- **Prévias pagas do provador registradas como OQ-21** em `docs/decisions/open-questions.md` (seguem ocultas).

## [0.6.0] - 2026-11-14

**Pranchas e provador P08, auditoria técnica (fases 1 e 2) e endurecimento**
([IMPL-0026](docs/decisions/0026-boards-ui-and-character-appearance.md),
[IMPL-0027](docs/decisions/0027-cosmetic-shop-wardrobe.md), [IMPL-0028](docs/decisions/0028-donation-durable-intent.md)).
Schema D1 **v13** no código: a migration `0013` (intenção durável de doação) **não** foi aplicada em produção nesta
publicação; produção segue em **v12**, e tudo o que lê as tabelas novas está atrás de `DONATIONS_ENABLED`, desligada.
O protocolo de presença muda (o visual vai como código compacto do catálogo): cliente e servidor são publicados
juntos, e uma aba antiga só tem a mensagem de visual descartada. Contas, arquivos e fotos de ONG, retirada, bloqueio,
remoção de visitante, terrenos residenciais e doações seguem **desligados**; as prévias pagas do provador ficam
ocultas até a PEN-022.

### Fixed — doações: intenção durável antes do provedor (IMPL-0028, **PROPOSTA**; schema v13; tudo atrás de `DONATIONS_ENABLED`, desligada)

- **A cobrança Pix tem uma intenção durável antes da chamada à AbacatePay.** `POST /donations/pix` grava a linha em
  `donation_intents` antes do provedor e registra nela a resposta. O provedor é chamado **no máximo uma vez por
  `idempotencyKey`**: repetir devolve a mesma doação, ou `409` (`donation_in_progress`, `donation_intent_unknown`,
  `donation_intent_failed`, `idempotency_key_reused`), sem nova chamada. Tempo esgotado, erro do provedor ou intenção
  parada há mais de 60 s ficam `unknown`/`failed` para o operador, e o jogo começa um novo pedido com outra chave.
  Quando o provedor respondeu e o D1 falhou, a resposta é copiada na intenção e a repetição com a mesma chave
  conclui a doação a partir dela. Erro de configuração do provedor não grava intenção.
- **Webhook antes da doação não se perde.** Um evento sobre cobrança ainda sem doação não é marcado como processado:
  fica em `abacatepay_pending_events` e é aplicado na ordem de chegada quando a doação existe.
- **Visão do operador.** `GET /admin/donations/overview` traz `reconciliation`: intenções `unknown` ou paradas e eventos
  em espera, com a idade de cada um.
- **Limite de abuso.** `DONATION_LIMITER` (10 pedidos por 60 s) por conta ou por hash do endereço, sem gravar o IP.
- **Migration `0013_donation_durable_intent.sql`** (aditiva; **não aplicada no remoto**). Sem ela, com as doações
  ligadas, as rotas que a exigem respondem `503 schema_outdated`.
- **Mudança incompatível (rota desligada):** `POST /donations/pix` sem `idempotencyKey` responde `400`; o jogo, único
  chamador, já envia a chave.
- **PENDENTE:** se a AbacatePay deduplica por `externalId` não pode ser confirmado pelo repositório (ver IMPL-0028).

### Changed — geometria de voxels mais leve (auditoria de 14/11/2026, §3.5)

- **A geometria estática deixa de carregar o centro do voxel.** Sólido e janelas não guardam mais `aCenter`, que só os
  shaders de lâmpadas, folhagem e seres "idle" leem: a geometria fixa da Vila cai de ~19,0 MB para ~15,7 MB de
  atributos e índices (−17 %), sem mudança visual (`verify.mjs` e `verify-fullroom.mjs` passam, orçamento igual).

### Fixed — presença: reserva de deslocamento por tempo (auditoria de 14/11/2026, §8; sem mudança de protocolo)

- **Mandar poses com mais frequência não dá mais distância.** O anti-teletransporte da sala passa a usar uma reserva
  de deslocamento que recarga com o tempo (125 % da velocidade máxima, teto de 1 s de caminhada), em vez de uma folga
  fixa somada a cada pose. Poses que chegam juntas depois de um atraso da rede passam sem corte; antes, a folga fixa
  cortava até o cliente legítimo.
- **Teste de carga entre salas.** `apps/server/scripts/load-rooms.mjs`: sala cheia e `4001` para a próxima, três
  salas, reconexão em massa e um leitor lento (só local).

### Fixed — fase 2 da auditoria técnica de 14/11/2026 (sem mudança de schema, de rota ou de protocolo)

- **A Vila avisa quando o 3D não abre.** Se o código da cena não baixa, o navegador não tem WebGL ou o contexto
  gráfico se perde e não volta em 8 s, aparece "A Vila em 3D não abriu neste aparelho." com "Tentar de novo"; os
  caminhos do topo continuam funcionando. Uma perda breve mostra só um aviso e a Vila volta sozinha.
- **Verificações locais sem ruído do Google.** `verify-life.mjs` e `verify-collisions.mjs` passam a isolar a tag do
  Google (resposta vazia e erros de CSP ignorados), como `verify.mjs` já fazia; `verify-live.mjs` continua estrito.
- **Sala cheia verificada.** `verify-fullroom.mjs` põe 40 pessoas numa sala (39 visuais distintos, depois trocas de
  visual e reconexões, depois um visual só) e falha acima de 150 chamadas ou 250 000 triângulos, ou se o número de
  chamadas mudar com os visuais. Depende da correção dos avatares remotos (fase 1).
- **`verify-life.mjs` diz quando as missões estão desligadas.** A checagem do NPC de missão passa a ler a mesma
  bandeira que o jogo lê (`?quests=1` e o `/config` da API, exposta como `extra.questsOn`). Com a API local parada,
  ela falha com "quests are off" em vez de "no action button next to Seu Nivaldo", que parecia defeito do jogo.

### Security

- **`main` protegida.** Merge só por PR com o CI `typecheck · test · build` verde, sem push forçado nem exclusão,
  valendo também para administradores.

### Fixed — fase 1 da auditoria técnica de 14/11/2026 (sem mudança de schema; rota alterada só atrás de `ACCOUNTS_ENABLED`)

- **Sala cheia dentro do orçamento de desenho.** Os avatares remotos eram 5 malhas instanciadas por visual
  diferente, todas com sombra: 39 visuais distintos custavam até 391 chamadas, mais que o orçamento inteiro (150).
  Agora todos os remotos são uma malha só, com as matrizes das partes numa textura de floats: 3 chamadas no total.
  Medido no navegador com 40 pessoas na sala (39 visuais distintos): 95 chamadas e 171 502 triângulos no preset
  médio, 109 e 175 124 no alto.
- **Bloom acompanha a resolução adaptativa.** `PostFx` passa a seguir a mudança de DPR (antes só seguia o tamanho
  em CSS) e libera os passes que cria (render, bloom e saída), não só o compositor.
- **Conta trocada em outra aba.** `POST /me` (correção) e `DELETE /me` (exclusão) exigem a conta que a página
  mostra (`accountId` no corpo; `X-Vila-Account` na exclusão) e respondem `409 account_changed` antes de qualquer
  escrita, como as demais escritas da conta. Contas seguem desligadas em produção.
- **Personagens da Vila.** A fala de um personagem parado usa o lugar onde ele está (`at`), não o destino para
  onde vai sair; o desvio local de um personagem largo (Papai Noel, renas) é validado com o raio do próprio corpo,
  não com o do avatar.

### Added — o provador P08: dez categorias, 100 itens, inventário e prévia (IMPL-0027, **PROPOSTA**; sem schema novo)

- **Prévias pagas ocultas até a PEN-022** (decisão do responsável na revisão do PR #48): o provador mostra só os 80
  itens gratuitos, sem selo "Pago", "Ver compra" ou texto de compra, e a presença recusa um visual com item pago.

- **O catálogo de visuais passa a ter as dez categorias da P08** (capacete, blusa, calça, vestido, sapato, costas,
  rosto, mão esquerda, mão direita e especial), com **100 entradas**: 80 gratuitas liberadas por missão ou nível 2 e
  20 pagas. O item "sem item" existe nas seis categorias em que faz sentido; um vestido repõe blusa e calça e vestir
  blusa/calça tira o vestido. Os modelos de voxels são explícitos e cabem no orçamento de 40 voxels / 140 faces.
- **As quatro lojas abrem o provador da Vila** sem deixar de estar fechadas: categorias da loja, retrato com prévia,
  dez cartões por categoria, "Em uso", requisito dos itens fechados, "Equipar", o inventário ("No inventário: X de
  80 visuais gratuitos") e "Só o que eu tenho". Nada é vendido e a loja continua dizendo que está fechada.
- **O cartão pago só mostra "Pago" e "Ver compra"**, que revela "A compra de visuais não está disponível."; não há
  preço, moeda, desconto, contagem regressiva nem pagamento simulado. A compra paga real é o D21 e continua bloqueada
  pela PEN-022. "Visuais pagos são compras de aparência. Doações são separadas."
- **O visual mudou para `vila.look.v2`** e migra uma vez o `vila.look.v1` (`hat`→`helmet`, `sweater`→`blouse`;
  `scarf`/`palette` saem). A presença leva o look em `["k", código]`, um índice base36 por slot (o padrão é
  `0000000000`), dentro dos 96 bytes da mensagem.
- **Verificação:** `scripts/verify-shop.mjs` entra nas quatro lojas em 1440×900 e 390×844, confere 10 itens por
  categoria, prévia sem equipar, equipar com persistência, a troca de capacete, a regra vestido ↔ blusa/calça, o
  cartão pago sem preço e o item fechado com requisito; `verify.mjs` cobre o painel da loja e o orçamento, e
  `verify-boards.mjs` captura a P08.

### Added — as pranchas P01–P15 na interface do jogo (IMPL-0026, **PROPOSTA**; sem mudança de schema, de rota ou de protocolo)

- **A barra do topo tem a marca e quatro caminhos.** A tela de jogo volta a mostrar a marca provisória e ganha
  "Indicar uma ONG" ao lado de "Explorar ONGs", "Jogar" e "Doação global"; no celular são duas linhas, com os
  quatro caminhos em duas colunas. Isso substitui em parte a IMPL-0022 (OQ-16 continua aberta) e está registrado
  na IMPL-0026.
- **Uma linguagem visual só, a das pranchas.** Paleta verde-pinho/creme/vermelho/dourado, folhas de tela com
  seções numeradas, etapas, abas em pílula, avisos e faixa de fluxo (`ui/sheet.tsx`); no celular a folha ancora
  no pé da tela. Indicadores, terreno e casa, conta, candidatura e missões foram refeitos nessa linguagem sem
  mudar nenhuma regra de dado.
- **Telas novas.** Convite a uma ONG (mensagem editável, link, WhatsApp, e-mail), catálogo de minijogos (só o Jogo
  da Memória), mapa esquemático da Vila com o estado dos terrenos e "Voltar à praça", aparência do personagem
  (base, cabelo, cores, altura, barba e bigode) com retrato em SVG e os visuais gratuitos, e os badges do doador
  com as faixas de `TITLE_TIERS` e a faixa da conta.
- **Aparência é local ao navegador** (`vila.appearance.v1`): o avatar do próprio visitante e o retrato a usam; os
  demais continuam vendo o visual sincronizado. Enviá-la pela presença estouraria o orçamento de chamadas por
  quadro; a razão e o caminho ficam na IMPL-0026.
- **O que ficou de fora, com a razão registrada:** chat (P05) e emoji sobre avatar (P06) — o protocolo de presença
  não carrega texto livre; itens pagos (P08) — sem provedor de pagamento; projetos/áreas públicas (P04), convite a
  empresa (P11), outros jogos (P09) e "Exibir na Vila" (P15). Nenhuma bandeira foi ligada.
- **Verificação de navegador:** `scripts/verify.mjs` passa a exigir a marca e os quatro caminhos;
  `scripts/verify-boards.mjs` abre cada prancha em 1440×900 e 390×844 e guarda as capturas em `verify-output/`.

### Fixed — datas em dd/mm/aaaa e o texto dos badges

- **A data de abertura do CNPJ é digitada em dd/mm/aaaa.** O campo nativo do navegador mostrava `mm/dd/yyyy`
  quando o sistema estava em inglês; agora é um campo de texto com máscara `dd/mm/aaaa`, convertido para o
  `YYYY-MM-DD` que a API guarda (o mesmo formato aparece na revisão da candidatura e no painel administrativo).
- O painel de badges passou a dizer **"Suas badges"** (antes "Meus badges").

### Changed — documentação de operação

- **Registro de publicações** ([`docs/reference/releases.md`](docs/reference/releases.md)), começando pela 0.5.0
  (commit, hosts, schema D1 v12, bucket R2, bandeiras por Worker, conferências e o que não foi verificado); guia
  de deploy, armazenamento, arquitetura, índices e ROADMAP deixam de dizer que as migrations 0010–0012, o bucket
  R2 e o apelido `client.*` não estavam em produção.

## [0.5.0] - 2026-11-14

**Moderação, entrada direta na Vila, expansão e vida na Vila**
([IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md) a
[IMPL-0025](docs/decisions/0025-village-life.md)). Schema D1 **v12**: as migrations `0004` a `0012` foram aplicadas
em produção nesta publicação. Contas (`ACCOUNTS_ENABLED`), arquivos e fotos de ONG, retirada, bloqueio de conta,
remoção de visitante, terrenos residenciais e doações seguem **desligados** em produção; o que é PROPOSTA continua
PROPOSTA (OQ-11, OQ-14, OQ-15, OQ-17, OQ-18, OQ-19, OQ-20; PEN-004, PEN-006).

### Added — vida na Vila (IMPL-0025, **PROPOSTA**; sem mudança de schema, de rota ou de protocolo)

- **A Vila ganhou gente e bichos que andam.** Trinta personagens numa tabela só: Papai Noel, 3 duendes, 4 lojistas,
  o lenhador, 6 moradores, 3 visitantes da temporada, 2 renas em cercados, 2 cachorros, 2 gatos, 4 passarinhos, um
  coelho e a coruja. Cada um tem rotina pelo relógio da Vila: os lojistas ficam à porta das lojas das 9:00 às 19:00
  (as lojas estão fechadas), o lenhador racha lenha no pátio e leva achas pela travessa norte, os duendes
  levam enfeites do trenó para perto da árvore, dois vizinhos conversam num banco, visitantes leem as placas. À
  noite (22:00–7:00) as pessoas estão em casa e a coruja aparece; na neve forte as ruas esvaziam. Os moradores e
  bichos que eram decoração são os mesmos (mesma semente, mesmo boneco) e agora andam. O elenco, os nomes, as
  rotinas e as falas são proposta do responsável técnico (OQ-20).
- **Iguais para todos, sem servidor.** Onde cada personagem está é uma função pura da semente do mundo, da hora
  sincronizada e do plano da Vila (`sampleLife`, `packages/shared/src/game/life.ts`): cada navegador calcula, e
  todos veem o mesmo. Nenhuma mensagem nova, nenhum estado no Durable Object, nada no D1. Medido com dois
  navegadores na mesma máquina: relógios a 2,2 ms um do outro, maior diferença de posição 0,012 u em 42 480
  comparações; para a mesma hora, posições idênticas bit a bit.
- **Não atravessam nada e não se sobrepõem.** Todo ponto e todo caminho ficam em chão livre, nas ruas e trilhas;
  cada personagem tem os seus pontos, grupos andam um de cada vez e grupos diferentes nunca se encontram
  (conferido por teste, estático e por amostragem de 24 h).
- **Conversar.** Perto de um personagem parado, o botão de ação oferece "Conversar com …" (E, Enter ou toque;
  clicar no personagem leva o avatar até ele; no modo de moderação, o toque que seleciona um visitante não anda
  até o personagem nem conversa com ele). A fala são duas ou três linhas fixas, escolhidas por quem é, onde
  está, a hora e o clima, e um botão "Continuar". Lojista e lenhador dizem o que o lugar é, que está fechado e
  "Nada é vendido na Vila." (nenhuma fala diz "ainda não abriu" nem o que um lugar "vai" ser: isso anunciaria o
  que ninguém decidiu); Papai Noel e os duendes apontam a árvore e as casas das ONGs; um morador comenta o
  clima e aponta um dos três caminhos. **Sem IA**, sem chat, sem texto livre, sem pergunta a quem visita. O botão
  nunca toma o lugar da árvore, de um terreno de ONG ou de um NPC de quest.
- **Reações.** Um personagem dá passagem ao avatar (o seu e o dos outros visitantes); o cachorro chega perto e
  abana o rabo, o gato e o coelho mantêm distância, o passarinho pula para longe, a rena levanta a cabeça, a
  pessoa parada vira e acena. É só no seu aparelho, até 1 u do lugar do personagem, e volta sozinho.
- **Papai Noel reconhecível sem rótulo.** O avatar padrão também usa casaco vermelho e gorro de Noel; o Papai
  Noel é o maior boneco da Vila, barrigudo, de cinto preto com fivela, barba branca sobre o peito e saco de
  presentes nas costas.
- **Dois cercados de renas** na faixa da praça, ao lado das travessas do sudeste e do sudoeste.
- **Configurações:** "Mostrar os moradores e os animais da Vila" (ligado por padrão; "Menos movimento" tira o
  balanço dos personagens).
- `apps/client/scripts/verify-life.mjs`: conferência em navegador real, só local.

### Changed

- **Moradores e bichos deixaram de bloquear o avatar.** Os três moradores, o cachorro, o gato e o coelho que
  ficavam parados como decoração agora andam e saem da frente; o gato desceu do banco para o chão ao lado dele.
  É a única exceção à regra dos colisores (IMPL-0016), registrada no `AGENTS.md`. `CRITTERS` saiu de `world.ts`.
- **Desenho.** O elenco inteiro custa uma chamada de desenho (duas com a sombra), no lugar das nove peças de
  decoração, que custavam uma ou duas cada. No spawn (Média, 12:00 com neve): de 103 para 93 chamadas e de
  113 450 para 139 274 triângulos (personagens e a sombra deles); a pior das 18 vistas medidas tem 124 chamadas e
  196 mil triângulos, dentro do orçamento de 150 e 250 mil. Não medido em celular.

### Added — expansão da Vila (IMPL-0024, **PROPOSTA**; schema D1 v12)

- **A Vila cresceu em volta da praça.** A árvore continua no centro; dela saem 8 avenidas e 8 travessas. Em volta
  da praça ficam 12 terrenos reservados a ONGs (os 8 que existiam, com os mesmos ids, e mais 4) e 4 lojas de Natal;
  depois, três anéis de terrenos residenciais: 16 premium, 32 padrão e 64 econômico. O raio do mundo foi de 34 para
  82,5 u. Do terreno mais distante até a árvore são 8,2 s a pé (68,5 u de caminho). O layout é derivado de um
  plano só (`VILLAGE_PLAN`); o cenário da praça é posto à mão para esse plano, e `assertPlan` recusa o plano que
  não dá para desenhar. Os ids de terreno são posicionais: depois da migration 0012 aplicada, mudar o plano exige
  uma migration nova.
- **Terrenos residenciais visíveis, posse desligada.** Chegar perto de um terreno e usar a ação (E, Enter ou toque)
  mostra o terreno e o bairro ("Terreno 12 · Bairro da Floresta") e uma frase neutra: "Os terrenos residenciais não
  têm dono. A posse por jogadores é uma proposta em estudo e ainda não foi decidida." Sem "em breve", sem requisito
  e sem nível: nenhuma decisão de produto permite que um jogador tenha um terreno (DEC-028), e isso fica como
  pergunta aberta (OQ-17), atrás de `RESIDENTIAL_PLOTS_ENABLED`, `"false"` em produção e homologação. As faixas
  aparecem na tela como bairros ("Bairro do Centro", "Bairro do Meio", "Bairro da Floresta"), nomes sem sentido de
  preço; `premium`, `standard` e `economy` são ids internos. O requisito de uma faixa (um nível alcançado jogando,
  nunca um preço: não há moeda, valor nem botão de compra) só aparece com a bandeira ligada, e o painel diz quando
  as missões abertas não chegam a esse nível.
- **Lojas e placas, como marcadores.** Cada loja é uma construção com porta; o painel diz o nome, o tema e que
  ela está fechada, sem prometer venda nem abertura ("Esta loja está fechada. Se e como ela vai funcionar ainda
  não foi decidido. Nada é vendido na Vila."). Cada loja tem uma placa no telhado com um aviso da própria Vila; o
  painel da placa mostra o aviso em texto e "As placas mostram avisos da própria Vila." (OQ-18).
- **Terreno de ONG que a API ainda não lista** (banco antes da migration 0012: produção tem 8 dos 12): o rótulo 3D,
  o painel e a lista "Explorar ONGs" dizem "Terreno em preparação", sem convite para candidatura, e a visita a ele
  não conta como missão.
- **Um botão de ação para tudo o que está perto.** Terreno residencial, porta de loja e placa usam o botão de ação
  contextual do HUD e as mesmas regras de casa, terreno de ONG, árvore e morador (IMPL-0022): E abre com qualquer
  foco, Enter só com o foco fora de um controle, tecla mantida pressionada abre uma vez, o botão some com um painel
  ou o menu aberto. Os três painéis fecham pelo "×", pelo Esc e por um clique fora, como os demais.
- **As faixas se reconhecem pelo ambiente:** calçamento (pedra, neve batida, neve pisada), frente do terreno (muro
  com portão e lanternas, cerca de ripas, lanterna numa estaca), o que fica entre vizinhos (jardim com arbustos,
  cerca-viva, lenha empilhada), tamanho da casa e postes de rua.
- API: `GET /residential-plots` (pública; estado de cada terreno, nunca o dono) e `residentialPlots` em
  `GET /config` (o mesmo valor do `enabled` da rota). A resposta é sempre o layout inteiro: com a bandeira
  desligada o banco nem é lido; ligada, tabela ausente, linha ausente ou erro de banco respondem "indisponível",
  nunca `500`.
- Migration `0012_village_expansion.sql`: move os 8 terrenos de ONG (mesmo estado, mesma ONG), acrescenta 4 e cria
  `residential_plots` (id, faixa e posição; sem coluna de preço e **sem colunas de posse**, que só entram com a
  migration que trouxer a rota de posse, [OQ-17](docs/decisions/open-questions.md)).
- Prontos para as próximas fases: rede de ruas (`PATH_GRAPH`), lugar do lojista em cada loja, pátio da lenha, lugar
  da lareira em cada casa.

### Changed — expansão da Vila (IMPL-0024)

- O lago, o trenó com as renas, o trenó pequeno, duas lanternas e dois NPCs das quests mudaram de lugar, para
  dentro da faixa festiva da praça; um morador decorativo saiu de onde passa uma avenida. Os terrenos de ONG
  ficam agora a cerca de 31 u da árvore (eram 22 u).
- Enquanto a câmera não vê o peito ou a cabeça do avatar (uma construção, a árvore ou um pinheiro no caminho), ele
  é desenhado mais uma vez, nas próprias cores e meio transparente, por cima de tudo. O teste é uma reta da câmera
  ao avatar contra o mapa de colunas de cada construção (antes: a pegada de uma construção ao sul e um contorno
  vermelho chapado, que aparecia com o avatar à vista e faltava atrás de esquinas e da árvore). O desenho aparece
  na hora e fica por 250 ms depois que o avatar volta a ser visto, para não piscar nos vãos entre os chalés de
  uma fileira. Só o próprio avatar; os outros visitantes não têm esse desenho.
- "Olhar o céu" sobe a câmera por cima dos telhados onde uma construção ficaria na vista (ruas residenciais); na
  praça a vista é a de sempre.
- O botão de ação de um terreno residencial só aparece com o avatar parado, e o alvo oferecido tem histerese: numa
  rua econômica o botão ficava na tela em 83 % do trajeto, trocando 15 vezes; agora, 0 %.
- Desempenho: a floresta e as montanhas são desenhadas em pedaços que a câmera descarta um a um (os mesmos
  triângulos de antes): o quadro mais caro de um roteiro a pé com o zoom todo afastado foi de ~252 mil para ~196 mil
  triângulos (orçamento: 250 mil), e o ganho é parecido no zoom padrão.
- Verificação: `verify.mjs` abre o painel de uma loja, de uma placa e de um terreno residencial e confere o texto,
  e falha se o spawn passar de 150 chamadas ou 250 mil triângulos (zoom padrão e todo afastado, preset Média).
  Também clica numa loja com o mouse, na própria cena (de longe: nada anda enquanto o botão está apertado, e o
  clique anda até a porta; da porta: o painel abre e nada anda depois do Esc), e confere que o avatar é desenhado
  por cima da loja atrás da qual está e deixa de ser no spawn.
  Os colisores da cena vêm de `scene/sceneColliders.ts`, que a auditoria de colisores confere: tirar os dos chalés
  residenciais agora falha num teste unitário.
- Testes: os testes que percorrem a Vila inteira (auditoria de colisores, rotas, sombras) têm limite de tempo
  explícito, de pelo menos dez vezes o tempo numa máquina ociosa; a auditoria de `sceneColliders` estourava os 5 s
  padrão no CI (5,6 s). A regra do toque na cena passou a ter teste que falha (`pressScene`,
  `scene/Ground.test.tsx`).
- Celular: os botões "Ir até lá" da lista "Explorar ONGs" têm 44 px de altura (eram 36 px, em 12 linhas); um
  rótulo 3D que cairia embaixo de um botão ou aviso do HUD fica escondido até sair de lá.
- Menu → Controles e Ajuda dizem o que um clique faz em cada coisa: árvore, casa de ONG e terreno abrem o painel;
  loja, placa e casa residencial levam o avatar até lá e, de perto, abrem o painel.
- Um clique, uma intenção: clicar numa construção não deixa mais uma caminhada esperando o painel fechar; de longe,
  o avatar anda até o ponto de uso e o marcador do toque fica lá; um toque num telhado que cobre a rua anda até o
  ponto da rua. No modo moderação (PROPOSTA, IMPL-0021), o toque sobre outro visitante o seleciona esteja ele
  onde estiver (campo aberto, piso de um terreno, porta de loja, frente de um chalé ou da árvore), e esse toque
  não anda nem abre painel.
- Painel do terreno de ONG: com dois terrenos vizinhos ao alcance, abre o mais próximo. Um terreno que a API ainda
  não lista (banco antes da 0012) não oferece candidatura e aparece como "Terreno em preparação" (os 12 terrenos
  aparecem na lista "Explorar ONGs", cada um com "Ir até lá").
- Desempenho: o chão é desenhado em faixas de mesma cor e a floresta em oito setores. Os blocos residenciais e os
  setores da floresta só entram na passada de sombra enquanto a sombra de alguma peça deles aparece na tela, e as
  janelas e lanternas dos blocos são duas malhas para a Vila inteira; a imagem não muda. A cena no spawn foi de 70
  chamadas e ~122 mil triângulos para 102 e ~165 mil (preset Média, 12:00 com neve); com o zoom todo afastado
  sobre a praça (15:30, céu limpo) são 116 chamadas e ~211 mil triângulos, dentro do orçamento de 150 e 250 mil
  (eram 152 e ~274 mil). A grade de navegação cobre o mundo novo com a mesma célula de 0,25 u; o rascunho da busca
  ocupa 4,4 MB (10 bytes por célula) e o plano que mais expande, numa amostra de 18 mil pares aleatórios, leva
  6,5 ms (83 mil células).
- Painel administrativo: a bandeira nova aparece em "Sistema" como "Posse de terrenos residenciais (PROPOSTA)".
- Verificação: `verify-accounts.mjs` chega à casa publicada por "Explorar ONGs" → "Ir até lá" (antes andava até a
  posição antiga do terreno e, com os arquivos ligados, como roda no CI, não chegava) e confere os 12 terrenos na
  lista; as coordenadas de `verify-collisions.mjs` e `verify-quests.mjs` são as do plano novo.

### Changed — chegada direta na Vila e HUD enxuto (IMPL-0022, PROPOSTA do responsável técnico; OQ-16)

- Jogo: **a página abre direto na praça.** Não há mais painel de boas-vindas nem botão "Entrar na Vila": o primeiro
  clique ou toque no chão já anda. Quem ainda não andou neste navegador vê uma linha, "Clique ou toque no chão
  para andar.", que não recebe cliques, some no primeiro passo (ou 20 s depois de a cena aparecer) e não volta
  depois dele (o navegador guarda só `vila.moved.v1 = 1`). Fora das telas de toque a linha continua: "Sem mouse:
  “Explorar ONGs” leva até uma casa e Esc abre o menu." Ela é anunciada uma vez a leitores de tela e dá lugar ao
  botão de ação, a um painel, ao menu e ao bloco de moderação.
- Jogo: os **três caminhos** (Explorar ONGs, Jogar, Doação global) ficam no HUD desde a chegada, num único grupo de
  navegação e sempre com o nome; no celular, numa linha própria (P01, DEC-008). A "Doação global" ganhou botão no
  HUD; o painel de doação não mudou nesta entrega (botões desabilitados com a nota de sempre, IMPL-0002; a doação Pix
  da IMPL-0023 fica atrás de `DONATIONS_ENABLED`).
- Jogo: o HUD passou a ser montado em fluxo (topo, avisos, pé), de 320 px ao desktop: grupos, faixa de moderação,
  presença, Missões e avisos não se sobrepõem, e o centro da tela fica livre. O aviso passageiro (`toast`) deixou a
  posição fixa. Estados de passar o mouse, pressionar e "ligado" iguais em HUD e painéis; dica flutuante só onde o
  controle fica sem nome visível ou com o apelido abreviado, sempre dentro da tela. Chips do HUD com 44 px de
  altura; em telas de até 360 px de largura, a largura mínima do chip cai de 44 para 40 px (a altura não muda).
  Em tela baixa (celular deitado) o bloco de moderação e o aviso de remoção encolhem e rolam por dentro, em vez de
  cobrir o pé da tela.
- Jogo: no botão da conta, "(bloqueada)" aparece sempre inteiro. Apelido com mais de 12 caracteres é abreviado no
  botão ("@nome_muito_…"), e a dica flutuante mostra o texto completo.
- Jogo: **Esc fecha uma camada por toque**: confirmação aberta → cancela a confirmação (antes fechava o painel
  inteiro); painel aberto → fecha o painel; nada aberto → abre o menu do jogo. Num campo de texto o Esc não abre o
  menu; tecla mantida pressionada conta uma vez.
- Jogo: **Enter pertence ao controle em foco.** Com o foco num botão, link ou campo, Enter aciona esse controle e
  não abre o que está perto do avatar (ao lado da árvore, Enter sobre "☰ Menu" abria a doação global). **Muda em
  relação à versão anterior:** Enter com o foco num botão do HUD (por exemplo, depois de "Explorar ONGs → Ir até
  lá") deixou de abrir a casa ao lado. A tecla E continua abrindo o que está perto com qualquer foco, e Enter
  também, com o foco na página ou na cena. Tecla mantida pressionada abre uma vez, e Enter segurado não aciona de
  novo um botão do HUD (segurar Enter em "Continuar" reabria o menu). A regra substitui a da IMPL-0021, que valia
  só para os controles de moderação; "Controles" explica a diferença entre Enter e E.
- Jogo: as opções de qualidade, conforto, som e outros visitantes aparecem no painel "Ambiente" e em
  "Configurações" do menu, pelo mesmo componente.
- Verificação: os scripts de navegador (`verify.mjs`, `verify-live.mjs`, `verify-collisions.mjs`,
  `verify-quests.mjs`, `verify-accounts.mjs`) não clicam mais em "Entrar na Vila": conferem a chegada
  (`scripts/arrive.mjs`: HUD presente, nenhum diálogo aberto, tela de boas-vindas ausente). O `verify.mjs` também
  confere os três caminhos, o primeiro clique andando, o zoom pela roda e pelas teclas e o menu do jogo. O
  `verify-live.mjs` falha contra uma produção que ainda tenha a tela de boas-vindas: rode-o depois de publicar.

### Added — menu do jogo (IMPL-0022, PROPOSTA)

- Jogo: **menu do jogo**, pelo Esc (sem nada aberto) ou pelo botão "☰ Menu" do HUD: Continuar, Configurações,
  Controles (teclas, mouse e toque, gerados das mesmas tabelas que os tratadores usam), Ajuda (o que é a Vila, onde
  estão ONGs, missões e conta, link para o site) e Sair da Vila (vai para o site público depois de uma confirmação).
  É um diálogo pequeno que deixa a Vila à vista, prende o foco, devolve o foco ao fechar e **não pausa nada**: o
  avatar, os outros visitantes, a presença e o ambiente continuam.
- Jogo: `endpoints.ts` conhece a origem do site público (`site`), usada só como link.

### Removed — botões de zoom e marca na tela de jogo (IMPL-0022, PROPOSTA)

- Jogo: os botões "＋" e "－" saíram do HUD. O zoom continua pela roda do mouse, pela pinça de dois dedos e pelas
  teclas `+`, `=` e `-` (listados em "Controles").
- Jogo: a marca provisória saiu do HUD (era o botão que reabria as boas-vindas). Ela aparece no título da página,
  na tela de carregamento e no site público.
- Jogo: o painel de boas-vindas (`ui/Welcome.tsx`); a promessa da Vila e o aviso de versão em desenvolvimento
  estão em "Ajuda".

### Fixed — painéis, avisos e confirmações do jogo (revisão da IMPL-0022)

- Jogo: **um toque fora de um painel ou do menu não aciona mais o botão que estava embaixo.** O véu fechava o
  diálogo no `pointerdown`, e o `click` do mesmo toque caía no HUD (abria o Caderno de Missões ou a Doação
  global). Agora fecha no `click`, e só quando o toque também começou no véu: arrastar de dentro do diálogo para
  fora não fecha nada. Vale para todos os painéis e para o menu.
- Jogo: **avisos passageiros visíveis com movimento reduzido.** Com `prefers-reduced-motion: reduce` todo aviso
  (`toast`) ficava invisível: "Esse link expirou…", "Bem-vindo(a)…", missão concluída. Agora ele aparece sem
  animação. Nos dois modos o aviso sai da página 3,6 s depois de ser desenhado (antes ficava lá, invisível).
- Jogo, confirmações (sair da Vila, exclusão da conta bloqueada, moderação): um clique duplo no botão que abre a
  pergunta não deixa mais o foco no botão de confirmar, onde um Enter logo depois confirmava. O clique do mouse
  que seria ignorado (segundo clique de um clique duplo, ou antes dos 600 ms) mantém o foco na pergunta.
- Jogo, menu: o link "Conhecer o projeto no site", em Ajuda, tem 44 px de altura como os outros alvos (tinha 36).

### Added — doações Pix e conciliação com a AbacatePay (PROPOSTA, desligada)

- **PROPOSTA** ([IMPL-0023](docs/decisions/0023-donations-abacatepay.md)), atrás da bandeira `DONATIONS_ENABLED`
  (`"false"` em produção e homologação; `"true"` no script local `dev`). Contrato da parceira, provedor e regra do
  Título seguem PENDENTES (PEN-004, PEN-006, PEN-026). Nenhuma migration remota foi aplicada e nenhuma bandeira
  foi ligada.
- Doação global para uma única instituição parceira (DEC-010..013) e doação por ONG na subconta da própria ONG,
  com split em centavos inteiros no pacote compartilhado (padrão 95% e R$ 0,80; mínimo de R$ 2,00, máximo de
  R$ 50.000,00). A configuração é recusada quando o split não caberia no limite da AbacatePay.
- API: `GET /donations/config`, `GET /ngos/:id/donation-info`, `POST /donations/pix`, `GET /donations/:id` (com
  `?refresh=1`), `POST /donations/:id/simulate` (só sandbox), `POST /donations/redirect`,
  `POST /webhooks/abacatepay` e `GET /donations/my-title`. No painel, `GET /admin/donations/overview`,
  `POST /admin/donations/settings`, `POST /admin/ngos/:id/payment-config` e
  `POST /admin/donations/external-proof`, todos auditados.
- Webhook da AbacatePay v2 com segredo configurado e assinatura HMAC-SHA256 do corpo bruto, comparados em tempo
  constante. O id do evento é deduplicado e repetição não altera nada.
- Título (DEC-041): doação Pix confirmada de uma conta credita uma única vez, estorno ou disputa perdida desfazem o
  crédito, e doação não concede XP (DEC-042). O total é somado de `donations`, sem contador paralelo. Comprovante
  externo conferido por admin entra nos indicadores e não credita Título (PEN-026).
- Link próprio da ONG: só HTTPS público, validado e confirmado por um admin. O redirecionamento é registrado e
  nunca conta como doação. Nenhuma rota pública expõe CNPJ, subconta ou a URL.
- Jogo: painel da doação global e HUD da casa com valor, destinatário, parcelas antes do pagamento, QR Code,
  cópia do Pix, verificação e simulação de sandbox, além do cartão "Meu Título de Doação". Com a bandeira
  desligada, os botões continuam desabilitados com a nota honesta (IMPL-0002). Painel: configuração da doação
  global, conferência do recebimento por ONG dentro da candidatura e registro de comprovante externo.
- Candidatura de ONG ganha o modo de recebimento pedido (AbacatePay ou link próprio HTTPS), guardado só quando a
  bandeira está ligada. `GET /ngo/application` e a análise trazem `ngoPayment`.
- Migration `0011_donations_abacatepay.sql` (schema D1 v11): `donation_settings`, `ngo_payment_configs`,
  `donations`, `donation_redirects` e `abacatepay_webhook_events`, aditiva e sem tocar tabelas existentes.
  Rotas de doação num banco atrás do código respondem `503 schema_outdated`. `/lots`, `/indicators`, `/ngos/:id`
  e logo seguem funcionando nos schemas v3 a v11 com a bandeira desligada. `/indicators` reporta
  `confirmed_donations` e `confirmed_amount` (em centavos) só com a bandeira ligada.
- Sandbox: sem subcontas habilitadas na conta de teste, a configuração usa `dev_sacc_<cnpj>` fora de produção e a
  cobrança sai sem `splits`, mantendo o split completo no D1. Em produção a recusa vira
  `409 subaccounts_unavailable` e o admin pode informar um `sacc_…` existente.

### Fixed — doações e conciliação (IMPL-0023, PROPOSTA)

- Webhook repetido não altera mais o estado: a atualização é amarrada à inserção daquele evento, então um replay
  tardio não desfaz uma disputa nem credita o Título de novo.
- Um webhook repetido processado no mesmo milissegundo da entrega original era reaplicado e podia devolver uma
  doação em disputa para `paid`: a trava comparava o horário gravado em `processed_at`. Agora a atualização só vale
  enquanto o id do evento ainda não está em `abacatepay_webhook_events`, e o id é gravado em seguida na mesma
  transação; nenhum relógio entra na decisão. O mesmo evento entregue duas vezes ao mesmo tempo é aplicado uma vez.
- Um estorno (ou disputa perdida) que chega antes da confirmação do pagamento era descartado, e a confirmação
  atrasada deixava a doação estornada como `paid`, contando nos indicadores e no Título. Agora o estorno vale a
  partir de qualquer estado anterior e é final: a confirmação que chega depois não muda a doação.
- A descrição enviada ao Pix respeita o limite de 140 caracteres da AbacatePay.
- Recusas de validação de subconta não viram mais o marcador de sandbox `dev_sacc_…`; em produção, um id de sandbox
  é recusado em vez de criar a cobrança sem `splits`. O cliente do provedor tem limite de 15 s por chamada.
- A sessão do doador é lida antes da criação da cobrança no provedor: uma falha ali não deixa um Pix pagável sem
  registro local.
- O painel de doações mostra uma ONG retirada como retirada, e ela sai da lista de comprovantes externos.
- No jogo, a casa e o cartão do Título deixam de mostrar dados da ONG ou da conta anterior enquanto a nova leitura
  não chega; o modo de recebimento guardado é mantido ao reenviar uma candidatura.
- Uma resposta `2xx` sem JSON não é mais tratada como sucesso; a falha aparece na tela. Quando a leitura da doação
  global falha, o painel diz que não conseguiu carregar, em vez de dizer que a parceira não foi configurada.
- O link próprio da ONG recusa hosts numéricos que se passavam por nomes públicos (`127.1`, `0x7f.0.0.1`,
  `0177.0.0.1`); a lista de recebimento por ONG mostra o estado em português.
- Os formulários do painel e o valor personalizado do Pix aceitam vírgula decimal (`2,00`, `95,5`); o parse é o
  mesmo nos três lugares. A mensagem de valor inválido passa a citar o intervalo aceito.

### Fixed — revisão da moderação e dos papéis (IMPL-0021; API e contrato compartilhado)

- A mensagem da retirada de uma ONG segue a mesma regra da mensagem de bloqueio: caracteres que ninguém vê (largura
  zero, inversão de direção) não contam nem são guardados; um texto só com eles é recusado (`400 reason_required`).
- API: um administrador volta a conseguir **remover o logo publicado de uma ONG cujo responsável excluiu a conta**
  (respondia `500` e o logo continuava público). A pendência de limpeza do objeto fica em nome do administrador
  quando não há mais quem enviou o arquivo.
- API: a remoção de logo confere no próprio batch que quem pede **ainda é administrador**, como as rotas de papel e
  de bloqueio (`403 admin_only`; antes, um administrador rebaixado durante o pedido ainda concluía a remoção).
- API, **PROPOSTA** (remoção de visitante): pelo binding de serviço, `POST /moderation/consume` só cobra o limite da
  sala de um bilhete **que foi emitido**; um bilhete inventado recebe o mesmo `404` sem gastar o limite. Antes,
  visitantes anônimos podiam esgotar o limite da sala e fazer o bilhete verdadeiro ser recusado com `429`. Quem
  chama pelo domínio público continua cobrado antes, por endereço.
- API: num banco sem a migration 0010, `POST /auth/verify` e `POST /auth/link` respondem `503 schema_outdated`
  **sem gravar nada** (antes, a confirmação gastava o link e gravava uma sessão inutilizável antes de responder
  `503`, e o pedido de link enviava um link que não podia ser usado).
- API, **PROPOSTA** (bloqueio de conta): a correção de dados (`POST /me`), a remoção de um arquivo ou de uma foto
  pelo responsável e a criação do contador de progresso passam a conferir o bloqueio no próprio comando: o que
  estava a caminho quando o bloqueio foi gravado responde `403 session_blocked` e não muda nada.
- Contrato compartilhado, **PROPOSTA** (bloqueio de conta): a mensagem para a pessoa precisa de 10 caracteres que
  ela consiga ver. Caracteres de formatação e de controle (largura zero, inversão de direção do texto…) são
  removidos antes da contagem e não são guardados; quebra de linha e tabulação ficam.
- Documentação: o guia de deploy aponta a parte do servidor de tempo real da remoção de visitante (§4.4; o servidor
  não tem homologação) e corrige a resposta de uma API antiga a `POST /moderation/consume` (`405`, não `404`); a
  IMPL-0021 registra que a decisão de candidatura, a retirada e a decisão de foto ainda não conferem quem pede na
  gravação.

### Added — moderação dentro do jogo para administradores (IMPL-0021; remoção de sala e bloqueio PROPOSTA, desligados)

- Jogo: **modo moderação**, só para conta conectada com papel Administrador. Botão "Moderação" no HUD, desligado a
  cada carregamento; ligado, a faixa "Modo moderação" fica visível no topo, acima de qualquer painel, e o HUD desce
  para a faixa não cobrir a marca nem os botões (em qualquer largura). Fora do modo nenhuma ação de moderação
  aparece nem é consultada na API; o modo desliga ao sair, trocar de conta, perder o papel, ser bloqueado ou quando
  a sessão termina em outro lugar.
- Jogo: perto de uma casa, da árvore ou de um morador, Enter sobre o botão "Moderação" ou sobre um botão do bloco
  de moderação aciona esse botão em vez de abrir o que está perto. (A IMPL-0022, acima, estendeu a regra a
  qualquer botão, link ou campo.)
- Jogo, casa de ONG publicada (no modo moderação): "Remover logo", "Remover foto" da galeria pública, "Retirar ONG
  da Vila" (PROPOSTA, IMPL-0020; com a mensagem obrigatória para a organização) e o link "Abrir no painel". Só
  aparecem as ações que podem funcionar (`/config.files`, `/config.withdrawal`, galeria pública com fotos). Cada
  ação pede uma confirmação que nomeia a organização, envia a revisão lida pela API administrativa, pede de novo
  em `409 stale_revision` e relê os terrenos ao concluir. Se a leitura administrativa das fotos falha, a seção diz
  "Não foi possível ler as fotos agora." e oferece ler de novo, em vez de dizer que não há ação disponível. Se a
  seção sai com a casa aberta (papel perdido, sessão encerrada), o foco volta para o diálogo.
- Jogo, **PROPOSTA** (só com `/config.moderation.presence`): selecionar outro visitante (clique no avatar ou botão
  do HUD) e "Remover da sala", com confirmação. O cliente pede o bilhete, envia `["m", alvo, bilhete]` e espera a
  resposta da sala; 5 s sem resposta é falha. Só `ok: true` vira "removido"; o bilhete nunca é exibido nem
  registrado. Trocar a seleção fecha a confirmação aberta, e o resultado de uma remoção enviada antes de o modo ser
  desligado e religado (ou de a conta mudar) é descartado: a confirmação aberta nunca passa a nomear outro
  visitante.
- Jogo, limites da remoção (a sala fecha a conexão de quem os quebra, e conta a mensagem quando ela chega): um
  pedido por vez; depois de um pedido sem resposta, nada mais é enviado naquela conexão até a resposta chegar (a
  resposta atrasada nunca é tomada pela resposta da nova tentativa); 1100 ms entre o último momento em que a sala
  sabidamente ouviu uma mensagem (o envio ou a chegada da resposta) e a próxima; no máximo 9 pedidos em 61 s,
  contados da saída da mensagem (um a menos que a sala aceita). O pedido de bilhete é abandonado em 5 s, e nada é
  enviado se o visitante saiu entre o bilhete e o envio; as duas situações são ditas como são.
- Jogo: quem é removido (fechamento `4003`) lê "Você foi removido da sala por um administrador.", continua
  jogando e só reconecta depois de 60 s, no próximo toque, clique ou tecla (sem laço, sem contar como erro de rede).
  A espera vale também se "Outros visitantes" for desligado e ligado de novo; recarregar a página a encerra (é uma
  cortesia, não uma barreira).
- Jogo, **PROPOSTA**: conta bloqueada (`/me` com `blocked`, ou `403 session_blocked` em qualquer rota) vê "Conta
  bloqueada", a mensagem da administração e a data, e só pode sair ou excluir a conta; a sincronização do progresso
  e a tela da candidatura param sem erro. O Caderno de Missões diz "Conta bloqueada: o progresso fica só neste
  navegador." (não "Sem conexão com a Vila").
- Jogo: sessão que termina com a página aberta (saída em outra aba, expiração, bloqueio que encerra as sessões). Na
  primeira resposta `401 not_signed_in` o jogo relê `/me`; sem sessão, volta ao estado desconectado com o aviso
  "Sua sessão terminou. Entre de novo.", o progresso deixa de ficar pendente e o modo moderação desliga. Se `/me`
  ainda responde a mesma conta, nada muda e a releitura não se repete por 1 minuto.
- Jogo: o painel da conta mostra o papel pelo rótulo compartilhado ("Padrão" / "Administrador").
- Confirmações de moderação e a exclusão de conta bloqueada não aceitam duplo clique, tecla mantida pressionada
  nem resposta nos primeiros 600 ms.

### Added — papel de administrador e moderação (API e contrato compartilhado; bloqueio e remoção de sala PROPOSTA, desligados)

- [IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md): dois papéis, Padrão (`player`) e
  Administrador (`admin`); o painel mantém o login próprio; os papéis passam a ser concedidos e retirados pelo
  painel; o jogo pode mostrar *ações* de moderação a um administrador conectado (listas, filas de análise e
  auditoria ficam no painel). **Schema D1 v10** (`0010_account_blocks.sql`, aditiva, não aplicada no remoto). Esta
  entrega é a API e o contrato compartilhado; as telas do painel e do jogo e a parte do servidor de tempo real são
  entregas separadas.
- API: `POST /admin/users/:id/role {accountId, role}` (auditoria `user.role_change`). Ninguém muda o próprio papel,
  conta bloqueada não é promovida, e de dois administradores que se rebaixam ao mesmo tempo exatamente um vence
  (`409 last_admin`). `GET /admin/users` passa a trazer `blocked`. Sem bandeira própria.
- API: `POST /admin/ngos/:id/logo/remove {accountId, revision}`: um administrador remove o logo de uma ONG em
  qualquer estado, com as guardas da remoção feita pelo responsável (auditoria `ngo.logo_remove`). Exige o bucket.
- **PROPOSTA**, atrás de `ACCOUNT_BLOCK_ENABLED` (`"false"` em produção e homologação; política PENDENTE,
  [OQ-11](docs/decisions/open-questions.md)): `POST /admin/users/:id/block {accountId, message}` e
  `POST /admin/users/:id/unblock {accountId}` (auditoria `user.block` / `user.unblock`, sem o texto). `message` é a
  **mensagem para a pessoa bloqueada**: ela a lê como foi escrita em `GET /me` (`user.blocked`). O bloqueio encerra
  as sessões; o link de acesso responde como para qualquer e-mail e abre uma sessão restrita (ler o motivo, sair,
  excluir a conta); todo o resto responde `403 session_blocked`. Candidatura, progresso e envios em andamento são
  recusados no SQL. A bandeira controla só novos bloqueios; desfazer um bloqueio funciona com ela desligada.
- **PROPOSTA**, atrás de `PRESENCE_MODERATION_ENABLED` (`"false"` em produção e homologação): bilhete de uso único
  para remover um visitante de uma sala (`POST /admin/moderation/ticket`; 32 caracteres, 30 segundos, 10 por
  administrador por minuto) e `POST /moderation/consume`, chamada pelo servidor de tempo real por binding de
  serviço (sem sessão, sem CORS, limite próprio; auditoria `presence.remove`, que registra a remoção autorizada). A
  presença continua anônima; é uma cortesia, não um banimento.
- `GET /config` informa `moderation: {presence, block}`.
- Contrato compartilhado (`packages/shared/src/accounts`): `ROLE_LABEL` ("Padrão", "Administrador"), `Me.blocked`,
  `UserSummary.blocked`, `ModerationConfig`, `ModerationTicket`, regras da mensagem e do bilhete
  (`moderation.ts`, com `MODERATION_TICKET_TTL_MS`) e frases em pt-BR para os novos erros.

### Added — painel: papéis, bloqueio de conta (PROPOSTA) e remoção de logo (IMPL-0021)

- Seção "Usuários": papel com os rótulos compartilhados ("Padrão" / "Administrador"; o rótulo local "Jogador"
  saiu), coluna "Situação" ("Bloqueada") e as ações "Tornar administrador" / "Tornar padrão"
  (`POST /admin/users/:id/role`). Nada é oferecido na própria linha ("Você não pode mudar o próprio papel."). Cada
  ação tem um segundo passo que nomeia a conta e diz a consequência; o botão só libera depois de marcada a frase de
  confirmação (clique duplo ou Enter segurado não enviam nada). Recusas mostram a frase da API (`last_admin`,
  `account_blocked`, `admin_only`, …); depois de uma mudança a linha mostra o que a API respondeu e a lista é
  relida. Uma resposta 200 sem a linha da conta é tratada como falha ("Algo deu errado. …") e a lista é relida.
  Depois de uma recusa que faz a lista ser relida, o foco vai para a linha do resultado (não para um botão que
  some com a releitura). E-mail e nome continuam fora do painel.
- **PROPOSTA** (política PENDENTE, [OQ-11](docs/decisions/open-questions.md)): "Bloquear conta" só aparece quando
  `/config` traz `moderation.block: true`, pede a "Mensagem para a pessoa (ela vai ler)" (regra compartilhada, 10 a
  1000 caracteres) e diz o efeito (sessões encerradas; a pessoa só lê a mensagem, sai e exclui a conta). Não é
  oferecido na própria linha nem na de um administrador ("Remova o papel de administrador antes…"). "Desbloquear"
  aparece sempre que a conta está bloqueada, também com a bandeira desligada. A seção traz o aviso de PROPOSTA.
- Link `dash.*/#applications/<id>` (o que o jogo monta) abre a candidatura; seguido sem sessão, a pessoa cai nessa
  candidatura depois de entrar (o id fica 20 minutos no `localStorage` do navegador e é usado uma vez). Id
  malformado ou desconhecido mostra "Candidatura não encontrada."; só um id bem formado entra no caminho de uma
  requisição.
- Detalhe da candidatura: "Remover logo" (`POST /admin/ngos/:id/logo/remove`), com confirmação, a revisão em tela e
  releitura em `stale_revision`. Auditoria com rótulos para `user.role_change`, `user.block`, `user.unblock`,
  `ngo.logo_remove` e `presence.remove` ("Remoção de visitante autorizada"). "Sistema" mostra `moderation.presence`
  e `moderation.block` como as outras bandeiras.
- Sessões: conta bloqueada que entra no painel vê só "Conta bloqueada", a mensagem e "Sair"; um administrador
  rebaixado com o painel aberto cai em "Apenas administradores" na requisição seguinte, sem laço. Se a API recusa
  uma rota administrativa (`admin_only`, `session_blocked`, `not_signed_in`) enquanto `/me` continua respondendo o
  mesmo administrador, o painel não fica relendo a sessão: mostra o estado de indisponibilidade, que diz o que
  houve, e só "Tentar de novo" pede outra vez.
- Conferência local em navegador: `apps/dash/scripts/verify-moderation.mjs`
  ([development §4.7](docs/guides/development.md#47-adicionar-uma-seção-ao-painel-administrativo)).

### Fixed — painel em telas estreitas

- A legenda das tabelas do painel ("Contas", "Eventos de auditoria", …) aparecia com uma letra por linha abaixo de
  640 px; agora ocupa a largura da tela.

### Changed — a conferência de sessão exige a migration 0010

- Toda rota que lê a sessão passa a ler `users.blocked`: num banco sem a 0010, com as contas ligadas, elas
  respondem `503 schema_outdated` (antes, sessão, progresso e exclusão de conta funcionavam num banco na v9). Com as
  contas ligadas, a migration vem antes da API ([deploy §10](docs/guides/deploy.md#10-administrador-e-moderação-impl-0021)).
  As rotas públicas respondem igual nos schemas v3 a v10, com qualquer combinação de bandeiras.
- Um cadastro não confirmado deixa de expirar em 24 horas enquanto estiver bloqueado.

### Added — remoção de visitante da sala por administrador: servidor de tempo real e protocolo (PROPOSTA, desligada)

- **PROPOSTA** ([IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md)), atrás da bandeira
  `PRESENCE_MODERATION_ENABLED` do servidor (`"false"` em produção; ligada só no script `dev`). Parte do servidor e do
  protocolo; a API e o jogo vêm em mudanças separadas.
- Protocolo de presença (`packages/shared/src/net/protocol.ts`): pedido `["m", alvo, tíquete]` (id de conexão e
  tíquete de 32 caracteres `[A-Za-z0-9_-]`, só na forma exata de `encodeRemove`), resposta `["m", alvo, 0|1]` para
  quem pediu e código de fechamento `4003` (`CLOSE_REMOVED`).
- Servidor (`apps/server`): a sala consulta a API pelo service binding `API` (`POST /moderation/consume`, limite de
  3 s) e só fecha o alvo com `4003` diante de `200 {"ok":true}`; em qualquer outro caso responde `0` e não fecha
  ninguém. Limites por conexão: um pedido por segundo e 10 por minuto, depois `1008`. A sala não guarda nem registra
  o tíquete, a resposta ou quem pediu, e não grava no storage.
- Diferença em relação ao contrato: a sala só atende pedidos depois de 35 s em memória, para que um tíquete emitido
  antes de um reinício não alcance outra conexão que recebeu o mesmo id.
- `apps/server/wrangler.jsonc` ganha o binding `services` para `vilanoeldobem-api`: publicar a API antes do servidor
  ([deploy.md §4.4](docs/guides/deploy.md#44-service-binding-do-servidor-para-a-api-proposta-impl-0021)).

### Added — apelido `client.*` para o jogo

- `client.vilanoeldobem.com.br` passa a ser um Custom Domain do Worker do jogo e redireciona (302) para
  `play.vilanoeldobem.com.br`, com o mesmo caminho e query. O jogo continua em uma única origem (`play.*`): CORS,
  cookie de sessão e servidor de tempo real não mudam. O domínio é criado no próximo `pnpm deploy:client`.

### Added — retirada administrativa de ONG publicada (PROPOSTA, desligada)

- **PROPOSTA** ([IMPL-0020](docs/decisions/0020-ngo-publication-withdrawal.md)), atrás da bandeira
  `NGO_WITHDRAWAL_ENABLED` (`"false"` em produção e homologação). A política da retirada é PENDENTE
  ([OQ-14](docs/decisions/open-questions.md)): o código não decide o que ela significa para a conta, o CNPJ, o
  retorno da organização ou a guarda dos dados. Portada do PR #33 para o fluxo canônico de arquivos e galeria.
- API: `POST /admin/ngos/:id/withdraw {accountId, revision, reason}`. Registro, revisão, liberação dos terrenos
  realmente associados e auditoria (`ngo.withdraw`, sem o texto) confirmam juntos; disputa ou repetição não
  duplica nada. `reason` é a **mensagem para a organização**: o responsável a lê como foi escrita.
- `GET /config` informa `withdrawal`. Respostas privadas mostram o estado efetivo `withdrawn` e
  `withdrawal: {reason, at}`; a lista administrativa filtra por ele.
- Leituras públicas (`/lots`, `/indicators`, `/ngos/:id`, logo, fotos) deixam de mostrar a ONG porque o terreno é
  liberado; nenhuma delas lê a tabela nova. `approved_ngos` passa a contar ONGs publicadas **em terreno
  publicado**. Teste cobre as rotas públicas nos schemas v3 a v9, com a bandeira ligada e desligada.
- Depois da retirada: envio de logo, documento e foto, reenvio e aprovação/rejeição de foto são recusados
  (`409 application_withdrawn`); o responsável ainda remove os próprios arquivos e fotos. A exclusão da conta
  apaga também o logo da ONG retirada. A retirada é recusada enquanto a exclusão da conta estiver pendente.
- O que o código faz hoje e depende da OQ-14: a conta do responsável não consegue se candidatar de novo, o CNPJ
  continua em uso, não há rota para desfazer, e a linha conserva `status = 'published'`.
- Jogo: a candidatura retirada mostra "Retirada da Vila" e a mensagem da administração, sem reenvio. Painel:
  situação e mensagem, rótulo da ação na auditoria e a ação "Retirar da Vila" (mensagem, revisão em tela,
  confirmação), só quando `/config` traz `withdrawal: true`.
- Migration `0009_ngo_withdrawals.sql` (schema D1 v9): tabela `ngo_withdrawals`. Com as contas ligadas, a
  migration vem antes da API (rotas de candidatura e análise respondem `503 schema_outdated` sem ela); com as
  contas desligadas a API funciona nos schemas v3 a v9. Nenhuma migration remota foi aplicada.
- Provas locais com dados sintéticos: `node scripts/verify-media-local.mjs --withdrawal` (workerd, D1 e R2;
  também no CI) e `apps/dash/scripts/verify-withdrawal.mjs` (painel em Chrome).

### Fixed — persistência de progresso entre sessões (D12)

- Gravações de missões/XP usam revisão por conta e token exclusivo no D1, evitando que pedidos simultâneos
  reposicionem eventos já aceitos ou gravem quests incompatíveis. Reenvios não consomem vagas adicionais no limite.
- Eventos de quest incompatíveis com o estado salvo são omitidos e a resposta devolve o progresso da conta,
  preservando o login quando o visitante tinha outra quest ativa. Contenção após três tentativas com jitter
  retorna `409 progress_conflict`. Regressão conecta cliente real à API real e confere proprietário, XP e reload.
- Nova migration `0008_progress_write_guard.sql` (schema D1 v8), após arquivos e galeria; nenhuma migration remota ou flag foi ativada.
  Catálogo, XP, níveis e interface permanecem iguais. Testes SQL e prova local com duas sessões cobrem persistência,
  duplicidade, concorrência, falha transacional e isolamento de contas ([IMPL-0019](docs/decisions/0019-progress-concurrency-and-acknowledgment.md)).

### Fixed
- Revisão de mídias: revalidação de logo/fotos com ETag, leitura pública tolerante a schemas antigos e FK de galeria sem cascata para preservar a referência aos arquivos.
- Exclusão de conta recusada por falta do bucket (`503 files_unavailable`), antes de apagar qualquer objeto, não
  deixa mais a conta congelada: a marca posta pelo próprio pedido é desfeita. Falha do R2 continua mantendo a
  exclusão pendente, visível e repetível.
- Rotas públicas sempre ligadas (`/lots`, `/indicators`, `/ngos/:id`, logo e foto) cobertas por teste nos schemas
  v3 a v6, em todas as combinações de bandeiras e bucket.
- `AGENTS.md` e `storage.md` voltam a trazer as regras originais (bucket só com arquivos de candidatura, só o logo
  público, regras de migrations); a galeria aparece como exceção estreita e explícita, PROPOSTA.

### Added — conciliação dos arquivos e galeria de ONGs (PR, PROPOSTA)

- Reaproveita o PR #32: `FILES`, `ngo_files`, uploads crus, sanitizador e telas de logo/documentos permanecem
  canônicos. Perfil público e galeria dos PRs #28/#29 são adaptados a esse bucket, sem o pipeline concorrente
  de documentos do #31. Galeria PNG/JPEG com aprovação individual, desligada em produção/staging (IMPL-0018).
- Migration 0007 preserva 0006; acrescenta galeria, token exclusivo de escrita e intenção durável de exclusão.
  Sequência 0001–0007 sem lacunas; não importa pipelines alternativos nem a retirada do PR #33.
- Candidatura e arquivos compartilham snapshot SQL. Estado/revisão exatos e token exclusivo impedem escrita
  atrasada e auditoria duplicada; preserva o bloqueio em `under_review` do #32 atualizado.
- Exclusão de conta congela as evidências antes da limpeza R2 e permite retomar em falha. Incrementa a revisão
  final para invalidar decisões antigas; conserva o logo institucional canônico e remove toda a galeria.
- Logo público passa a exigir terreno publicado; logo/fotos usam `no-cache` com ETag e o perfil usa `no-store`. Nenhuma alteração de jogo,
  deploy, migration remota ou ativação pública faz parte desta entrega.

### Fixed — revisão de perfil e arquivos

- Exclusão de conta pendente visível no jogo e no painel; repetição explícita e rejeição administrativa de
  candidatura aberta para liberar terreno, mantendo bloqueio de aprovação e sem cancelar descarte parcial.
- Perfil público tolerante ao schema v3, sem cidade, com aviso explícito dos campos públicos na candidatura.
- Configuração de teste local separada da configuração de deploy, com banco e bucket sintéticos novos.
- Numeração sequencial de migrations/ADRs e registro de entrega indexado, com respostas às revisões.
- Logo/comprovantes registram intenção antes de R2, preservam bytes após confirmação incerta e rastreiam
  limpeza de arquivos removidos/substituídos. Recuperação autenticada por responsável/admin, limitada a 50
  intenções por chamada; primitiva de reserva/escrita condicional compartilhada com galeria (validação atual pendente).
- Galeria removível pelo responsável e na exclusão da conta; demais salvaguardas e validação registradas na entrega.

### Added — conferência do jogo em produção

- `apps/client/scripts/verify-live.mjs`: conferência do jogo publicado (carrega, entra na Vila, sem erro de console
  ou de CSP, presença respondendo). O `verify.mjs` passa a ser documentado como só local.
- A documentação registra o deploy de 2026-11-12 (painel administrativo publicado) e a pergunta aberta OQ-13
  (destinos de medição do Google bloqueados pela CSP do jogo).

### Added — arquivos das candidaturas de ONG no R2 (desligado em produção)

- Logo e documentos da candidatura num bucket R2 privado ([IMPL-0017](docs/decisions/0017-ngo-files-r2.md)):
  **PROPOSTA**, atrás da bandeira `NGO_FILES_ENABLED` (`"false"` em produção). O bucket `vilanoeldobem-files` ainda
  não foi criado e a migration 0006 não foi aplicada no remoto. Nenhum documento é obrigatório nem nomeado: a lista
  é PENDENTE (PEN-019, OQ-12).
- API: `POST /ngo/application/files`, `GET` e `DELETE /ngo/application/files/:id`,
  `GET /admin/applications/:id/files/:fileId` e a rota pública `GET /ngos/:id/logo` (só de ONG publicada).
  `GET /ngo/application` e `GET /admin/applications/:id` trazem `files`; `/lots` traz `ngo_logo`; `/config` traz
  `files` e `/health` diz se o bucket está ligado. Novo cabeçalho `X-Vila-Account` nas escritas de arquivo.
- Logo: PNG ou JPEG, até 512 KB, 64 a 1024 px. Documentos: até 5, PDF, PNG ou JPEG, até 5 MB cada. O formato é
  conferido pelos bytes (SVG e HTML recusados) e o tamanho é conferido de novo enquanto o arquivo chega.
- Imagens são guardadas sem metadados (EXIF com GPS, XMP, comentários); o nome original do arquivo não é guardado.
- Enviar ou remover arquivo muda a `revision` da candidatura: decisão do admin sobre a versão anterior é recusada.
  Durante a análise (`under_review`) os arquivos ficam travados e, depois de publicada, a ONG não troca mais
  arquivo. `start_review` passa a valer para a versão atual, sem conferir a revisão vista.
- Limites: 20 envios ou remoções por minuto por conta e 60 mudanças de arquivo por candidatura a cada 24 horas.
- Admins leem os arquivos existentes sempre que o bucket está ligado, mesmo com o envio desligado.
- `pnpm deploy:api` passa `--x-provision=false`: o wrangler não cria mais sozinho um bucket que falta.
- Leitura de documento por admin gravada em `audit_events` (`ngo.file_read`), além de `ngo.file_add` e
  `ngo.file_remove`.
- `DELETE /me` apaga do R2 e do D1 os documentos da pessoa e o logo de candidatura não publicada.
- Jogo: seção "Arquivos da candidatura" na tela da candidatura (enviar, trocar e remover logo; até 5 documentos,
  com download e remoção), só quando `/config` traz `files: true`. O arquivo é conferido no navegador com as mesmas
  regras da API antes do envio. O painel do terreno publicado mostra o logo da ONG.
- Painel administrativo: seção "Arquivos" na análise da candidatura (prévia do logo; documentos só por download,
  um registro de auditoria por clique), rótulos das novas ações na auditoria e estado "Envio de arquivos desligado".
  A CSP do painel passa a aceitar `blob:` em `img-src` (só para a prévia do logo).
- `verify-accounts.mjs` cobre o envio de arquivos no jogo e a leitura no painel; aceita uma API em outra porta
  (argumento `api`) e `VILA_API_PERSIST_TO` para o banco local dela.
- Migration `0006_ngo_files.sql` (schema D1 v6): tabela `ngo_files`.
- `packages/shared/src/accounts/files.ts`: limites, detecção de formato, limpeza de metadados e frases de erro,
  usados pela API, pelo jogo e pelo painel.

## [0.4.0] - 2026-11-12

**Contas e ONGs, painel administrativo, presença em tempo real e navegação por clique**
([IMPL-0006](docs/decisions/0006-christmas-environment-real-time-procedural-weather.md) a
[IMPL-0016](docs/decisions/0016-click-navigation-and-colliders.md)). Schema D1 **v5** no código; **produção segue na
v3**: as migrations `0004` e `0005` não foram aplicadas e as contas continuam desligadas (`ACCOUNTS_ENABLED`), assim
como as missões narrativas (`QUESTS_V1_ENABLED`). Os cinco Workers foram publicados a partir da `main` em 2026-11-12,
na ordem API, servidor, painel administrativo (`vilanoeldobem-dash`, criado nesse deploy), jogo e site; esse deploy
foi feito antes deste commit de versão, então `GET /health` em produção responde `"version": "0.3.0"` até a próxima
publicação da API.

### Added — painel administrativo (`apps/dash`)

- Novo app `apps/dash` ([IMPL-0015](docs/decisions/0015-dash-backoffice-app.md)): backoffice em
  `dash.vilanoeldobem.com.br`, Worker `vilanoeldobem-dash` só com Static Assets (sem script, sem bindings). **Não
  publicado**: criar o Worker e o domínio exige autorização. Seções: Candidaturas (análise de ONGs, movida do jogo),
  ONGs e terrenos, Auditoria, Usuários (só leitura, sem ação de sanção), Sistema (`/health` e bandeiras da API) e
  Pendentes (Doações, Indicadores, Documentos e logos das ONGs — só avisos, sem função).
- Entrada no painel pelo mesmo link mágico e pelo mesmo cookie de sessão do jogo; o painel não cria contas. Conta sem
  papel `admin` vê só "Apenas administradores" e "Sair". Com as contas desligadas, o painel mostra "Contas desligadas"
  e só dados públicos.
- API: `GET /admin/audit` e `GET /admin/users` (admin, só leitura, paginadas por `before` e `limit`; a lista de contas
  não traz e-mail nem nome). Nova variável `DASH_ORIGIN`; `https://dash.vilanoeldobem.com.br` entra em
  `ALLOWED_ORIGINS` e `ACCOUNT_ORIGINS`.
- Cabeçalhos do painel gerados por build: CSP sem inline e sem terceiros, `connect-src` só com a API da build,
  `noindex`, `no-referrer`, HTML `no-store`. Sem analytics nem Google Tag Manager.
- `apps/dash/scripts/verify.mjs` (Chrome real, desktop e celular) e scripts `pnpm dev:dash` / `pnpm deploy:dash`.
- `packages/shared/src/accounts/{contract,errors}.ts`: formas das respostas de conta e de análise e textos de erro,
  usados pelo jogo e pelo painel.

### Changed — análise de ONGs fora do jogo

- O painel "Análise de ONGs" saiu do jogo (`ui/Admin.tsx` removido). Admins veem, no painel da conta, o link "Abrir
  painel administrativo" (nova aba) para `dash.*`.
- `POST /auth/link`: o link abre o painel administrativo quando o pedido vem exatamente de `DASH_ORIGIN`; nos demais
  casos continua abrindo o jogo. `POST /auth/register` vindo do painel é recusado (`403 forbidden_origin`).
- `apps/client/scripts/verify-accounts.mjs`: os passos de admin rodam no painel (terceiro argumento, padrão
  `http://localhost:8797`); esperas reais no lugar de `isVisible`, 30 s depois de chamadas à API e mensagem clara
  quando o limite de `/auth/*` é atingido (esperar 60 s entre execuções).

### Changed — e-mail

- O link de acesso passa a sair pelo Resend ([IMPL-0012](docs/decisions/0012-resend-transactional-email.md)) no
  lugar do Cloudflare Email Service: segredo `RESEND_API_KEY` no Worker da API, sem binding `send_email`. Sem a
  chave o envio falha fechado (`503 mail_unavailable`), como antes. `GET /health` ganhou `mail` (se a chave existe).
- Workflow manual `api-secrets` grava `RESEND_API_KEY` no Worker a partir dos segredos do GitHub.

### Added — presença: limite de inatividade

- A sala de presença fecha conexões sem atividade real por mais de `IDLE_TIMEOUT_SECONDS` (padrão 300 s; código de
  fechamento `4002`, motivo `idle`), para que abas esquecidas não mantenham o Durable Object acordado e cobrando
  duração ([IMPL-0014](docs/decisions/0014-realtime-idle-timeout.md)). O `"ping"` não conta como atividade; cliques,
  toques e teclas contam, pela nova mensagem `["a"]` (no máximo uma a cada 20 s).
- No jogo, a conexão com os outros visitantes entra em pausa (chip "👥 em pausa") e volta no próximo toque, clique
  ou tecla, sem reconectar sozinha; aba oculta por 2 minutos também pausa. Quedas de rede seguem reconectando com
  espera exponencial. Deploy: servidor antes do cliente.

### Added — medição

- Google Tag Manager (`GTM-MQP2RVMB`) no site e no jogo. A inicialização do `dataLayer` fica em `/gtag-init.js`
  (a CSP não aceita script inline). A CSP dos dois apps libera `https://www.googletagmanager.com` como script e
  `*.googletagmanager.com`, `*.google-analytics.com` e `*.analytics.google.com` como imagem e conexão. Tags HTML
  personalizadas do GTM continuam bloqueadas pela CSP.
- No jogo, o token do link mágico (`#login=`) sai da barra de endereço antes de o GTM carregar
  (`/login-fragment.js`, guardado só em memória), para nunca aparecer na URL medida.

### Fixed — colisões e clique para andar

- O avatar chega aonde se clica ([IMPL-0016](docs/decisions/0016-click-navigation-and-colliders.md)): a rota contorna
  árvore, pinheiros, postes, bancos, barracas, trenó, moradores e casas, planejada uma vez por clique. Antes ele ia em
  linha reta e desistia em 0,5 s no primeiro obstáculo (parava 10 a 20 u antes do destino). Clique em cima de um
  obstáculo ou fora do mundo leva ao ponto caminhável mais próximo, e o marcador aparece onde o avatar vai parar.
- Colisores do tamanho do que é desenhado: nada sólido é atravessado (cercas, extremidades das barracas, trenó,
  renas, cachorro, gato, coelho, guirlanda dos postes, placa, caixa de correio, lanternas, estacas e placa dos
  terrenos disponíveis, paredes e varanda dos chalés, ramas da árvore e dos pinheiros) e nada invisível bloqueia
  (banco, trenó pequeno). Um teste compara cada modelo com o seu colisor.
- O avatar não passa mais espremido por vãos menores que ele.
- Terrenos: o botão de ação aparece a até 6 u do centro (antes 4,5 u), porque a varanda do chalé agora bloqueia.
- Quests (PROPOSTA, desligadas em produção): dois sinos e uma lanterna do lago saíram de baixo das ramas dos
  pinheiros (`bell-pine-north`, `bell-pine-east`, `lantern-lake-1`; ids inalterados).
- `apps/client/scripts/verify-collisions.mjs`: verificação em navegador real do clique para andar (só local).

### Changed — controles

- Andar é só por clique/toque no chão: WASD e setas foram removidos. O clique mostra um anel dourado que se expande,
  um brilho de gelo e um marcador no destino até o avatar chegar (sem expansão com movimento reduzido).
- Zoom da câmera: roda do mouse, gesto de pinça, botões ＋/－ no canto e teclas `+`/`-`; fica salvo neste navegador
  (`vila.zoom.v1`). Névoa gelada mais leve (0,82 → 0,60).

### Added — 0.4.0 "Contas e ONGs" (desligado em produção)

- Contas ([IMPL-0011](docs/decisions/0011-accounts-magic-link-ngo-review.md)): cadastro com Nome, Nickname, Cidade e
  E-mail (DEC-038; só o nickname é público), entrada por link mágico enviado por e-mail (15 min,
  uso único), sessão em cookie HttpOnly, sair e excluir conta. Atrás da bandeira `ACCOUNTS_ENABLED`, **desligada em
  produção** até a revisão LGPD / ECA Digital e o cadastro do domínio de e-mail.
- Missões e XP no servidor: eventos idempotentes, progresso local migrado ao entrar (DEC-042).
- Candidatura de ONG em 4 etapas (P12, campos PROPOSTA; sem upload de documentos), reserva do terreno, reenvio após
  pedido de ajustes ou rejeição.
- Análise administrativa (DEC-037): iniciar análise, aprovar, pedir ajustes, rejeitar; histórico auditado; a
  aprovação publica a casa gerada no terreno.
- Migration `0004_accounts_ngo_applications.sql` (schema D1 v4). Rotas `/config`, `/auth/*`, `/me`, `/progress`,
  `/ngo/application`, `/admin/applications`. `apps/client/scripts/verify-accounts.mjs` (navegador, só local).

### Security — endurecimento das contas (trazido da linha paralela #9–#12)

- Link de acesso com o token no fragmento (`/#login=`), fora dos logs do Worker do jogo.
- Progresso de cada conta separado do progresso de visitante: num navegador compartilhado, a próxima pessoa não herda
  eventos da anterior; eventos não enviados ficam numa fila e são reenviados quando a conexão volta.
- Escritas com `accountId` (`409 account_changed` se outra aba trocou de conta); decisões da análise presas à versão
  vista (`409 stale_revision`); aprovação exige e registra as três verificações do DEC-015.
- Datas impossíveis recusadas, caracteres de controle removidos, ids de evento conferidos por missão, `no-store`
  imposto nas rotas de conta, sessão anterior encerrada ao entrar, leitura de corpo limitada sem `Content-Length`.

### Added — infraestrutura

- Ambiente `staging` da API (`apps/api/wrangler.jsonc`) com banco D1 próprio (`vilanoeldobem-staging`), sem rotas,
  sem origens e com contas desligadas; guia [staging-database.md](docs/guides/staging-database.md). Preparado pela
  equipe no PR #10 e trazido para o `main` sem as migrations divergentes; banco recriado com as migrations 0001-0005
  do `main` (ensaio da aplicação em produção).

### Changed

- **Monorepo separado em apps e subdomínios** ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)):
  `apps/client` (jogo, `play.vilanoeldobem.com.br`; `app.*` redireciona com 301), `apps/api` (API + D1,
  `api.vilanoeldobem.com.br`), `apps/server` (presença em tempo real, `server.vilanoeldobem.com.br`), `apps/site`
  (sem mudança, links para `play.*`) e `packages/shared` (lógica pura comum). **Incompatível:** rotas da API perdem
  o prefixo `/api` (`/health`, `/indicators`, `/lots`, `/environment`); presença em `wss://server.…/room`. CORS e
  WebSocket só para origens exatas; CSP do jogo gerada por build. `smoke-api.sh` confere os três serviços.

### Added

- Runtime das quests narrativas `quests-v1` (PROPOSTA, DEC-039 a DEC-042; PEN-025) atrás de flags
  (`VITE_QUESTS_V1_ENABLED=true` ou `?quests=1` em localhost/dev no cliente **e** `QUESTS_V1_ENABLED` na API, lida
  pelo cliente em `GET /config`; as duas precisam estar ligadas), com catálogo em
  `packages/shared/src/game/quests.ts`, máquina de estados pura, cinco NPCs (`villager`), coleta por proximidade,
  bolsa derivada, diálogos, Caderno de cadeias, integração com XP idempotente na API, testes em
  `packages/shared/src/game/quests.test.ts`, verificação no navegador (`apps/client/scripts/verify-quests.mjs`) e
  referência em [quests.md](docs/reference/quests.md).
- Painel de doação global físico (`DONATION_PANEL`, gerador `quest-donation-panel`; PROPOSTA `quests-v1`), montado só
  com as quests ligadas: abre o mesmo painel de doação da árvore (DEC-026) e serve à leitura da promessa.
- Regras do runtime de `quests-v1` ([IMPL-0013](docs/decisions/0013-quests-v1-runtime.md)): com as flags desligadas o
  mundo é o de antes (moradores, atril e os obstáculos deles só existem com as quests ligadas); a API grava um evento
  de quest apenas quando ele é uma transição válida (um `accept` de aba desatualizada ou um objetivo antes do
  `accept` não travam mais a missão e podem ser reenviados); com `QUESTS_V1_ENABLED` desligada a API ignora os
  eventos de quest e grava o resto do lote, em vez de recusar tudo com `400`; clicar num morador de longe faz o
  avatar andar até ele em vez de abrir o diálogo; o foco do teclado fica no diálogo quando a próxima missão aparece.
- Itens de quest (PROPOSTA, `quests-v1`): cinco geradores em `apps/client/src/scene/gen/quest-items.ts` —
  `quest-reindeer-bell` (Sino do arreio), `quest-lucky-charm` (Patuá da sorte), `quest-ornament-crate` (Caixa de
  enfeites), `quest-donation-panel` (Painel de doação global) e `quest-story-page` (Página da história) — com
  receitas visuais pesquisadas em `content/proposals/quests-v1/object-references.md`, todos dentro de 80 voxels e
  200 faces (itens) ou 220 e 600 (adereço de mundo).
- Proposta estruturada `content/proposals/quests-v1/` (15 missões em 5 cadeias de NPC, diálogos, bíblia de
  história, catálogo normalizado de 8 objetos em `objects.csv`/`objects.md`, fila de prompts em `object-prompts/`,
  auditoria em `review.md`, plano de piloto em `pilot-plan.md` e validadores `validate-quests.mjs` e
  `validate-objects.mjs`).

- Adereços gerados na Vila (PROPOSTA): mercado com barraca de panetone, lanternas, placa, caixa de correio e trenó,
  fundidos numa só geometria por material (+3 chamadas de desenho para todos).

- Multiplayer mostra o visual de cada visitante (chapéu, cachecol, suéter, cores) e `apps/server/scripts/load.mjs`
  testa uma sala cheia (40 visitantes: ~10 kB/s por visitante, p95 9 ms local).

- Conteúdo procedural por semente ([IMPL-0010](docs/decisions/0010-seeded-procedural-voxel-content.md), PROPOSTA):
  núcleo de geradores determinísticos (PRNG por semente, partes, paleta nomeada, orçamento por categoria testado,
  snapshots) e 9 geradores de adereços (presente, lanterna, cerca, trenó, caixa de correio, placa, guirlanda,
  barraca, barraca de panetone) e de chalés (planta, andares, três telhados, varanda, guirlanda, chaminé), moradores (corpo, casaco, cachecol, chapéu,
  tons de pele) e animais (rena, cachorro, gato, passarinho, coelho, coruja noturna) com respiração em shader;
  decoração com 3 moradores e 6 animais na Vila (PROPOSTA).
- Visual do avatar (PROPOSTA): chapéus, cachecóis, suéteres e paletas como camadas sobre o avatar, liberados só por
  missões e nível (tudo alcançável sem doar; nada se compra ou sorteia). Escolha em "Caderno de Missões". Presentes
  escondidos gerados pelo id; terrenos com ONG publicada ganham um chalé gerado pelo id do terreno. Galeria `?gallery` (só desenvolvimento)
  e `scripts/gallery.mjs`. Ver [content.md](docs/reference/content.md).

- Multiplayer de presença ([IMPL-0008](docs/decisions/0008-multiplayer-presence-durable-objects.md)): quem está na
  mesma praça vê os outros andando em tempo real (Durable Object `VillageRoom` + WebSocket `GET /api/room`, até 40
  por sala, 8 salas). Bonecos anônimos, sem nomes, sem chat, nada gravado. Chip "👥 N" no HUD; opção "Outros
  visitantes" no painel "Ambiente". `verify.mjs` testa dois navegadores se vendo e a coleta dos presentes.

- Motor e jogabilidade ([IMPL-0007](docs/decisions/0007-voxel-mesher-fixed-step-simulation.md), PROPOSTA): malha de
  voxels com remoção de faces escondidas e oclusão de ambiente por vértice; adereços repetidos instanciados.
  Medido no `verify.mjs` (preset Média): 96 → 56 chamadas de desenho e 362 mil → 108 mil triângulos por quadro.
- Avatar com simulação em passo fixo (aceleração, chegada suave, giro suave), colisão com pinheiros, postes, bancos,
  bonecos de neve, trenó e chalés, caminhada articulada, sombra de contato e câmera com antecipação.
- Efeitos: neve levantada pelos passos, brilho dourado ao achar presente; pegadas por passo (não na pedra nem no gelo).
- Som: passos por superfície (neve, neve batida, pedra, gelo), carrilhão do presente e vinheta de missão, além do
  vento e dos sininhos; continua desligado por padrão.
- Resolução adaptativa pelo p95 do tempo de quadro; `?envDebug` mostra chamadas, triângulos, p50/p95 e DPR;
  `verify.mjs` grava `verify-output/stats.json`.

- CI no GitHub Actions: `ci.yml` (typecheck, testes e build em todo PR e push na `main`) e `smoke.yml` (smoke de
  produção diário e manual). `scripts/smoke-api.sh` passa a conferir `/api/environment`.

- Decisões: OQ-02 (visitante livre, conta opcional) e OQ-03 (login por link mágico no e-mail) resolvidas; nova
  pergunta OQ-08 (provedor de envio de e-mail).

- Ambiente natalino ([IMPL-0006](docs/decisions/0006-christmas-environment-real-time-procedural-weather.md),
  PROPOSTA): a Vila segue a hora real de São Paulo (1:1, via fuso IANA) com amanhecer, dia, entardecer e noite;
  clima fictício e determinístico, igual para todos (neve leve a nevasca, névoa, vento), com eventos de Natal e
  Virada do Ano. Rota `GET /api/environment` (autoridade da hora, `no-store`). Sem Durable Object nem recurso novo.
- Vila nevada: chão com neve, pinheiros que balançam com o vento, chalés com janelas acesas e chaminé com fumaça,
  cordões de lâmpadas, bonecos de neve, trenó com renas, lago congelado, floresta e montanhas; céu com estrelas, lua,
  nuvens, aurora e estrelas cadentes; neve por GPU; pegadas; bloom moderado nos presets Alta/Ultra.
- HUD: hora de SP e clima; botão "Olhar o céu"; painel "Ambiente" com qualidade gráfica e conforto (sem partículas,
  luzes fixas, menos movimento, som ambiente procedural desligado por padrão).
- Depuração local: `?envDebug`, `?envTime=`, `?envWeather=` (só localhost/dev); `verify.mjs` fotografa as fases.

### Changed

- Rótulos de missão sobre os cinco NPCs e o atril da doação (`@react-three/drei` `Html`), um botão de ação no HUD
  por alvo (NPC, interação de quest, painel de doação, árvore, terreno) com `E`/`Enter`, diálogo modal
  (`ui/Panel.tsx`) seguindo o padrão APG de foco, copy cardinal corrigida para **ao sul** para o trenó, cabeçalhos
  de CORS aplicados na própria `Response` em `apps/api/src/api.ts`, teste de coordenadas exatas em
  `packages/shared/src/game/motion.test.ts` e atualização de [api.md](docs/reference/api.md),
  [architecture.md](docs/reference/architecture.md) e [content.md](docs/reference/content.md).
- Referências atuais ao repositório de documentação atualizadas para `vilanoeldobem/docs`; nomes anteriores mantidos apenas onde registram contexto histórico.
- Desempenho do primeiro carregamento: o chunk `three` caiu de 317 para 245 kB gzip (meta ≤ 250 kB). React e
  zustand foram para um chunk `react` próprio (69 kB gzip), então a interface não espera mais o Three.js; o bloom
  (`PostFx`, 5 kB gzip) só é baixado nos presets Alta/Ultra.
- Direção de arte: o estudo "Natal brasileiro de verão" (palmeiras, terracota) deu lugar à vila nevada, confirmada
  pelo responsável em 2026-11-09 (OQ-07 resolvida; DEC no repositório de documentação pendente).
  O id de missão `gift-palm` foi mantido.
- ROADMAP: novo marco "Infraestrutura de entrega" (CI, staging, backup do D1, redução do chunk Three.js) e
  marco "Contas e ONGs" (0.4.0) detalhado em quatro entregas com critérios de pronto; missões no servidor
  antecipadas para a 0.4.0.
- Site público adotou identidade voxel da Vila nevada, com temas Dia Nevado e Noite Natalina, arte própria e conteúdo reorganizado.
  A marca continua sendo o texto temporário ([IMPL-0005](docs/decisions/0005-public-site-and-domains.md)): o site
  não exibe imagem de logo enquanto não houver uma aprovada (DEC-024, PEN-016).
- Efeitos oferecem controle de neve e movimento reduzido, relógio de São Paulo e suporte responsivo e acessível.
  Com a neve desligada não sobra floco na tela; com movimento reduzido a neve fica parada e o botão continua
  ligando e desligando. Os links das seções quebram de linha no celular (nada fica fora da tela) e a ordem do
  teclado segue a ordem visual do cabeçalho.
- O relógio do site usa as mesmas fronteiras de fase do jogo (`CYCLE` em `packages/shared/src/environment`), em
  `apps/site/src/villageClock.ts`, com testes nas fronteiras.
- Verificação automatizada do site (`apps/site/scripts/verify.mjs`) passou a cobrir rotas, temas, tamanhos de tela,
  acessibilidade e estados extremos: o que a neve realmente pinta (ligada, desligada, movimento reduzido), contraste
  do anel de foco (≥ 3:1), ordem do teclado, contraste alto nos dois temas e a página sem JavaScript.

### Fixed

- Contador "Missões n/4" do HUD restrito às quatro missões rápidas (`MISSIONS`), mantendo as 15 quests narrativas
  em seção própria no Caderno.
- Clicar do outro lado da árvore podia deixar o avatar parado contra ela: a árvore agora é um obstáculo com
  deslizamento.

- Concluída a missão "2 presentes", o terceiro presente ficava visível para sempre e não podia ser pego: agora some.
- A posição do avatar deixou de ser gravada no estado da interface a cada quadro (seletores rodavam 60×/s).
- Rota 404 passou a compartilhar o tema do site e direcionar para o endereço correto do jogo; não é indexada
  (`noindex`).

### Fixed — verificação

- `apps/client/scripts/verify.mjs`: o toque de teste no celular caía na árvore (abria o painel de doação e escondia
  os botões de zoom); agora toca no chão da praça, ao lado do avatar.

## [0.3.0] - 2026-11-08

**Site público e domínio oficial** ([IMPL-0005](docs/decisions/0005-public-site-and-domains.md)). Schema D1 **v3**
(migration `0003` aplicada em produção junto com este deploy).

### Added

- `apps/site`: site público em <https://www.vilanoeldobem.com.br> — como funciona, doação transparente, critérios
  para ONGs; todos os "Entrar na Vila" levam ao jogo. Página 404 própria; `scripts/verify.mjs` (Chrome real).
- Domínios: jogo em <https://app.vilanoeldobem.com.br>; `vilanoeldobem.com.br` redireciona (301) para `www`.
- Scripts na raiz: `dev:site`, `deploy:site`; `build`/`typecheck`/`test` rodam em todos os apps.

### Changed

- Publicação da 0.2.0 (idiomas) em produção: migration `0003_english_schema` aplicada no D1 remoto.

### Fixed

- CSP bloqueava o beacon do Cloudflare Web Analytics injetado pela zona (erro de console); domínios liberados.

## [0.2.0] - 2026-11-08

**Padronização de idiomas** ([IMPL-0004](docs/decisions/0004-english-code-portuguese-docs.md)): código e conversa com
agentes em inglês, documentação e interface em pt-BR. Mudança incompatível na API e no schema. Schema D1 **v3**.

### Changed

- **BREAKING (API):** `/api/lots` usa `ngo_name`/`ngo_summary`, estados `available`/`application_sent`/
  `under_review`/`published` e ids `plaza-NN`; chaves de `/api/indicators` em inglês (`approved_ngos`,
  `registered_users`, `confirmed_donations`, `confirmed_amount`, `people_impacted`). Textos exibidos não mudaram.
- **BREAKING (schema):** migration `0003_english_schema` recria `ongs` → `ngos` (`ong_id` → `ngo_id`) com estados em
  inglês, preservando dados; `audit_events` passa a usar `ngo.*`.
- Ids de missões em inglês (`explore-gifts`, `play-memory`, `causes-visit-lot`, `causes-global-donation`); o progresso
  local recomeça (chave `vila.progress.v2`).
- Comentários, testes, scripts, tokens CSS e mensagens de `smoke-api.sh`/`verify.mjs` em inglês. Migrations
  `0001`/`0002`: só comentários traduzidos (SQL idêntico).
- `AGENTS.md`/`CLAUDE.md`: agentes respondem em inglês; regra de idiomas em `CONTRIBUTING.md` e no modelo de PR.

### Fixed

- `pnpm deploy` na raiz chamava o comando nativo do pnpm; agora `pnpm run deploy` executa o script.

## [0.1.0] - 2026-11-08

Fundação do repositório e **primeira fatia funcional** (rota de entrega B do doc 23: praça → terreno → jogo →
missão). Stack proposta em [IMPL-0001](docs/decisions/0001-stack-react-threejs-cloudflare.md); doações
desabilitadas por [IMPL-0002](docs/decisions/0002-donations-disabled-until-partner-contract.md).
Schema D1 **v2**.

### Added

- Praça voxel 3D (React + Three.js): árvore central como marcador da doação global, rua circular, postes, palmeiras,
  8 terrenos ao redor (P01, P03; layout provisório, PEN-017).
- Avatar padrão com movimento por teclado (WASD/setas) e por clique/toque; câmera diagonal que acompanha e se
  afasta em telas retrato (estudo, cartão G12).
- Entrada com três caminhos: Explorar ONGs, Jogar, Doação global (DEC-026).
- Painel da doação global com destinatário "Instituição parceira: a definir" e botão desabilitado (DEC-010..013).
- Painel de terreno com os três critérios de elegibilidade (DEC-015) e painel de casa publicada com
  "Jogar gratuitamente" e "Doar para esta ONG" desabilitado (DEC-028/029).
- Jogo da Memória (P09, primeiro jogo do doc 23).
- Caderno de Missões com 4 missões em 3 trilhas (Explorar, Brincar, Conhecer causas), XP e nível; progresso
  idempotente salvo no navegador (DEC-039/040/042; missões e curva são proposta, PEN-025).
- Indicadores públicos lidos da API; valores sem fonte verificável aparecem como "—" (DEC-027).
- Worker Cloudflare com Static Assets e API somente leitura: `GET /api/health`, `/api/indicators`, `/api/lots`.
- D1: migrations `0001_initial` (ongs, lots, audit_events) e `0002_seed_lots` (8 terrenos disponíveis).
- Governança: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, modelo de PR e `docs/` (Diátaxis) com
  ADRs IMPL-0001..0003 e perguntas abertas.
- `apps/web/scripts/verify.mjs`: verificação em Chrome real (desktop e celular) com capturas.
- `scripts/smoke-api.sh`: conferência das rotas da API de qualquer deploy.
- Publicação na conta Cloudflare do projeto: https://vilanoeldobem.vilanoeldobem.workers.dev (Worker `vilanoeldobem`, D1 `vilanoeldobem` em `enam`).

### Security

- Cabeçalhos estritos em `public/_headers` (CSP, `X-Frame-Options: DENY`, `Permissions-Policy` sem pagamento,
  câmera, microfone e localização). API rejeita métodos de escrita (405).

### Known limitations

- Sem contas, cadastro de ONG, painel admin, chat, avatar editável, skins, badges (ver [ROADMAP.md](ROADMAP.md)).
- Progresso de missões existe só no navegador até o cadastro (D06).
- Paleta, tipografia e logo são marcadores provisórios.

<!--
[Unreleased]: <url>/compare/v0.1.0...HEAD
[0.1.0]: <url>/releases/tag/v0.1.0
-->
