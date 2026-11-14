# Arquitetura

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v12 ·
> **Atualizado em:** 2026-11-13
> **Fonte de verdade:** `apps/client/`, `apps/api/`, `apps/server/`, `apps/site/`, `apps/dash/`, `packages/shared/`,
> `migrations/`

## 1. Visão geral

Um Worker por app, cada um no seu subdomínio ([IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

```
www.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-site"   (apps/site: Static Assets; raiz → 301 www)
play.vilanoeldobem.com.br   ──▶ Worker "vilanoeldobem"        (apps/client: Static Assets, SPA, _headers por build)
client.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem"        → 302 play.vilanoeldobem.com.br (apelido)
app.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem"        → 301 play.vilanoeldobem.com.br
api.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-api"    (apps/api) ──▶ D1 "vilanoeldobem" (binding DB)
                                 └─ arquivos de ONG ──▶ R2 "vilanoeldobem-files" (binding FILES; privado; IMPL-0017,
                                    desligado em produção)
server.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem-server" (apps/server)
                                 └─ /room?i=N (WebSocket) ──▶ Durable Object VillageRoom "plaza-0…7" (binding ROOMS)
                                 └─ service binding API ──▶ Worker "vilanoeldobem-api" /moderation/consume
                                    (PROPOSTA, IMPL-0021; desligado em produção)
dash.vilanoeldobem.com.br   ──▶ Worker "vilanoeldobem-dash"   (apps/dash: Static Assets, SPA, _headers por build)
                                 — painel administrativo, IMPL-0015 (publicado em 2026-11-12)

navegador em play.*  ── fetch (CORS) ──▶ api.*      /health, /config, /indicators, /lots, /environment, /ngos/:id
                     ── fetch (CORS + cookie __Host-vila_session) ──▶ api.*  /auth/*, /me, /progress*, /ngo/*, /admin/*
                                                              (só com ACCOUNTS_ENABLED, IMPL-0011)
                     ── WebSocket    ──▶ server.*   /room?i=N
navegador em dash.*  ── fetch (CORS + cookie __Host-vila_session) ──▶ api.*  /health, /config, /lots, /auth/link,
                                                              /auth/verify, /auth/logout, /me, /admin/*
packages/shared (@vila/shared/…) ── importado por client, dash, api e server (lógica pura, sem build)
```

O cliente fala direto com cada serviço. Entre Workers existe um único service binding: o do servidor de tempo real
para a API (`API`), usado só para consumir um tíquete de moderação (PROPOSTA, IMPL-0021; [§4](#4-servidor-de-tempo-real-appsserversrc)). Os hosts de cada build vêm de
`apps/client/src/lib/endpoints.ts` (produção → subdomínios; `vite` e `--mode workers` → Workers locais `:8787` e
`:8788`).

## 2. Cliente (`apps/client/src`)

Camadas marcadas com `shared/` ficam em `packages/shared/src/` e são usadas também pela API ou pelo servidor.

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Lógica | `shared/game/world.ts`, `shared/game/collision.ts`, `shared/game/progress.ts`, `shared/game/quests.ts` | Layout do mundo, colisores (um por peça sólida, medidos pelo desenho), superfícies, paleta, missões/XP e o catálogo/estado das quests (puro, testado) |
| Simulação | `shared/game/motion.ts`, `shared/game/navigation.ts`, `game/sim.ts` | Movimento do avatar em passo fixo de 60 Hz, colisão, passos; rota do clique em volta dos obstáculos, planejada uma vez por clique (puro, testado; [IMPL-0016](../decisions/0016-click-navigation-and-colliders.md)); estado vivo mutável fora do zustand: corpo, pose, campo de navegação e rota ([IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md)) |
| Eventos | `game/events.ts` | Barramento `step` / `gift` / `mission`: pegadas, partículas e som reagem à jogabilidade |
| Estado | `game/store.ts`, `game/questsFlag.ts` | zustand: painel aberto (nenhum na chegada), tela do menu do jogo (`menu`, à parte dos painéis), alvo próximo, destino resolvido do clique, progresso, avisos, dica de como andar (nada por quadro); bandeira de `quests-v1` (`VITE_QUESTS_V1_ENABLED` ou `?quests=1` local, **e** `quests` de `GET /config`) |
| Missões narrativas | `shared/game/quests.ts`, `scene/Props.tsx` (NPCs, itens, atril), `ui/NpcDialog.tsx`, `ui/Missions.tsx`, `ui/Donation.tsx`, `ui/Lot.tsx` | Quests `quests-v1` (PROPOSTA, DEC-039..042, PEN-025): uma missão ativa, diálogo, entrega, bolsa derivada e Caderno de cadeias ([quests.md](quests.md)) |
| Ambiente | `shared/environment/*`, `environment/runtime.ts`, `settings.ts`, `audio.ts`, `labels.ts` | Hora real de SP, relógio de rede, clima procedural, eventos, keyframes (puros, em `shared`); sincronização, presets, som e rótulos (navegador) ([environment.md](environment.md)) |
| Cena 3D | `scene/*` | react-three-fiber; `World` (canvas, presets), `Ground` (chão nevado + clique), `Props` (árvore, postes, terrenos, presentes), `Scenery` (pinheiros, montanhas, lago, bonecos de neve, trenó, cordões de luz), `Player` (movimento, câmera, vista do céu, proximidade) |
| Efeitos | `scene/environment/*` | Driver de uniforms, luz, céu, neve GPU, brilhos, fumaça, pegadas, bloom |
| Voxels | `scene/mesher.ts`, `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código → malha única por papel de material (sólido, lâmpadas, janelas, folhagem) sem faces escondidas, com oclusão de ambiente por vértice; cópias repetidas (`placements`) numa única chamada instanciada |
| Desempenho | `scene/RenderStats.tsx`, `scene/perf.ts` | Chamadas, triângulos, p50/p95 do quadro; resolução adaptativa |
| Interface | `ui/*`, `lib/hud-keys.ts`, `lib/escape.ts`, `lib/controls.ts`, `lib/zoom-gestures.ts`, `lib/dialog-focus.ts`, `lib/veil.ts` | HUD, painéis e menu do jogo em HTML acessível sobre o canvas; mapa de teclas, ordem do Esc, gestos de zoom, foco dos diálogos e clique no véu em módulos puros e testados ([§2.3](#23-chegada-hud-e-menu-do-jogo), [IMPL-0022](../decisions/0022-immersive-entry-and-game-menu.md), PROPOSTA) |
| Serviços | `lib/endpoints.ts`, `lib/services.ts`, `lib/api.ts` | Hosts da API e do servidor por modo de build (e, só como links, as origens do painel e do site público); `fetch` em `api.*` com degradação silenciosa (retorna `null`) |
| Conta | `lib/account.ts`, `ui/Account.tsx`, `ui/NgoApplication.tsx`, `shared/accounts/{validate,contract,errors}.ts` | Bandeira `/config`, link mágico, sessão (cookie `HttpOnly` que o cliente não lê), sincronização do progresso e candidatura de ONG em 4 etapas ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)); tudo some com a bandeira desligada. Com `/config.files` ligado ([IMPL-0017](../decisions/0017-ngo-files-r2.md), PROPOSTA), a tela da candidatura ganha "Arquivos da candidatura" (`ui/ApplicationFiles.tsx`, `lib/files.ts`): logo e documentos conferidos no navegador com as mesmas regras da API e enviados já sem metadados; o painel do terreno publicado mostra o logo (`ui/BlobImage.tsx`: lido por `fetch` e exibido por URL de objeto, sem alargar a CSP). A análise administrativa saiu do jogo: admins veem o link "Abrir painel administrativo" para `dash.*` ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)) e, só com o modo moderação ligado, as ações da linha "Moderação". O painel da conta mostra o papel pelo rótulo compartilhado (`ROLE_LABEL`: "Padrão" / "Administrador"). **Conta bloqueada** (IMPL-0021, PROPOSTA): quando `/me` traz `blocked`, ou quando qualquer rota responde `403 session_blocked` (o cliente relê `/me`), o painel da conta mostra só "Conta bloqueada", a mensagem da administração e a data, e oferece apenas sair e excluir a conta; a sincronização do progresso para sem erro na tela (a Vila volta ao progresso de visitante deste navegador, e os eventos pendentes ficam guardados para quando o bloqueio for desfeito) e a tela da candidatura não consulta a API |
| Rede | `shared/net/protocol.ts`, `net/multiplayer.ts`, `scene/RemotePlayers.tsx` | Presença em tempo real ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)) via `server.*`: pose própria a ≤ 10 Hz, outros visitantes por interpolação de snapshots (150 ms no passado), todos os avatares remotos em 6 chamadas de desenho. Reconexão por `planAfterClose` (puro, testado): sala cheia → próxima; queda → espera exponencial; fechamento por inatividade (`4002`, [IMPL-0014](../decisions/0014-realtime-idle-timeout.md)) ou aba oculta por 2 min → espera o próximo toque, clique ou tecla; **remoção por administrador** (`4003`, PROPOSTA, IMPL-0021) → estado `removed`: aviso "Você foi removido da sala por um administrador." no HUD (`RemovedNotice`), nenhum temporizador e nenhuma reconexão durante 60 s (`REMOVED_HOLD_MS`), mesmo com toques ou teclas; depois disso o próximo toque, clique ou tecla reconecta na mesma sala. Não conta como erro de rede e o resto do jogo segue normal. `presenceLink()` e `onPresenceEvent()` entregam ao fluxo de moderação a conexão aberta (sala e id anunciados pela sala) e as respostas `["m", …]` |
| Moderação | `lib/moderation.ts`, `lib/ngo-moderation.ts`, `lib/confirm.ts`, `net/removal.ts`, `net/pick.ts`, `ui/Moderation.tsx`, `ui/LotModeration.tsx`, `ui/Confirm.tsx`, `scene/ModerationMarker.tsx` | Exceção estreita da [IMPL-0021](../decisions/0021-administrator-role-and-moderation.md): só para conta conectada com papel `admin` e não bloqueada. **Modo moderação**: botão "Moderação" no HUD (`aria-pressed`), desligado a cada carregamento; ligado, a faixa "Modo moderação" fica no topo da tela, acima de qualquer painel. O modo desliga sozinho ao sair, trocar de conta, ser bloqueado, perder o papel (`403 admin_only` faz o cliente reler `/me`) ou quando a sessão termina em outro lugar (`401 not_signed_in` com uma conta na tela: o cliente relê `/me` uma vez, sai com o aviso "Sua sessão terminou. Entre de novo." e não relê pela mesma causa por 60 s). Fora do modo, nada de moderação é renderizado nem consultado na API. **Casa de ONG publicada** (painel do terreno): lê a candidatura por `GET /admin/applications/:id` e mostra só o que pode funcionar — "Remover logo" (`/config.files` e a candidatura tem logo), "Remover foto" para cada foto da galeria pública (`GET /ngos/:id`, vazia com as fotos desligadas, cruzada com `GET /admin/ngos/:id/photos` para a revisão; se essa leitura falha, a seção diz "Não foi possível ler as fotos agora." e oferece tentar de novo), "Retirar ONG da Vila" (`/config.withdrawal`, com a mensagem obrigatória para a organização; PROPOSTA, IMPL-0020) e o link "Abrir no painel" (`<dash>/#applications/<id>`, nova aba). Nada é oferecido ao administrador responsável pela própria organização nem durante a exclusão da conta do responsável. Cada ação relê a candidatura, pede uma confirmação que nomeia a organização e envia a `revision` lida; `409 stale_revision` relê e pede a confirmação de novo (nunca reenvia sozinho); uma recusa mostra a frase do erro; o sucesso relê `/lots`. **Remover visitante** (PROPOSTA, só com `/config.moderation.presence`): um clique no avatar de outro visitante o seleciona (o raio do clique do chão contra uma cápsula por avatar, `pickAvatar`; clique no chão vazio continua andando, e fora do modo o clique nunca seleciona), ou "Selecionar visitante mais próximo" pelo teclado; um anel no chão marca o selecionado. "Remover da sala" pede confirmação e segue bilhete (`POST /admin/moderation/ticket`) → `encodeRemove` na conexão aberta → resposta da sala para aquele alvo. Limites do cliente, mais estritos que os da sala e da API: um pedido por vez; 1100 ms entre mensagens, contados do envio ou da resposta, o que vier depois; no máximo 9 mensagens em 61 s, contadas quando saem; o pedido do bilhete tem 5 s de prazo; 5 s sem resposta da sala é falha e, depois dela, nada mais é enviado naquela conexão até a resposta chegar ou a conexão mudar (as respostas não têm identificador de pedido); se o visitante sai entre o bilhete e o envio, nada é enviado. O resultado de um pedido feito antes de o modo ser desligado e religado, ou de a seleção mudar, é descartado, e qualquer mudança de seleção fecha a confirmação aberta: a confirmação nunca troca de alvo. Só `ok: true` vira "removido"; o resto é "Não foi possível remover agora." com o motivo. O bilhete nunca é guardado, exibido nem registrado. **Confirmações** (`Confirm`, `confirmAllowed`): o foco vai para a pergunta, não para o botão; o segundo clique de um duplo clique, a tecla mantida pressionada e os primeiros 600 ms são ignorados, e o clique do mouse que será ignorado também não leva o foco para o botão de confirmar (`guardConfirmPress`). No HUD, Enter aciona o controle em foco (botão, link ou campo), de moderação ou não, e só abre o que está perto quando o foco não está num controle (`onControl`, `lib/hud-keys.ts`; [§2.3](#23-chegada-hud-e-menu-do-jogo)). Resultados em regiões `aria-live`; nenhum controle de moderação fica dentro do canvas |
| Worker | `worker/index.ts`, `worker/handle.ts` | Roda antes dos arquivos só para redirecionar os outros hosts para `play.*`, com o mesmo caminho e query: `app.*` (301, endereço antigo) e `client.*` (302, apelido); o resto vai para os Static Assets |

`World` é carregado sob demanda (`React.lazy`): o HUD e a tela de carregamento (a marca provisória e "Acendendo
as luzes da Vila…") aparecem antes do Three.js. Não há tela de entrada: quando a cena chega, o visitante já está
na praça ([§2.3](#23-chegada-hud-e-menu-do-jogo)).

### 2.1 Loop por quadro (`Player`)

1. Intenção = a rota do último clique/toque (`sim.route`; painel aberto = parado, a rota fica guardada; o menu
   do jogo **não** para nada: `walkRoute` em `game/sim.ts` só olha o painel). A rota é
   planejada no clique (`setTarget` → `planWalk` → `planRoute`), nunca por quadro; ver §2.2.
2. Simulação em passos fixos de 1/60 s (`stepWalk` → `stepBody`): mira no ponto atual da rota e passa ao seguinte
   quando ele fica à vista; velocidade máxima `8,5 u/s` com aceleração e frenagem exponenciais, desaceleração só ao
   chegar ao destino, colisão com os colisores da cena (`OBSTACLES` + terrenos + `QUEST_OBSTACLES` com as quests
   ligadas) deslizando pelo obstáculo, limite do mundo (`clampToWorld`). Sem progresso por 0,5 s, a rota é
   replanejada de onde o avatar está (até duas vezes) antes de o destino ser abandonado.
3. A cada `0,75 u` andados: evento `step` com a superfície (`surfaceAt`) → pegadas, neve levantada, som de passo.
4. Coleta presentes a < 1,4 u (missão `explore-gifts`; evento `gift`). Concluída a missão, os restantes somem. Com
   `quests-v1` ligada, coleta os itens da missão de coleta ativa (`QUEST_SPAWNS`) e registra a visita à árvore.
5. Pose renderizada interpolada entre os dois últimos passos; pernas e braços seguem a distância andada.
6. Define `nearby` entre NPC, interação de quest, painel de doação, árvore e terreno (menor distância; empate de
   0,5 u segue a ordem de prioridade) → botão de ação.
7. Câmera segue com amortecimento e leve antecipação na direção da velocidade; deslocamento `(0, 24, 21)`,
   multiplicado até 1,8× em telas retrato. Na vista "Olhar o céu", deslocamento `(0, 2.6, 10)` mirando para cima;
   andar encerra a vista.

### 2.2 Colisores e navegação por clique

Decisão e alternativas em [IMPL-0016](../decisions/0016-click-navigation-and-colliders.md). O layout é
**PROPOSTA** (PEN-017/PEN-023; o plano em vigor está em §2.4 e em
[IMPL-0024](../decisions/0024-village-expansion-and-zoning.md)); o que segue descreve só o que bloqueia o avatar.

**Colisor** (`shared/game/collision.ts`): um retângulo arredondado no chão. `{ x, z, r }` é um círculo; com `hx`/`hz`
(meias-medidas do núcleo) e `ux`/`uz` (direção do eixo), uma cápsula ou caixa orientada. Raio do avatar: `0,45`.
Cada peça declara a pegada em unidades locais do modelo (`Solid` em `world.ts`), medida pelos voxels abaixo da
cabeça do avatar e girada com a peça.

| Peça | Colisor | Observação |
|---|---|---|
| Árvore | círculo `r 4,5` (avatar a 4,95 u do eixo) | rama mais baixa; `TREE_RADIUS = 3,5` segue como âncora da interação |
| Pinheiro pequeno / alto | círculo `r 2,2` / `r 3,2` | rama mais baixa menos 0,3 u de folga; posição arredondada como no desenho |
| Poste | círculo `r 0,55`, 0,2 u para `+z` | poste + guirlanda |
| Banco | cápsula 1,5 × 0,5 | ao longo do banco |
| Boneco de neve | círculo `r 0,85` | |
| Trenó | caixa 4,5 × 2,5 (cantos 0,25) | inclui as pontas dos patins |
| Rena | cápsula 2,7 × 1,04 | pernas, corpo e cauda; pescoço e cabeça ficam acima do avatar |
| Barraca / barraca de panetone | caixa 2,94 × 1,68 / 3,78 × 1,68 | balcão + beirada do toldo à altura do peito |
| Cerca | cápsula 2,26 × 0,26 | antes era atravessável |
| Lanterna, placa, caixa de correio, trenó pequeno | círculo `r 0,45`; cápsulas e caixa pela pegada | |
| Morador, NPC de quest | cápsula 1,5 × 0,9 | girada com o morador; NPCs só com as quests ligadas |
| Cachorro, gato, coelho | cápsulas pela pegada | passarinhos e coruja (empoleirados) não bloqueiam |
| Atril de doação | círculo `r 0,5` | só com as quests ligadas |
| Terreno disponível | 4 estacas `r 0,5` + placa (cápsula 3 × 1) | o piso do terreno é caminhável |
| Chalé (ONG publicada) | caixas das paredes e da varanda | pegada do próprio modelo (`GenModel.solid`) |
| Chalé de terreno residencial | caixas das paredes e da varanda | pegada do modelo de `residence()`; sempre desenhado (`plotColliders`) |
| Loja | caixa 7 × 7 | paredes; o toldo e a moldura da placa ficam acima da cabeça |
| Muro, pilar, arbusto, cerca de ripas, cerca-viva, estaca, lenha | caixas pela pegada (voxels de 0,5 u) | o que distingue as faixas residenciais (`RESIDENTIAL_DRESSING`); cerca-viva e lenha fecham o vão entre dois chalés |
| Pilha de lenha (pátio da lenha) | caixa 3,5 × 1,5 | |
| Presentes, itens de quest, lago, borda do mundo | nenhum | a borda é o limite `WORLD_RADIUS = 82,5` |

`apps/client/src/scene/colliders.test.ts` compara cada modelo desenhado com o seu colisor nos dois sentidos: nenhum
voxel sólido fica mais de 0,3 u fora de um colisor e nenhum contorno de colisor fica a mais de 0,35 u de um voxel.

**Navegação** (`shared/game/navigation.ts`):

- `createNavField(colisores)`: grade de 0,25 u sobre o disco do mundo (82,5 u de raio: ≈ 437 000 células); célula
  livre = avatar a pelo menos 0,25 u de todo colisor. Refeita só quando os colisores mudam (casa publicada,
  bandeira das quests): ≈ 8 ms com os ≈ 550 colisores da Vila.
- `planRoute`: resolve o destino (o clique, ou o ponto caminhável mais próximo, do lado de quem chega), vai em linha
  reta se ele está à vista, senão A* na grade e "puxar a corda" para sobrarem poucos trechos retos. Limite: as
  células caminháveis (≈ 200 000); medido em 18 000 pares aleatórios de pontos livres (IMPL-0024): mediana de
  0,45 ms, e 6,5 ms no par que mais expande (83 mil células, 183 u).
  O rascunho da busca guarda 10 bytes por célula (≈ 4,4 MB, alocado na primeira busca que precisa dele).
- `stepWalk`: segue a rota no passo fixo, sem alocar; replaneja se o avatar parar de progredir.
- O alvo guardado no estado (`target`) é o destino resolvido: o marcador e o brilho do clique aparecem onde o avatar
  vai parar.
- Alcance dos terrenos: `LOT_INTERACT_DISTANCE = 6` (a varanda do chalé termina a 4,5 u do centro; com dois
  terrenos vizinhos ao alcance, vale o mais próximo); árvore, NPCs e atril usam `INTERACT_DISTANCE = 4,5`; terreno
  residencial, porta de loja e placa usam `PLACE_INTERACT_DISTANCE = 3,2` a partir do seu ponto de uso.

Verificação em navegador: `node apps/client/scripts/verify-collisions.mjs http://localhost:8799` (só local).

### 2.3 Chegada, HUD e menu do jogo

**PROPOSTA** do responsável técnico ([IMPL-0022](../decisions/0022-immersive-entry-and-game-menu.md); ratificação
na OQ-16).

- **Chegada.** O estado começa com `panel: { kind: "none" }`: nenhum painel abre sozinho e o primeiro clique ou
  toque no chão já anda. Não existe painel de boas-vindas. Quem ainda não andou neste navegador vê uma linha
  ("Clique ou toque no chão para andar."), que aparece com a cena, não recebe cliques, some no primeiro passo ou
  20 s depois de a cena aparecer e não volta depois do primeiro passo. O prazo é contado uma vez pelo store
  (`sceneUp`, chamado pelo `Player`; `MOVE_HINT_MS`), não pela linha, que sai da tela a cada painel; a chave
  `vila.moved.v1` é gravada no primeiro passo, com a linha na tela ou não. Fora das telas de toque
  (`pointer: coarse`) a linha continua com "Sem mouse: “Explorar ONGs” leva até uma casa e Esc abre o menu." (a
  tecla vem de `KEY_BINDINGS`). A frase é anunciada uma vez: fica numa região `role="status"` própria, montada
  vazia com o HUD, e a linha visível é `aria-hidden`. A linha dá lugar ao botão de ação, a um painel, ao menu e
  ao bloco de moderação.
- **HUD** (`ui/Hud.tsx`, os blocos em fluxo, sem posição absoluta; o que não cabe quebra de linha):

  | Onde | O quê | Abre |
  |---|---|---|
  | Topo, esquerda (`EnvironmentChip`) | Hora de São Paulo e clima; "👥 N" (presença); 🌌 olhar o céu | Painel "Ambiente"; alterna a vista |
  | Topo, direita: caminhos (`PATHS`) | "🏡 Explorar ONGs", "🎲 Jogar", "🎄 Doação global", sempre com o nome (no celular, numa linha própria) | Painéis `explore`, `memory`, `donation` |
  | Topo, direita: sistema | 📊 Indicadores; 👤 conta (só com contas ligadas); 🛡️ Moderação (só administradores); ☰ Menu | Painéis `indicators`, `account`; modo moderação; menu do jogo |
  | Abaixo do topo | Bolsa de missão, aviso de remoção da sala, bloco de moderação, aviso passageiro (`toast`) | — |
  | Pé | Dica de como andar ou botão de ação contextual (tecla **E**); "★ Missões" | Painel do que está perto; Caderno de Missões |

  O HUD não tem a marca nem botões de zoom. Rótulos: os caminhos mostram o nome sempre; a conta e o menu, a
  partir de 641 px; "Indicadores" e "Moderação", a partir de 1360 px. Abaixo disso o controle vira ícone com dica
  flutuante (`data-tip`, só onde ele fica sem nome visível) e `aria-label`. No botão da conta, só o apelido é
  abreviado (mais de 12 caracteres, `chipName`; aí a dica aparece em qualquer largura com o texto completo);
  "(bloqueada)" fica num `span` próprio, sempre inteiro. A dica é posicionada pelo grupo do controle, a partir da
  borda externa do grupo, e nunca é mais larga que o HUD: fica dentro da tela e quebra de linha se for longa. Os
  chips têm 44 px de altura; em telas de até 360 px de largura (`@media (max-width: 360px)`) a largura mínima cai
  de 44 para 40 px. Com a faixa "Modo moderação" na tela, o HUD começa abaixo dela. O topo e o pé não encolhem; o
  bloco do meio fica com a altura que sobra e, em tela baixa (celular deitado), o bloco de moderação e o aviso de
  remoção rolam por dentro em vez de cobrir o pé. O aviso passageiro (`toast`) sai da página `TOAST_MS` (3,6 s)
  depois de desenhado; com `prefers-reduced-motion` ele aparece sem animação.
- **Zoom** sem botões: roda do mouse e pinça de dois dedos (`lib/zoom-gestures.ts`, ligados pelo `Player` no
  canvas) e teclas `+`, `=`, `-`; só com nada aberto sobre a Vila.
- **Teclas** (`KEY_BINDINGS`, `lib/hud-keys.ts`; uma única escuta de `keydown`, em `Hud`): `E`/`Enter` abrem o que
  está perto, `+`/`=`/`-` mudam o zoom, `Esc` é a tecla do menu. `E` vale com qualquer foco. `Enter` só quando o
  foco não está num controle que o próprio Enter aciona (botão, link, campo, `summary`, `role="button"` ou
  `"link"`: `onControl`): ali a tecla é do controle. Tecla mantida pressionada abre o que está perto uma vez (o
  zoom continua repetindo), e um Enter segurado que chega a um botão do HUD é descartado (`heldOnControl`): fechar
  o menu com Enter segurado em "Continuar" não o reabre. A tela "Controles" do menu é gerada dessa tabela, de
  `ZOOM_GESTURES` e de `WALK` (`lib/controls.ts`).
- **Esc, um toque por camada** (`escapeAction`, pura; `pressEscape` em `lib/escape.ts` aplica): confirmação aberta
  (`Confirm` se registra em `lib/confirm.ts`) → cancela a confirmação; painel aberto → fecha o painel; menu numa
  tela interna → volta à lista; menu na lista → fecha; nada aberto → abre o menu, exceto com o foco num campo de
  texto. Tecla mantida pressionada e composição de texto (IME) não contam.
- **Menu do jogo** (`ui/Menu.tsx`, estado `menu` do store): diálogo modal pequeno, com véu leve, pelo mesmo
  `Panel` dos painéis (`variant="menu"`; foco entra, Tab fica dentro, foco volta ao fechar:
  `lib/dialog-focus.ts`). Um toque ou clique no véu fecha o diálogo, painel ou menu, no `click` e só quando também
  começou no véu (`lib/veil.ts`): nada do toque sobra para o botão do HUD que estava embaixo, e arrastar de dentro
  do diálogo para fora não fecha. Entradas: "Continuar"; "Configurações" (`EnvironmentSettings`, o mesmo componente do
  painel "Ambiente"); "Controles"; "Ajuda"; "Sair da Vila" (confirmação `Confirm`, depois
  `location.assign(SERVICES.site)`). Abre pelo Esc ou pelo botão "☰ Menu". Não é um painel: a caminhada, a
  presença e o ambiente continuam (`game/menu-runs.test.ts`).
- **Onde a marca aparece:** título da página, tela de carregamento (`Wordmark`) e site público. A página tem um
  `<h1>` só para leitores de tela.

### 2.4 Plano da Vila (IMPL-0024, PROPOSTA)

O layout vem de `VILLAGE_PLAN` (`shared/game/world.ts`): `layoutVillage(plano)` deriva anéis, terrenos, lojas,
placas, ruas e o raio do mundo, e `assertPlan` recusa o plano que não dá para desenhar. O cenário da praça
(postes, feira, trenó, lago, NPCs, itens de quest) é posto à mão para o plano em vigor e **não** acompanha o plano:
os números de cada faixa, a largura das ruas, o quintal e a borda podem mudar sozinhos; lados, tamanho da praça,
largura de avenida e de travessa, fachada e espaçamento das lojas pedem revisar esse cenário. Os ids são
posicionais: só são estáveis enquanto o plano não muda, e depois da migration 0012 aplicada mudar o plano exige
uma migration nova. Decisão, números e o que fica para depois em
[IMPL-0024](../decisions/0024-village-expansion-and-zoning.md).

| Peça | Onde | Constante |
|---|---|---|
| 8 avenidas (a 22,5° + 45°·k) e 8 travessas (no meio de cada lado) | da praça à borda | `PATH_GRAPH` (80 nós, 120 arestas) |
| Fachada da praça: 12 terrenos de ONG e 4 lojas | 26 a 34 u do centro, ao longo de cada lado | `LOTS`, `SHOPS` |
| Placas (uma por loja, no telhado) | sobre as lojas | `BILLBOARDS`, `VILLAGE_NOTICES` |
| Anéis residenciais: 16 `premium`, 32 `standard`, 64 `economy` (ids internos; na tela, "Bairro do Centro", "Bairro do Meio" e "Bairro da Floresta") | 39,5–49,5 / 55–63 / 68,5–75,5 u | `RESIDENTIAL_PLOTS`, `RESIDENTIAL_ROWS`, `plotLabel()` |
| O que distingue as faixas | junto a cada casa | `RESIDENTIAL_DRESSING` (peças), `groundAt()` (calçamento), `STREET_LAMPS` |
| Pátio da lenha, lugar do lojista, lugar da lareira | ponta da travessa norte; ao lado de cada porta; dentro de cada casa | `WOOD_YARD`, `ShopDef.keeper`, `ResidentialPlot.hearth` |

- **Cena** (`scene/Village.tsx`): `Shops` (as quatro lojas e as molduras numa malha por papel de material),
  `Billboards` (os avisos numa textura de canvas, uma chamada de desenho), `Residences` (112 chalés e 256 peças
  assados em 24 blocos, um por faixa de cada lado; as janelas e as lanternas de todos os blocos em duas malhas
  para a Vila inteira). `Ground` pinta o chão por `groundAt()` em faixas de mesma cor. Um bloco residencial ou um
  setor da floresta só projeta sombra enquanto a sombra de alguma peça dele aparece na tela (§10).
- **Interação:** `Player` pergunta, a cada quadro, o que está ao alcance (`game/nearby.ts`, pura) e grava um único
  alvo em `nearby`: árvore, NPC, atril e terreno de ONG primeiro; porta de loja ou placa só quando nenhum daqueles
  está ao alcance; **terreno residencial só com o avatar parado** (andar por uma rua não é uma faixa de avisos). O
  alvo oferecido tem histerese: fica até 0,6 u além do próprio alcance e só troca por outro do mesmo tipo que
  esteja 0,5 u mais perto. O HUD tem **um** botão de ação contextual para todos (`actionLabel` e `activate`, `ui/Hud.tsx`), com
  as regras do [§2.3](#23-chegada-hud-e-menu-do-jogo): `E` com qualquer foco, `Enter` só fora de um controle, tecla
  mantida pressionada abre uma vez, o botão some com um painel ou o menu aberto e a dica de como andar dá lugar a
  ele. Os painéis estão em `ui/Village.tsx`, usam o mesmo `Panel` dos demais (clique no véu, Esc, foco, caminhada
  em espera) e não têm botão além de fechar. O texto deles é neutro (IMPL-0024 §4 e §6): o terreno e o bairro e
  "não têm dono… proposta em estudo e ainda não foi decidida"; a loja "está fechada"; a placa "mostra avisos da
  própria Vila". Nenhum diz "em breve", requisito, venda ou aluguel enquanto `/config.residentialPlots` é falso, e
  nenhum mostra id cru (os ids ficam em atributos `data-`). Um terreno de ONG que a API não lista é "Terreno em
  preparação" no rótulo 3D, no painel e na lista (`lib/lots.ts`).
- **Clique na cena** (`game/clicks.ts`, pura): o chão fica embaixo de todo toque e chama `pressScene`, que
  decide nesta ordem. (1) No modo moderação com a remoção de visitantes ligada (IMPL-0021, PROPOSTA), o toque
  sobre outro visitante o seleciona, o que quer que esteja atrás dele (chão, piso de terreno, loja, chalé, árvore,
  NPC), e esse toque não faz mais nada: não anda, e o clique seguinte não abre painel; para todos os outros a
  escolha nunca acontece. (2) O chão só anda quando é a primeira coisa sob o ponteiro que responde a clique;
  com outra coisa na frente, quem decide é o clique nela. Testes: `game/clicks.test.ts` e
  `scene/Ground.test.tsx` (o manipulador montado na cena). Clique em loja, placa ou chalé residencial abre o painel do alcance do botão de ação e, de
  longe, anda até o ponto de uso, com o marcador do toque lá; num chalé cujo telhado cobre a rua na tela, vale o
  chão sob o ponteiro (calçamento: anda até o ponto tocado). Terreno de ONG, árvore e atril abrem o painel. Um
  painel aberto por clique na cena descarta a caminhada em curso.
- **Avatar visto através das construções:** a câmera olha do sul, de cima; enquanto ela não vê o peito ou a cabeça
  do avatar, ele é desenhado mais uma vez, nas próprias cores e meio transparente, por cima de tudo. O teste é
  uma reta de verdade (`scene/occlusion.ts`: da câmera aos dois pontos, contra o mapa de colunas dos chalés, das
  lojas, da árvore e dos pinheiros de `scene/sceneColliders.ts`), refeito só quando o avatar andou 0,2 u ou a
  câmera se mexeu (nunca com os dois parados, nem em "Olhar o céu"). O desenho aparece na hora e fica por 250 ms
  depois que o avatar volta a ser visto (`seeThroughShown`, por tempo), para não piscar nos vãos entre os chalés
  de uma fileira. Só o próprio avatar: os outros visitantes não têm esse desenho. "Olhar o céu" usa as mesmas colunas para
  subir a câmera por cima dos telhados onde uma construção ficaria na vista.
- **Rótulos 3D e o HUD** (`Label` em `scene/Props.tsx`, `lib/hud-chrome.ts`): um rótulo só existe na página com o
  objeto a até 28 u do avatar, e fica escondido enquanto cairia sobre um botão, a linha de como andar ou um aviso
  do HUD (comparado a cada 6 quadros com as caixas do HUD, relidas no máximo a cada 400 ms). Num celular o HUD
  ocupa o alto e o pé da tela, e o rótulo da árvore caía embaixo dele no spawn.
- **Colisores da cena:** `scene/sceneColliders.ts` monta a lista que o avatar contorna (obstáculos fixos, NPCs e
  atril com as quests, terrenos de ONG e os 112 chalés residenciais); `scene/colliders.test.ts` audita essa mesma
  lista contra os voxels desenhados, então tirar um tipo de colisor dela falha num teste unitário.
- **Regra de vista** (`SIGHTLINE`, `sightlines()`): (1) toda avenida é um corredor livre de coisa alta (chalé,
  loja, pinheiro) até as ramas da árvore; (2) da frente de todo terreno residencial, a avenida fica a no máximo
  30 u pela rua; (3) nada alto entre a linha das varandas da fachada e a rua redonda. As regras 2 e 3 decorrem do
  layout, salvo o comprimento da 2. A regra não diz que a árvore é vista de todo terreno. Conferida em
  `shared/game/village.test.ts` para o plano em vigor; nas variações do plano, só a geometria.

### 2.5 Vida na Vila (IMPL-0025, PROPOSTA)

Trinta personagens e animais andam pela Vila. Nada disso passa pelo servidor: cada cliente calcula onde cada um
está a partir do relógio sincronizado e da semente do mundo, que já tinha.

- **Simulação compartilhada** (`shared/game/life.ts`, pura): `LIFE_CAST` é a tabela (quem, pontos, rotina por
  horário, grupo); `compileLife(semente)` sorteia o que é de cada um (passo, quanto fica, pontos preferidos, faixa
  na rua, fase do grupo); `sampleLife(vida, t)` devolve posição, direção, presença (0 = fora de cena), atividade,
  ponto e distância andada de todos. O tempo de cada grupo é cortado em fatias; na fatia `k` o personagem vai de
  `escolha(k − 1)` a `escolha(k)` (hash de semente, personagem e número da decisão, com os pesos da hora, da neve
  e dos eventos do minuto em que a fatia começa) por uma polilinha fixa, em passo constante: forma fechada,
  contínua no tempo, sem estado. Custa cerca de 0,5 µs por quadro para o elenco inteiro e não aloca.
- **Caminhos** (`LIFE_PATHS`): o `PATH_GRAPH` sem as cordas da rua redonda e sem o nó sobre o lago, mais trilhas
  em chão livre. Todo ponto e toda rota ficam em chão livre nos dois conjuntos de colisores; personagens cujos
  caminhos se encontram formam um grupo e andam um de cada vez; grupos diferentes nunca chegam a menos de dois
  corpos um do outro (`shared/game/life.test.ts`, estático e por amostragem de 24 h).
- **No cliente** (`game/village-life.ts`): `tickLife` roda uma vez por quadro, antes do quadro do avatar: avalia a
  simulação para a hora do quadro, decide quem é desenhado (distância ao avatar por preset, com histerese) e
  calcula a pose. `game/life-reactions.ts` (pura) é a camada **local e só visual**: o personagem dá passagem aos
  avatares, e reage ao do próprio visitante conforme o tipo. O desvio nunca passa de 1 u, volta a zero sozinho e
  nunca é escrito na simulação; cada visitante vê a sua.
- **Sem colisor.** Personagens não estão em `sceneColliders` nem na grade de navegação: o avatar atravessa o
  lugar deles e eles saem da frente. É a exceção à regra do §2.2.
- **Desenho** (`scene/Life.tsx`): uma malha para o elenco (`scene/life/castGeometry.ts`, 12 388 triângulos com
  os 30), um passo no shader de vértice que lê uma textura de dados com uma linha por personagem
  (`scene/life/lifeMaterial.ts`) e um buffer de índices só com quem está perto: uma chamada de desenho, duas com
  a sombra. Os bonecos vêm de `scene/gen/cast.ts`.
- **Conversar.** `Nearby` tem o tipo `life`; `pickNearby` recebe o personagem parado mais próximo (até 2,4 u) e o
  oferece por último: nunca no lugar de um NPC de quest, de uma interação de quest, do atril, da árvore ou de um
  terreno de ONG; contra porta de loja, placa ou terreno residencial ganha o mais próximo, e o empate é do lugar.
  A ação abre `LifeDialog` (`ui/NpcDialog.tsx`) com as linhas de `lifeTalk` (`shared/game/life-dialogue.ts`)
  escolhidas naquele momento. Um clique no personagem abre a fala de perto ou leva o avatar até ele
  (`visitCharacter`, `game/clicks.ts`).
- **Opção:** "Mostrar os moradores e os animais da Vila" (`environment/settings.ts`, `characters`), só neste
  aparelho.

## 3. API (`apps/api/src`)

| Módulo | Responsabilidade |
|---|---|
| `index.ts` | Só o handler `fetch` (o runtime não aceita outros exports nomeados) |
| `api.ts` | `handleApi`: roteador, CORS com credenciais só para origens exatas de `ALLOWED_ORIGINS`, rotas públicas `/health`, `/config`, `/indicators`, `/lots`, `/environment`, `/ngos/:id` e mídias aprovadas e a porta das rotas de conta (bandeira `ACCOUNTS_ENABLED`, `Origin` permitida, limite `AUTH_LIMITER` em `/auth/*`). `/environment` é a autoridade da hora (sem estado; IMPL-0006). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo |
| `http.ts` | Respostas JSON, `HttpError` (código estável + `fields` em pt-BR), leitura de corpo JSON (`415`/`413`/`400`), lista de origens |
| `crypto.ts` | UUID, token aleatório (256 bits por padrão; 192 bits em 32 caracteres para o bilhete de moderação), SHA-256 |
| `auth.ts` | Cadastro (P13), link mágico (OQ-03), verificação, logout, `GET`/`DELETE /me`. O link abre o jogo, ou o painel quando o pedido vem exatamente de `DASH_ORIGIN` (IMPL-0015) |
| `session.ts` | Cookie `__Host-vila_session`, usuário atual, `requireUser` / `requireAdmin`. `requireUser` recusa a sessão de conta bloqueada (`403 session_blocked`); `requireSession` é só para o que a pessoa bloqueada mantém: `GET /me`, sair e excluir a conta (IMPL-0021) |
| `mail.ts` | Mensagem do link (pt-BR, texto e HTML) e envio pela API do Resend (segredo `RESEND_API_KEY`, IMPL-0012); `devLink` só em desenvolvimento e teste |
| `progress.ts` | XP no servidor (P14, DEC-042): eventos idempotentes e repetição com `applyEvent` compartilhado; whitelist das quatro missões e das quests (`QUESTS_V1_ENABLED`); evento de quest gravado só quando é transição válida (IMPL-0013) |
| `ngo.ts` | Candidatura de ONG (P12, DEC-015): validação, reserva do terreno, reenvio |
| `files.ts` | Arquivos da candidatura no R2 ([IMPL-0017](../decisions/0017-ngo-files-r2.md), PROPOSTA, bandeira `NGO_FILES_ENABLED`): envio com conferência do conteúdo, leitura por quem enviou e por admins (auditada), logo público da ONG publicada; `media_upload_intents` rastreia envio/limpeza, recuperável por responsável/admin em `files/recover`, inclusive com envio desligado; exclusão de conta inclui intenções |
| `media-storage.ts` | Primitiva comum de logo/documentos e galeria: reserva vazia, releitura de autorização, PUT condicionado ao ETag e uma repetição limitada em throttling; impede escrita tardia de bytes pessoais após remoção da reserva |
| `public-ngo.ts` | Perfil aprovado com lista explícita de campos públicos, tolerante ao schema v3; só ONG com terreno publicado |
| `ngo-photos.ts` | Galeria institucional PROPOSTA, bandeira `NGO_PHOTOS_ENABLED` desligada em produção, separada de comprovantes; aprovação por foto, bytes privados em `FILES` e publicação condicionada à revisão técnica/operacional |
| `admin.ts` | Análise administrativa (DEC-037): lista, detalhe com histórico e arquivos, decisões auditadas |
| `ngo-withdrawal.ts` | Retirada administrativa de ONG publicada (IMPL-0020, **PROPOSTA**, bandeira `NGO_WITHDRAWAL_ENABLED` desligada): registro em `ngo_withdrawals`, liberação dos terrenos e auditoria num batch com token exclusivo; a mensagem é para a organização |
| `backoffice.ts` | Listas só de leitura do painel administrativo (IMPL-0015): `GET /admin/audit` e `GET /admin/users` (sem e-mail e sem nome; com papel e bloqueio), paginadas |
| `account-moderation.ts` | Papéis e bloqueio de conta ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)): `POST /admin/users/:id/role`, `…/block`, `…/unblock`. Um batch por mudança, conferindo no SQL o estado da conta-alvo e que quem pede ainda é administrador; só o vencedor grava registro e auditoria. O bloqueio é **PROPOSTA** (`ACCOUNT_BLOCK_ENABLED` desligada); a mensagem é para a pessoa bloqueada |
| `presence-moderation.ts` | Remoção de visitante de uma sala (IMPL-0021, **PROPOSTA**, `PRESENCE_MODERATION_ENABLED` desligada): bilhete de uso único para o administrador (`POST /admin/moderation/ticket`) e consumo pelo servidor de tempo real (`POST /moderation/consume`, sem sessão e sem CORS) |

Único app com acesso ao D1 e ao bucket R2. Detalhes em [api.md](api.md) e [storage.md](storage.md).

**Administrador e moderação ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)):** dois papéis,
Padrão (`player`) e Administrador (`admin`); o painel continua com o login próprio da aplicação, e os papéis são
concedidos e retirados pelo painel, com auditoria (o primeiro administrador segue sendo criado no banco). Um
administrador também tem, **dentro do jogo**, as ações de moderação — exceção estreita à regra da IMPL-0015: o
jogo pode mostrar *ações* de moderação a um administrador conectado; listas, filas de análise e auditoria ficam
no painel. Duas partes são **PROPOSTA** e ficam desligadas em produção e homologação:

- **Bloqueio de conta** (`ACCOUNT_BLOCK_ENABLED`; política PENDENTE na [OQ-11](../decisions/open-questions.md)):
  encerra as sessões e deixa à conta uma sessão restrita (ler o motivo, sair, excluir a conta). A conferência é
  feita em toda leitura de sessão (`users.blocked`, migration 0010), então as rotas com sessão respondem
  `503 schema_outdated` num banco sem a 0010. Nenhuma rota pública lê as tabelas novas.
- **Remover um visitante de uma sala** (`PRESENCE_MODERATION_ENABLED`, na API e no servidor): a presença continua
  anônima. A API só emite e confere um bilhete de uso único; a sala o devolve por um binding de serviço e nunca
  fica sabendo quem é o administrador. É uma cortesia, não um banimento: um visitante anônimo pode voltar.

**Retirada de publicação (PROPOSTA, [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)):** desligada em
produção e homologação (`NGO_WITHDRAWAL_ENABLED`); a política é PENDENTE ([OQ-14](../decisions/open-questions.md)).
A tabela aditiva `ngo_withdrawals` marca a retirada sem mudar `ngos.status` (continua `published`); as rotas
privadas projetam o estado efetivo `withdrawn`. No mesmo batch, a retirada incrementa a revisão, libera os
terrenos efetivamente associados e grava uma auditoria. **As projeções públicas de uma ONG exigem o terreno
publicado e não leem essa tabela**: a ONG retirada some de `/lots`, `/indicators`, do perfil, do logo e das
fotos, e as rotas públicas respondem igual nos schemas v3 a v9. As rotas de candidatura e análise leem a tabela
e respondem `503 schema_outdated` sem a migration 0009. O texto que o admin escreve é a mensagem lida pela
organização; não entra em resposta pública nem na auditoria. O jogo precisa recarregar para atualizar uma cena
aberta; não há broadcast de retirada nem alteração de XP ou missões.

### 3.1 Fluxo de entrada (link mágico)

```
jogo (play.*)                     API (api.*)                          D1 / Resend
 │ POST /auth/register ou /link ─▶ valida, limita (IP e 3 links/15 min)
 │                                 token aleatório ──────────────────▶ login_tokens (SHA-256, 15 min)
 │                                 envia e-mail ─────────────────────▶ Resend (só o link)
 │ ◀── 202 {ok} (+ devLink fora de produção)
 │ pessoa abre <origin>/#login=<token>   (fragmento: nunca chega a servidor)
 │ POST /auth/verify {token} ────▶ marca used_at (uso único), verified_at
 │                                 cria sessão ──────────────────────▶ sessions (SHA-256, 30 dias)
 │ ◀── 200 {user} + Set-Cookie __Host-vila_session (HttpOnly, Secure, SameSite=Lax)
 │ GET /progress, POST /progress/events {accountId} (visitante, lotes de 50) ─▶ progress_events
 │ apaga o progresso de visitante do navegador e mostra o da conta; cada evento novo é enviado
```

O token sai da barra de endereço antes de qualquer script de terceiros: `public/login-fragment.js` roda antes do Google Tag Manager, guarda o token só em memória e `initAccount` o consome uma vez. O link aponta para o jogo, não para a API, para que scanners de
e-mail que "clicam" links não consumam o token.

O painel administrativo usa o mesmo fluxo, só com `POST /auth/link` (não cria conta). Quando o `Origin` do pedido é
exatamente `DASH_ORIGIN`, o link abre `dash.*/#login=<token>` em vez do jogo; a sessão é o mesmo cookie
([IMPL-0015](../decisions/0015-dash-backoffice-app.md)).

## 4. Servidor de tempo real (`apps/server/src`)

- `index.ts`: handler `fetch` e a classe `VillageRoom` (únicos exports aceitos pelo runtime).
- `handler.ts`: `/health` e `/room?i=N`; confere `Upgrade: websocket`, `Origin` (lista exata `ALLOWED_ORIGINS`,
  `originAllowed` em `env.ts`) e o
  número da sala antes de encaminhar ao Durable Object.
- `room.ts` (lógica pura, testada) e `room-do.ts` (Durable Object `VillageRoom`, API de hibernação de WebSocket):
  presença efêmera em memória, autoritativa para o que os outros veem (pose saneada, sem teletransporte, limite de
  mensagens), transmissão em lote a 10 Hz só enquanto há alguém; sala vazia hiberna. Nada é gravado no storage.
- Inatividade ([IMPL-0014](../decisions/0014-realtime-idle-timeout.md)): `room.ts` guarda a hora da última atividade
  real de cada conexão (`reapIdle`); o mesmo timer de 10 Hz de `room-do.ts` fecha com `4002` quem passou de
  `IDLE_TIMEOUT_SECONDS` (`idleTimeoutMs` em `env.ts`, padrão 300 s). Sem alarme (alarme grava no storage): a hora
  fica em memória, com uma cópia aproximada (a cada 30 s) no anexo do WebSocket, que o runtime guarda junto da
  conexão e não no storage do objeto. Assim uma aba esquecida não mantém o timer, e a cobrança de duração, ligados.
- Remoção de visitante por administrador (**PROPOSTA**, [IMPL-0021](../decisions/0021-administrator-role-and-moderation.md); `PRESENCE_MODERATION_ENABLED`,
  desligada em produção): `room.ts` aplica os limites por conexão ao pedido `["m", alvo, tíquete]`; `room-do.ts`
  (`removeOnRequest`) pergunta à API se o tíquete vale, por `moderation.ts` (`consumeTicket`: service binding `API`,
  limite de 3 s, só `200 {"ok":true}` é sim), e só então fecha o alvo com `4003`. É a única chamada do servidor à
  API. A sala continua sem saber quem é ninguém; não guarda nem registra o tíquete, a resposta ou quem pediu, e só
  atende pedidos depois de 35 s em memória (`REMOVAL_WARMUP_MS`). Protocolo em
  [api.md](api.md#remoção-por-administrador-proposta).

## 5. Código compartilhado (`packages/shared/src`)

Importado como `@vila/shared/<pasta>/<módulo>` (TypeScript direto, sem build). Sem DOM, three.js ou runtime da
Cloudflare.

| Pasta | Módulos | Usado por |
|---|---|---|
| `game/` | `world.ts`, `collision.ts`, `motion.ts`, `navigation.ts`, `progress.ts`, `quests.ts` | client, server (limites do mundo e velocidade na sala), api (`progress.ts`: XP no servidor e eventos de quest) |
| `game/` | `life.ts`, `life-dialogue.ts` | client: onde está cada personagem da Vila num instante (`sampleLife`, função pura de semente, hora e plano) e as falas fixas de cada um (IMPL-0025). **O servidor de tempo real e a API não os importam** |
| `accounts/` | `validate.ts` | client (formulários), api (mesmas regras e mensagens pt-BR do cadastro e da candidatura), dash (rótulos das áreas) |
| `accounts/` | `files.ts` | api (autoridade), client e dash: tipos de arquivo da candidatura, limites, detecção do formato pelos bytes, limpeza de metadados de imagem e frases de erro (IMPL-0017) |
| `accounts/` | `contract.ts`, `errors.ts` | client e dash: formas das respostas de conta e de análise, rótulos de situação, `ApiError` e a frase em pt-BR de cada código de erro |
| `environment/` | `config.ts`, `time.ts`, `random.ts`, `weather.ts`, `events.ts`, `keyframes.ts`, `network-clock.ts`, `frame.ts` | client, api (`/environment`), site (só `config.ts` e `time.ts`: relógio e fases do dia) |
| `net/` | `protocol.ts` | client, server |

## 6. Site (`apps/site`)

Site público estático ([IMPL-0005](../decisions/0005-public-site-and-domains.md)); links para o jogo apontam para
`play.vilanoeldobem.com.br` (a página `404.html` inclusive, que é `noindex`). Não importa nada dos outros apps; de
`packages/shared` usa só o relógio e as fases do dia (`environment/config.ts`, `environment/time.ts`).

Identidade **"Vila Voxel Nevada"**, alinhada ao jogo ([IMPL-0006](../decisions/0006-christmas-environment-real-time-procedural-weather.md))
sem carregar Three.js:

| Peça | Código | Papel |
|---|---|---|
| Tokens | `src/styles.css` | Papéis semânticos em `oklch()` a partir da paleta de `shared/game/world.ts`; temas Dia Nevado e Noite Natalina (elevação tonal, nunca inversão) |
| Arte | `src/VoxelArt.tsx` | Marca decorativa do cabeçalho (estrela e pinheiro), pinheiros, chalés, neve e ícones em SVG `crispEdges`; cordão de lâmpadas em blocos |
| Neve | `src/VoxelSnow.tsx` | Canvas 2D isolado, PRNG determinístico, pausa em aba oculta. Neve desligada: o canvas sai da página. Neve ligada com `prefers-reduced-motion`: um quadro parado. Cores lidas dos tokens uma vez e de novo a cada troca de tema |
| Relógio | `src/villageClock.ts` | Hora de São Paulo (`Intl`) e fase do dia com as fronteiras `CYCLE` de `@vila/shared/environment/config`, as mesmas do jogo |
| Conteúdo | `src/App.tsx` | Hero com o relógio da Vila, diorama de três cenas reais do jogo, seções aprovadas. Marca: texto temporário (IMPL-0005), sem imagem de logo (DEC-024, PEN-016) |
| Comportamento | `public/theme.js` | Aplica o tema salvo antes do primeiro quadro (CSP sem script inline) |

Preferências do visitante ficam em `vila.site.theme.v1` e `vila.site.snow.v1` (por aparelho). A verificação
(`scripts/verify.mjs`, Chrome real) cobre `/` e `/404.html` em oito larguras, dois temas, interação, ordem do
teclado e contraste do anel de foco, o que a neve pinta (ligada, desligada, movimento reduzido), zoom de texto,
cores forçadas, contraste alto, página sem JavaScript e impressão.

## 7. Limites entre apps

- **Imports:** apps nunca importam uns dos outros. O que for usado por mais de um app vai para `packages/shared`, que
  é puro (sem DOM, three.js ou runtime da Cloudflare). Código de navegador fica em `apps/client`; código de Worker
  fica no app dono da rota.
- **Trocar um host** exige mudar todos os lugares que o citam, juntos (senão o navegador bloqueia por CSP ou CORS,
  ou o servidor recusa o WebSocket com `403`):
  1. `apps/client/src/lib/endpoints.ts` (hosts usados pelo cliente e pelo `connect-src` da CSP; também a origem do
     painel, usada só no link "Abrir painel administrativo", e a do site público, usada só em "Sair da Vila" e na
     ajuda do menu do jogo);
  2. `ALLOWED_ORIGINS` em `apps/api/wrangler.jsonc` (origens que recebem CORS) e `ACCOUNT_ORIGINS` (origens que usam
     rotas de conta e recebem CORS com credenciais: o jogo e o painel);
  3. `ALLOWED_ORIGINS` em `apps/server/wrangler.jsonc` (origens aceitas no WebSocket);
  4. `GAME_ORIGIN` e `DASH_ORIGIN` em `apps/api/wrangler.jsonc` (para onde os links de acesso apontam);
  5. `apps/dash/src/lib/endpoints.ts` (API usada pelo painel e pelo `connect-src` da CSP dele; servidor e jogo só
     como links).

  Em desenvolvimento local, as listas vêm do script `dev` de cada app (`--var ALLOWED_ORIGINS:…`).

## 8. Configuração (`wrangler.jsonc` de cada app)

| App | Chave | Valor | Motivo |
|---|---|---|---|
| todos | `account_id` | `9119b7496767fec497f6627c5ca56f32` | Conta do projeto |
| todos | `routes` | Custom Domain do app | Um subdomínio por Worker |
| todos | `observability.enabled` | `true` | Logs de erro (requisito do doc 06) |
| client | `assets.not_found_handling` | `single-page-application` | Rotas do cliente caem no `index.html` |
| client | `assets.run_worker_first` | `true` | Worker só redireciona `app.*` e `client.*`; o resto vai para `ASSETS` |
| api | `d1_databases[0]` | binding `DB`, `migrations_dir: ../../migrations` | Migrations na raiz do repo |
| api | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br,https://www.vilanoeldobem.com.br,https://dash.vilanoeldobem.com.br` | CORS por origem exata |
| api | `vars.ACCOUNT_ORIGINS` | `https://play.vilanoeldobem.com.br,https://dash.vilanoeldobem.com.br` | Só o jogo e o painel usam rotas de conta e recebem CORS com credenciais |
| api | `vars.GAME_ORIGIN` | `https://play.vilanoeldobem.com.br` | Base dos links de acesso |
| api | `vars.DASH_ORIGIN` | `https://dash.vilanoeldobem.com.br` | Base do link quando o pedido vem exatamente desta origem (IMPL-0015) |
| api | `vars.ACCOUNTS_ENABLED` | `"false"` | Contas desligadas até a revisão LGPD / ECA Digital (IMPL-0011) |
| api | `vars.MAIL_FROM` | `acesso@vilanoeldobem.com.br` | Remetente do link de acesso |
| api | segredo `RESEND_API_KEY` | fora do `wrangler.jsonc` (`wrangler secret put`) | Chave do Resend (só o link de acesso, IMPL-0012) |
| api | `ratelimits` | `AUTH_LIMITER`, 10 requisições / 60 s | Limite por IP em `/auth/*` (IP não gravado) |
| api | `ratelimits` | `FILE_LIMITER`, 20 requisições / 60 s | Limite por conta no envio de arquivos (IMPL-0017) |
| api | `ratelimits` | `MODERATION_LIMITER`, 60 requisições / 60 s | Limite de `POST /moderation/consume` por endereço de quem chama; as chamadas pelo binding de serviço não têm endereço e são contadas por sala, só quando o bilhete foi emitido (IMPL-0021) |
| api | `vars.ACCOUNT_BLOCK_ENABLED` | `"false"` | Bloqueio de conta (PROPOSTA) desligado até a resposta da OQ-11; controla só novos bloqueios (IMPL-0021) |
| api | `vars.PRESENCE_MODERATION_ENABLED` | `"false"` | Remoção de visitante de uma sala (PROPOSTA) desligada; exige também a bandeira e o binding de serviço no servidor de tempo real (IMPL-0021) |
| api | `r2_buckets[0]` | binding `FILES` → bucket `vilanoeldobem-files` | Arquivos das candidaturas; bucket privado, **ainda não criado** (IMPL-0017) |
| api | `vars.NGO_FILES_ENABLED` | `"false"` | Envio de logo e documentos desligado até a lista de documentos (PEN-019) e a revisão LGPD |
| server | `durable_objects` + `migrations` | binding `ROOMS` → `VillageRoom` (SQLite, tag `v1-village-room`) | Salas de presença (IMPL-0008) |
| server | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br` | WebSocket só do jogo |
| server | `vars.IDLE_TIMEOUT_SECONDS` | `"300"` | Segundos sem atividade até a sala fechar a conexão (IMPL-0014); inteiro de 60 a 86400, senão vale 300 |
| server | `services[0]` | binding `API` → Worker `vilanoeldobem-api` | Única chamada do servidor à API: consumir tíquete de moderação (PROPOSTA, IMPL-0021); sem o binding a sala responde `0` |
| server | `vars.PRESENCE_MODERATION_ENABLED` | `"false"` | Remoção de visitante por administrador desligada (PROPOSTA, IMPL-0021); o script `dev` liga |
| dash | `assets.not_found_handling` | `single-page-application` | App de página única; sem `main` (não há script de Worker) nem bindings |
| dash | `workers_dev`, `preview_urls` | `false` | O painel só responde no domínio próprio |

## 9. Segurança

`_headers` do jogo, gerado a cada build por `apps/client/security-headers.ts` (via `vite.config.ts`): CSP
`default-src 'self'`, `connect-src` com exatamente a API e o servidor da build (fontes do Google, Cloudflare Web
Analytics e Google Tag Manager / GA4 liberados), `X-Frame-Options: DENY`, `Permissions-Policy` negando câmera, microfone, localização e
pagamento; `/assets/*` com cache imutável de 1 ano. O HTML faz `preconnect` para a API. A API manda CORS só para
origens exatas; o servidor recusa WebSocket de outra origem (`403`), o que bloqueia sequestro de WebSocket.

Rotas de conta: só respondem a `Origin` permitida (`403 forbidden_origin`); mutações exigem
`Content-Type: application/json` (`415`), o que força o preflight de CORS; sessão e links guardados só como hash;
cookie `HttpOnly`, `Secure`, `SameSite=Lax`; nenhum dado pessoal em log.

`POST /moderation/consume` (IMPL-0021, PROPOSTA) é a única rota de escrita sem sessão e sem conferência de
`Origin`: quem a chama é o servidor de tempo real, por binding de serviço, e a credencial é o bilhete (192 bits
aleatórios, guardado como hash, 30 segundos, uso único, preso a um administrador, uma sala e um alvo). Ela não
envia nenhum cabeçalho CORS e só aceita JSON, então nenhuma página consegue usá-la; responde o mesmo `404` a tudo
o que não é um bilhete válido e tem limite de requisições próprio.

Arquivos de ONG ([IMPL-0017](../decisions/0017-ngo-files-r2.md)): bucket R2 privado, lido só pela API; o formato é
conferido pelos bytes (SVG e HTML recusados), imagens perdem os metadados antes de serem guardadas, e os bytes saem
com `nosniff`, CSP `default-src 'none'; sandbox` e, nos documentos, como download. Nome de arquivo não é guardado.

`_headers` do painel, gerado a cada build por `apps/dash/security-headers.ts`: CSP mais estrita que a do jogo
(`default-src 'self'`, sem script ou estilo inline, nenhum terceiro, `img-src 'self' blob:` para a prévia do logo de uma candidatura, `connect-src 'self'` + exatamente a API da
build, `frame-ancestors 'none'`, `base-uri 'none'`), `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy:
no-referrer`, `Cross-Origin-Opener-Policy: same-origin`; o HTML sai com `Cache-Control: no-store, no-transform`.

## 10. Desempenho

Medido em `pnpm build` (2026-11-10). O HTML só pré-carrega `react` e `index`; `three` chega com a cena
(`World`, `lazy`) e o bloom (`PostFx`) só nos presets Alta/Ultra.

| Item | Valor |
|---|---|
| Chunk `three` (three + r3f + drei `Html`) | ~924 kB / 245 kB gzip (r3f importa `* as THREE`: sem tree-shaking do three) |
| Chunk `react` (react, react-dom, scheduler, zustand) | ~221 kB / 69 kB gzip |
| App (`index` + `World`) + CSS | ~85 kB / 30 kB gzip |
| `PostFx` (bloom, sob demanda) | ~20 kB / 5 kB gzip |
| Chamadas de desenho (medido, `verify.mjs`, Média, "dia-neve") | 56 (antes da malha de voxels: 96), sombra incluída |
| Triângulos por quadro (mesma cena) | ~108 mil (antes: ~362 mil) |
| Vila expandida (2026-11-13, Média, spawn, 12:00 com neve, Chrome com GPU) | 102 chamadas e ~165 mil triângulos (antes da expansão: 70 e ~122 mil); com o zoom todo afastado sobre a praça, às 15:30 com céu limpo: 116 e ~211 mil. Depois da revisão (floresta e montanhas desenhadas em pedaços): no spawn, 101 chamadas e ~113 mil triângulos; com o zoom todo afastado às 15:30, 113 e ~155 mil; o quadro mais caro de um roteiro a pé com o zoom todo afastado caiu de ~252 mil para ~196 mil triângulos, com no máximo 141 chamadas. Orçamento: 150 chamadas e 250 mil triângulos, que o `verify.mjs` confere no spawn com o zoom padrão e com o zoom todo afastado ([IMPL-0024](../decisions/0024-village-expansion-and-zoning.md#desempenho)) |
| Floresta e montanhas | Cada setor da floresta (8) é malhado como um modelo e desenhado em até 4 pedaços (pinheiros da praça, do cinturão, floresta em duas metades); as montanhas, em 8 setores. Cada pedaço é descartado pela câmera sozinho; os triângulos são os mesmos da malha inteira (`scene/voxelParts.test.ts`) |
| Passada de sombra | Blocos residenciais (24) e pedaços da floresta só entram enquanto a sombra de alguma peça deles aparece na tela (`scene/shadowCasters.ts`, `scene/ShadowCulling.tsx`): uma esfera por chalé, peça e pinheiro, testada contra a caixa do mapa de sombra e contra a câmera, no `onBeforeRender` da cena. A imagem não muda |
| Vida na Vila (2026-11-13, IMPL-0025; Chrome com GPU, Média, spawn, 12:00 com neve) | 91 chamadas e ~138 mil triângulos (antes: 101 e ~113 mil): o elenco inteiro é uma chamada, duas com a sombra, e até ~12 mil triângulos por passada com os 30 na tela; a pior de 18 vistas tem 120 chamadas e ~194 mil triângulos. Avaliar a simulação: ~0,5 µs por quadro, sem alocar |
| `dpr` | adaptativo: começa no do aparelho (até o máximo do preset, 1–2); cai 0,25 por vez até 0,75 se o p95 do quadro passar de 22 ms e volta a subir com folga |

Números de tempo do `verify.mjs` vêm de renderização por software (swiftshader) e não valem como desempenho real;
chamadas e triângulos independem da GPU.

## 11. Painel administrativo (`apps/dash/src`)

Backoffice em `dash.vilanoeldobem.com.br` ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)); publicado em 2026-11-12.
React 19 + Vite, só arquivos estáticos; HTML plano e acessível, sem three.js, sem analytics e sem terceiros. Não
importa nada dos outros apps: o que divide com o jogo está em `packages/shared/src/accounts/`.

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Serviços | `lib/endpoints.ts`, `lib/services.ts`, `lib/api.ts`, `lib/ids.ts` | Host da API por modo de build (o único destino de `fetch`); cliente da API com `credentials: "include"`; aviso quando a sessão muda (`not_signed_in`, `admin_only`, `session_blocked`, `accounts_disabled`); só um id bem formado entra no caminho de uma requisição (o resto é recusado como `not_found`, sem requisição) |
| Sessão | `lib/session.ts`, `lib/login-token.ts`, `public/login-fragment.js`, `lib/return-to.ts` | Lê `/config`, consome o token `#login=` (tirado da barra de endereço antes de tudo; o resto do fragmento fica como estava) ou restaura a sessão por `/me`; com contas desligadas não chama rota de conta; decide a tela de cada sessão (`viewOf`); `trackSession` relê a sessão quando uma rota recusa (`admin_only`, `session_blocked`, `not_signed_in`) e, se a releitura devolve a mesma conta ainda no painel, mostra o estado "indisponível" em vez de reler de novo (só "Tentar de novo" repete); guarda por 20 minutos, no `localStorage` do navegador, o id da candidatura pedida por um link seguido sem sessão, para abrir essa candidatura depois da entrada |
| Navegação | `lib/router.ts` | Roteador de hash (`#/applications`, `#/applications/<id>`, `#/lots`, `#/audit`, `#/users`, `#/system`, `#/pending`); a barra depois de `#` é opcional: `#applications/<id>` é o link que o jogo monta ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)). Id malformado ou desconhecido → "Candidatura não encontrada." |
| Dados | `lib/hooks.ts`, `lib/format.ts`, `lib/review.ts`, `lib/files.ts`, `lib/moderation.ts` | Carregamento por tela, listas paginadas ("Carregar mais", releitura das páginas em tela), rótulos; envio da decisão, da retirada e da remoção de logo (recarregam a candidatura em `stale_revision`); download de documento (uma leitura auditada por clique); papéis e bloqueio: o que cada linha oferece, o texto de cada confirmação e o envio de cada ação |
| Aparência | `lib/theme.ts`, `styles.css` | Cores vindas de `PALETTE` (`packages/shared/src/game/world.ts`); um único CSS, sem estilo inline |
| Telas | `ui/SignIn.tsx`, `ui/Shell.tsx`, `ui/Applications.tsx`, `ui/Lots.tsx`, `ui/Audit.tsx`, `ui/Users.tsx`, `ui/System.tsx`, `ui/Pending.tsx` | Entrada; menu e sessão; análise de ONGs (movida do jogo), com a seção "Arquivos" ([IMPL-0017](../decisions/0017-ngo-files-r2.md)): logo em prévia, documentos só por download, e a ação "Retirar da Vila" de uma ONG publicada (IMPL-0020, PROPOSTA; só quando `/config` traz `withdrawal: true`), com o campo nomeado como mensagem para a organização; terrenos; auditoria; contas; estado do sistema; áreas pendentes. IMPL-0021: em "Usuários", papel com os rótulos compartilhados ("Padrão" / "Administrador"), "Tornar administrador" / "Tornar padrão", "Bloquear conta" (PROPOSTA; só com `/config` → `moderation.block: true`) e "Desbloquear" (sempre que a conta está bloqueada); no detalhe da candidatura, "Remover logo"; em "Sistema", as bandeiras `moderation.presence` e `moderation.block`. Toda ação tem um segundo passo (`Confirmation` em `ui/common.tsx`) que nomeia a conta ou a organização, diz a consequência e só libera o botão depois de marcada a frase de confirmação |
| Build | `security-headers.ts`, `vite.config.ts` | `_headers` por build (CSP com a API da build) |

Quem vê o quê:

| Situação | Tela |
|---|---|
| API sem resposta | "API indisponível" e "Tentar de novo" |
| Contas desligadas (`/config` → `accounts: false`) | Menu completo com o aviso "Contas desligadas": só dados públicos (`/lots`, `/health`, `/config`); as seções que precisam de sessão explicam por que estão vazias |
| Sem sessão | Só a tela "Entrar" (pede o link; não cria conta) |
| Sessão sem papel `admin` | Só "Apenas administradores" e o botão "Sair". Se a conta era administradora até a requisição anterior (rebaixada com o painel aberto), a tela diz que o papel foi retirado: a recusa `admin_only` faz o painel reler a sessão uma vez, sem laço |
| Conta bloqueada (`/me` → `blocked`; IMPL-0021, PROPOSTA) | Só "Conta bloqueada", a mensagem da administração como foi escrita e o botão "Sair", qualquer que seja o papel |
| Admin | Todas as seções |

A API impõe o papel em cada rota `/admin/*`; o que o painel esconde é conveniência, não proteção. As seções
"Pendentes" (Doações, Indicadores, Documentos e logos das ONGs — este último agora só com as decisões que faltam, PEN-019 e OQ-12) são avisos sem função.

Na seção "Usuários" ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)) continuam sem aparecer
e-mail e nome. Ninguém age sobre a própria linha ("Você não pode mudar o próprio papel."), a conta de um
administrador não é bloqueada ("Remova o papel de administrador antes…") e uma conta bloqueada só pode ser
desbloqueada. O texto do bloqueio é pedido como "Mensagem para a pessoa (ela vai ler)", com a regra compartilhada
(`cleanBlockMessage`, 10 a 1000 caracteres). Depois de uma ação a linha mostra o que a API respondeu e a lista é
relida; uma recusa mostra a frase da API (`last_admin`, `account_blocked`, `admin_account`, …). O bloqueio é
**PROPOSTA**: a seção traz um aviso de que a política de sanções é pergunta aberta (OQ-11) e de que hoje o bloqueio
não tem prazo, recurso nem aviso por e-mail.

## Limitações conhecidas

- Painel administrativo (`apps/dash`) publicado em 2026-11-12; com as contas desligadas mostra só dados públicos.
  Ele usa só o login próprio, sem Cloudflare Access na frente (OQ-10, respondida).
- Contas, XP no servidor e candidatura de ONG implementados, mas desligados em produção (`ACCOUNTS_ENABLED`) até a
  revisão LGPD / ECA Digital, a verificação do domínio no Resend e a chave `RESEND_API_KEY`.
- Envio de logo e documentos implementado, mas desligado em produção (`NGO_FILES_ENABLED`): falta criar o bucket,
  aplicar as migrations 0006/0007, definir a lista de documentos (PEN-019) e o prazo de retenção (OQ-12). PDF não é
  inspecionado.
- Retirada de ONG publicada implementada como PROPOSTA e desligada (`NGO_WITHDRAWAL_ENABLED`): sem restauração,
  sem aviso por e-mail, sem atualização de cenas abertas; o que ela significa para a conta e o CNPJ é pergunta
  aberta (OQ-14).
- Papéis geridos pelo painel e remoção de logo por administrador valem com as contas ligadas (IMPL-0021). Bloqueio
  de conta e remoção de visitante de uma sala são PROPOSTA e estão desligados (`ACCOUNT_BLOCK_ENABLED`,
  `PRESENCE_MODERATION_ENABLED`): o bloqueio é da conta, não da pessoa (excluir a conta libera o e-mail), não tem
  prazo, recurso nem aviso por e-mail (OQ-11); a remoção de sala não impede o visitante anônimo de voltar (recarregar
  a página reconecta na hora: a espera de 60 s é só do cliente aberto). As telas do jogo estão descritas na linha
  "Moderação" do [§2](#2-cliente-appsclientsrc); as do painel, no §11. No jogo, a galeria de fotos não é
  exibida aos visitantes: o administrador vê as fotos públicas só dentro do modo moderação, para poder removê-las.
- Nickname sem moderação; sem e-mail de aviso das decisões.
- Sem orçamento de desempenho formal para celulares de entrada (G12).
- Multiplayer só de presença (andar e ser visto): sem nomes, chat, interação entre avatares ou estado de jogo
  compartilhado (IMPL-0008).
- Separação em apps (IMPL-0009) implementada no código; o deploy dos novos Workers ainda depende de autorização.

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md) ·
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0015](../decisions/0015-dash-backoffice-app.md)
