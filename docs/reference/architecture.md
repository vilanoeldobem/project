# Arquitetura

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v5 ·
> **Atualizado em:** 2026-11-11
> **Fonte de verdade:** `apps/client/`, `apps/api/`, `apps/server/`, `apps/site/`, `apps/dash/`, `packages/shared/`,
> `migrations/`

## 1. Visão geral

Um Worker por app, cada um no seu subdomínio ([IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

```
www.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-site"   (apps/site: Static Assets; raiz → 301 www)
play.vilanoeldobem.com.br   ──▶ Worker "vilanoeldobem"        (apps/client: Static Assets, SPA, _headers por build)
app.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem"        → 301 play.vilanoeldobem.com.br
api.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-api"    (apps/api) ──▶ D1 "vilanoeldobem" (binding DB)
server.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem-server" (apps/server)
                                 └─ /room?i=N (WebSocket) ──▶ Durable Object VillageRoom "plaza-0…7" (binding ROOMS)
dash.vilanoeldobem.com.br   ──▶ Worker "vilanoeldobem-dash"   (apps/dash: Static Assets, SPA, _headers por build)
                                 — NÃO PUBLICADO: painel administrativo, IMPL-0015

navegador em play.*  ── fetch (CORS) ──▶ api.*      /health, /config, /indicators, /lots, /environment
                     ── fetch (CORS + cookie __Host-vila_session) ──▶ api.*  /auth/*, /me, /progress*, /ngo/*, /admin/*
                                                              (só com ACCOUNTS_ENABLED, IMPL-0011)
                     ── WebSocket    ──▶ server.*   /room?i=N
navegador em dash.*  ── fetch (CORS + cookie __Host-vila_session) ──▶ api.*  /health, /config, /lots, /auth/link,
                                                              /auth/verify, /auth/logout, /me, /admin/*
packages/shared (@vila/shared/…) ── importado por client, dash, api e server (lógica pura, sem build)
```

O cliente fala direto com cada serviço; não há service binding entre Workers. Os hosts de cada build vêm de
`apps/client/src/lib/endpoints.ts` (produção → subdomínios; `vite` e `--mode workers` → Workers locais `:8787` e
`:8788`).

## 2. Cliente (`apps/client/src`)

Camadas marcadas com `shared/` ficam em `packages/shared/src/` e são usadas também pela API ou pelo servidor.

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Lógica | `shared/game/world.ts`, `shared/game/collision.ts`, `shared/game/progress.ts`, `shared/game/quests.ts` | Layout do mundo, colisores (um por peça sólida, medidos pelo desenho), superfícies, paleta, missões/XP e o catálogo/estado das quests (puro, testado) |
| Simulação | `shared/game/motion.ts`, `shared/game/navigation.ts`, `game/sim.ts` | Movimento do avatar em passo fixo de 60 Hz, colisão, passos; rota do clique em volta dos obstáculos, planejada uma vez por clique (puro, testado; [IMPL-0016](../decisions/0016-click-navigation-and-colliders.md)); estado vivo mutável fora do zustand: corpo, pose, campo de navegação e rota ([IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md)) |
| Eventos | `game/events.ts` | Barramento `step` / `gift` / `mission`: pegadas, partículas e som reagem à jogabilidade |
| Estado | `game/store.ts`, `game/questsFlag.ts` | zustand: painel aberto, alvo próximo, destino resolvido do clique, progresso, avisos (nada por quadro); bandeira de `quests-v1` (`VITE_QUESTS_V1_ENABLED` ou `?quests=1` local, **e** `quests` de `GET /config`) |
| Missões narrativas | `shared/game/quests.ts`, `scene/Props.tsx` (NPCs, itens, atril), `ui/NpcDialog.tsx`, `ui/Missions.tsx`, `ui/Donation.tsx`, `ui/Lot.tsx` | Quests `quests-v1` (PROPOSTA, DEC-039..042, PEN-025): uma missão ativa, diálogo, entrega, bolsa derivada e Caderno de cadeias ([quests.md](quests.md)) |
| Ambiente | `shared/environment/*`, `environment/runtime.ts`, `settings.ts`, `audio.ts`, `labels.ts` | Hora real de SP, relógio de rede, clima procedural, eventos, keyframes (puros, em `shared`); sincronização, presets, som e rótulos (navegador) ([environment.md](environment.md)) |
| Cena 3D | `scene/*` | react-three-fiber; `World` (canvas, presets), `Ground` (chão nevado + clique), `Props` (árvore, postes, terrenos, presentes), `Scenery` (pinheiros, montanhas, lago, bonecos de neve, trenó, cordões de luz), `Player` (movimento, câmera, vista do céu, proximidade) |
| Efeitos | `scene/environment/*` | Driver de uniforms, luz, céu, neve GPU, brilhos, fumaça, pegadas, bloom |
| Voxels | `scene/mesher.ts`, `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código → malha única por papel de material (sólido, lâmpadas, janelas, folhagem) sem faces escondidas, com oclusão de ambiente por vértice; cópias repetidas (`placements`) numa única chamada instanciada |
| Desempenho | `scene/RenderStats.tsx`, `scene/perf.ts` | Chamadas, triângulos, p50/p95 do quadro; resolução adaptativa |
| Interface | `ui/*` | HUD e painéis HTML acessíveis sobre o canvas |
| Serviços | `lib/endpoints.ts`, `lib/services.ts`, `lib/api.ts` | Hosts da API e do servidor por modo de build; `fetch` em `api.*` com degradação silenciosa (retorna `null`) |
| Conta | `lib/account.ts`, `ui/Account.tsx`, `ui/NgoApplication.tsx`, `shared/accounts/{validate,contract,errors}.ts` | Bandeira `/config`, link mágico, sessão (cookie `HttpOnly` que o cliente não lê), sincronização do progresso e candidatura de ONG em 4 etapas ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)); tudo some com a bandeira desligada. A análise administrativa saiu do jogo: admins veem só o link "Abrir painel administrativo" para `dash.*` ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)) |
| Rede | `shared/net/protocol.ts`, `net/multiplayer.ts`, `scene/RemotePlayers.tsx` | Presença em tempo real ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)) via `server.*`: pose própria a ≤ 10 Hz, outros visitantes por interpolação de snapshots (150 ms no passado), todos os avatares remotos em 6 chamadas de desenho. Reconexão por `planAfterClose` (puro, testado): sala cheia → próxima; queda → espera exponencial; fechamento por inatividade (`4002`, [IMPL-0014](../decisions/0014-realtime-idle-timeout.md)) ou aba oculta por 2 min → espera o próximo toque, clique ou tecla |
| Worker | `worker/index.ts`, `worker/handle.ts` | Roda antes dos arquivos só para redirecionar `app.*` → `play.*` (301, mesmo caminho e query); o resto vai para os Static Assets |

`World` é carregado sob demanda (`React.lazy`): a tela de entrada aparece antes do Three.js.

### 2.1 Loop por quadro (`Player`)

1. Intenção = a rota do último clique/toque (`sim.route`; painel aberto = parado, a rota fica guardada). A rota é
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
**PROPOSTA** (PEN-017/PEN-023); o que segue descreve só o que bloqueia o avatar.

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
| Presentes, itens de quest, lago, borda do mundo | nenhum | a borda é o limite `WORLD_RADIUS = 34` |

`apps/client/src/scene/colliders.test.ts` compara cada modelo desenhado com o seu colisor nos dois sentidos: nenhum
voxel sólido fica mais de 0,3 u fora de um colisor e nenhum contorno de colisor fica a mais de 0,35 u de um voxel.

**Navegação** (`shared/game/navigation.ts`):

- `createNavField(colisores)`: grade de 0,25 u sobre o disco do mundo; célula livre = avatar a pelo menos 0,25 u de
  todo colisor. Refeita só quando os colisores mudam (casa publicada, bandeira das quests): ≈ 3 ms.
- `planRoute`: resolve o destino (o clique, ou o ponto caminhável mais próximo, do lado de quem chega), vai em linha
  reta se ele está à vista, senão A* na grade e "puxar a corda" para sobrarem poucos trechos retos. Limite: as
  células caminháveis (≈ 44 000).
- `stepWalk`: segue a rota no passo fixo, sem alocar; replaneja se o avatar parar de progredir.
- O alvo guardado no estado (`target`) é o destino resolvido: o marcador e o brilho do clique aparecem onde o avatar
  vai parar.
- Alcance dos terrenos: `LOT_INTERACT_DISTANCE = 6` (a varanda do chalé termina a 4,5 u do centro); árvore, NPCs e
  atril usam `INTERACT_DISTANCE = 4,5`.

Verificação em navegador: `node apps/client/scripts/verify-collisions.mjs http://localhost:8799` (só local).

## 3. API (`apps/api/src`)

| Módulo | Responsabilidade |
|---|---|
| `index.ts` | Só o handler `fetch` (o runtime não aceita outros exports nomeados) |
| `api.ts` | `handleApi`: roteador, CORS com credenciais só para origens exatas de `ALLOWED_ORIGINS`, rotas públicas `/health`, `/config`, `/indicators`, `/lots`, `/environment` e a porta das rotas de conta (bandeira `ACCOUNTS_ENABLED`, `Origin` permitida, limite `AUTH_LIMITER` em `/auth/*`). `/environment` é a autoridade da hora (sem estado; IMPL-0006). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo |
| `http.ts` | Respostas JSON, `HttpError` (código estável + `fields` em pt-BR), leitura de corpo JSON (`415`/`413`/`400`), lista de origens |
| `crypto.ts` | UUID, token aleatório de 256 bits, SHA-256 |
| `auth.ts` | Cadastro (P13), link mágico (OQ-03), verificação, logout, `GET`/`DELETE /me`. O link abre o jogo, ou o painel quando o pedido vem exatamente de `DASH_ORIGIN` (IMPL-0015) |
| `session.ts` | Cookie `__Host-vila_session`, usuário atual, `requireUser` / `requireAdmin` |
| `mail.ts` | Mensagem do link (pt-BR, texto e HTML) e envio pela API do Resend (segredo `RESEND_API_KEY`, IMPL-0012); `devLink` só em desenvolvimento e teste |
| `progress.ts` | XP no servidor (P14, DEC-042): eventos idempotentes e repetição com `applyEvent` compartilhado; whitelist das quatro missões e das quests (`QUESTS_V1_ENABLED`); evento de quest gravado só quando é transição válida (IMPL-0013) |
| `ngo.ts` | Candidatura de ONG (P12, DEC-015): validação, reserva do terreno, reenvio |
| `admin.ts` | Análise administrativa (DEC-037): lista, detalhe com histórico, decisões auditadas |
| `backoffice.ts` | Listas só de leitura do painel administrativo (IMPL-0015): `GET /admin/audit` e `GET /admin/users` (sem e-mail e sem nome), paginadas |

Único app com acesso ao D1. Detalhes em [api.md](api.md).

**Fotos de ONGs (PROPOSTA, IMPL-0017):** a API passa a admitir o binding opcional `NGO_PHOTOS` para binários em
R2 privado; D1 conserva metadados, autoria e decisão editorial. `NGO_PHOTOS_ENABLED` fica desligada por padrão.
Nenhum domínio público de bucket é necessário: a API verifica a publicação da foto, da ONG e do terreno antes
de servir cada imagem. Prévias usam sessão e origem autorizadas. Configuração remota e ativação dependem de
[OQ-12](../decisions/open-questions.md); o contrato e as limitações de consistência estão em
[IMPL-0017](../decisions/0017-private-ngo-photos.md). O `VillageRoom` continua efêmero.

**Documentos de candidatura (PROPOSTA, IMPL-0019):** `NGO_DOCUMENTS` usa outro bucket privado, separado das fotos.
D1 autoriza toda leitura e registra a revisão da candidatura a cada upload ou retirada. Aprovar a ONG mantém
os documentos privados; downloads exigem sessão e são anexos, sem URL pública. `NGO_DOCUMENTS_ENABLED` permanece
desligada em produção e homologação. A API entrega o contrato para futura integração no painel; ativação depende
de [OQ-13](../decisions/open-questions.md). Estados editáveis, concorrência e limites em
[IMPL-0019](../decisions/0019-private-ngo-documents.md).

**Retirada de publicação (PROPOSTA, IMPL-0020):** a tabela aditiva `ngo_withdrawals` preserva a aprovação e o
histórico, mas projeta a situação privada como `withdrawn`. No mesmo batch, a retirada incrementa a revisão,
libera os terrenos efetivamente associados e registra auditoria. A liberação para outra ONG foi confirmada por
Nicolas em 2026-11-12; reentrada e demais regras operacionais seguem [OQ-14](../decisions/open-questions.md).
Perfil, fotos, terrenos e indicadores públicos sempre excluem retiradas, inclusive com `NGO_WITHDRAWAL_ENABLED`
desligada: essa bandeira controla somente novas mutações. Leitura privada autorizada preserva fotos/documentos;
o motivo não entra em respostas públicas ou no texto livre da auditoria. O jogo atual precisa recarregar sua
consulta para atualizar uma cena aberta; não há broadcast de retirada nem alteração de XP/missões neste fluxo.
Contrato e limites em [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md).

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

## 5. Código compartilhado (`packages/shared/src`)

Importado como `@vila/shared/<pasta>/<módulo>` (TypeScript direto, sem build). Sem DOM, three.js ou runtime da
Cloudflare.

| Pasta | Módulos | Usado por |
|---|---|---|
| `game/` | `world.ts`, `collision.ts`, `motion.ts`, `navigation.ts`, `progress.ts`, `quests.ts` | client, server (limites do mundo e velocidade na sala), api (`progress.ts`: XP no servidor e eventos de quest) |
| `accounts/` | `validate.ts` | client (formulários), api (mesmas regras e mensagens pt-BR do cadastro e da candidatura), dash (rótulos das áreas) |
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
     painel, usada só no link "Abrir painel administrativo");
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
| client | `assets.run_worker_first` | `true` | Worker só redireciona `app.*`; o resto vai para `ASSETS` |
| api | `d1_databases[0]` | binding `DB`, `migrations_dir: ../../migrations` | Migrations na raiz do repo |
| api | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br,https://www.vilanoeldobem.com.br,https://dash.vilanoeldobem.com.br` | CORS por origem exata |
| api | `vars.ACCOUNT_ORIGINS` | `https://play.vilanoeldobem.com.br,https://dash.vilanoeldobem.com.br` | Só o jogo e o painel usam rotas de conta e recebem CORS com credenciais |
| api | `vars.GAME_ORIGIN` | `https://play.vilanoeldobem.com.br` | Base dos links de acesso |
| api | `vars.DASH_ORIGIN` | `https://dash.vilanoeldobem.com.br` | Base do link quando o pedido vem exatamente desta origem (IMPL-0015) |
| api | `vars.ACCOUNTS_ENABLED` | `"false"` | Contas desligadas até a revisão LGPD / ECA Digital (IMPL-0011) |
| api | `vars.MAIL_FROM` | `acesso@vilanoeldobem.com.br` | Remetente do link de acesso |
| api | segredo `RESEND_API_KEY` | fora do `wrangler.jsonc` (`wrangler secret put`) | Chave do Resend (só o link de acesso, IMPL-0012) |
| api | `ratelimits` | `AUTH_LIMITER`, 10 requisições / 60 s | Limite por IP em `/auth/*` (IP não gravado) |
| server | `durable_objects` + `migrations` | binding `ROOMS` → `VillageRoom` (SQLite, tag `v1-village-room`) | Salas de presença (IMPL-0008) |
| server | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br` | WebSocket só do jogo |
| server | `vars.IDLE_TIMEOUT_SECONDS` | `"300"` | Segundos sem atividade até a sala fechar a conexão (IMPL-0014); inteiro de 60 a 86400, senão vale 300 |
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

`_headers` do painel, gerado a cada build por `apps/dash/security-headers.ts`: CSP mais estrita que a do jogo
(`default-src 'self'`, sem script ou estilo inline, nenhum terceiro, `connect-src 'self'` + exatamente a API da
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
| `dpr` | adaptativo: começa no do aparelho (até o máximo do preset, 1–2); cai 0,25 por vez até 0,75 se o p95 do quadro passar de 22 ms e volta a subir com folga |

Números de tempo do `verify.mjs` vêm de renderização por software (swiftshader) e não valem como desempenho real;
chamadas e triângulos independem da GPU.

## 11. Painel administrativo (`apps/dash/src`)

Backoffice em `dash.vilanoeldobem.com.br` ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)); **não publicado**.
React 19 + Vite, só arquivos estáticos; HTML plano e acessível, sem three.js, sem analytics e sem terceiros. Não
importa nada dos outros apps: o que divide com o jogo está em `packages/shared/src/accounts/`.

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Serviços | `lib/endpoints.ts`, `lib/services.ts`, `lib/api.ts` | Host da API por modo de build (o único destino de `fetch`); cliente da API com `credentials: "include"`; aviso quando a sessão muda (`not_signed_in`, `admin_only`, `accounts_disabled`) |
| Sessão | `lib/session.ts`, `lib/login-token.ts`, `public/login-fragment.js` | Lê `/config`, consome o token `#login=` (tirado da barra de endereço antes de tudo) ou restaura a sessão por `/me`; com contas desligadas não chama rota de conta |
| Navegação | `lib/router.ts` | Roteador de hash (`#/applications`, `#/applications/<id>`, `#/lots`, `#/audit`, `#/users`, `#/system`, `#/pending`) |
| Dados | `lib/hooks.ts`, `lib/format.ts` | Carregamento por tela, listas paginadas ("Carregar mais"), rótulos |
| Aparência | `lib/theme.ts`, `styles.css` | Cores vindas de `PALETTE` (`packages/shared/src/game/world.ts`); um único CSS, sem estilo inline |
| Telas | `ui/SignIn.tsx`, `ui/Shell.tsx`, `ui/Applications.tsx`, `ui/Lots.tsx`, `ui/Audit.tsx`, `ui/Users.tsx`, `ui/System.tsx`, `ui/Pending.tsx` | Entrada; menu e sessão; análise de ONGs (movida do jogo); terrenos; auditoria; contas; estado do sistema; áreas pendentes |
| Build | `security-headers.ts`, `vite.config.ts` | `_headers` por build (CSP com a API da build) |

Quem vê o quê:

| Situação | Tela |
|---|---|
| API sem resposta | "API indisponível" e "Tentar de novo" |
| Contas desligadas (`/config` → `accounts: false`) | Menu completo com o aviso "Contas desligadas": só dados públicos (`/lots`, `/health`, `/config`); as seções que precisam de sessão explicam por que estão vazias |
| Sem sessão | Só a tela "Entrar" (pede o link; não cria conta) |
| Sessão sem papel `admin` | Só "Apenas administradores" e o botão "Sair" |
| Admin | Todas as seções |

A API impõe o papel em cada rota `/admin/*`; o que o painel esconde é conveniência, não proteção. As seções
"Pendentes" (Doações, Indicadores, Documentos e logos das ONGs) são avisos sem função, e a de contas não tem ação
de sanção (regras não definidas, DEC-037).

## Limitações conhecidas

- Painel administrativo (`apps/dash`) implementado, **não publicado**: criar o Worker e o domínio `dash.*` exige
  autorização. Ele usa só o login próprio, sem Cloudflare Access na frente (OQ-10, respondida).
- Contas, XP no servidor e candidatura de ONG implementados, mas desligados em produção (`ACCOUNTS_ENABLED`) até a
  revisão LGPD / ECA Digital, a verificação do domínio no Resend e a chave `RESEND_API_KEY`.
- Candidatura sem upload de documentos; nickname sem moderação; sem e-mail de aviso das decisões.
- Sem orçamento de desempenho formal para celulares de entrada (G12).
- Multiplayer só de presença (andar e ser visto): sem nomes, chat, interação entre avatares ou estado de jogo
  compartilhado (IMPL-0008).
- Separação em apps (IMPL-0009) implementada no código; o deploy dos novos Workers ainda depende de autorização.

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md) ·
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0015](../decisions/0015-dash-backoffice-app.md)
