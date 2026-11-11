# Arquitetura

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/client/`, `apps/api/`, `apps/server/`, `apps/site/`, `packages/shared/`, `migrations/`

## 1. Visão geral

Um Worker por app, cada um no seu subdomínio ([IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

```
www.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-site"   (apps/site: Static Assets; raiz → 301 www)
play.vilanoeldobem.com.br   ──▶ Worker "vilanoeldobem"        (apps/client: Static Assets, SPA, _headers por build)
app.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem"        → 301 play.vilanoeldobem.com.br
api.vilanoeldobem.com.br    ──▶ Worker "vilanoeldobem-api"    (apps/api) ──▶ D1 "vilanoeldobem" (binding DB)
server.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem-server" (apps/server)
                                 └─ /room?i=N (WebSocket) ──▶ Durable Object VillageRoom "plaza-0…7" (binding ROOMS)

navegador em play.*  ── fetch (CORS) ──▶ api.*      /health, /indicators, /lots, /environment
                     ── WebSocket    ──▶ server.*   /room?i=N
packages/shared (@vila/shared/…) ── importado por client, api e server (lógica pura, sem build)
```

O cliente fala direto com cada serviço; não há service binding entre Workers. Os hosts de cada build vêm de
`apps/client/src/lib/endpoints.ts` (produção → subdomínios; `vite` e `--mode workers` → Workers locais `:8787` e
`:8788`).

## 2. Cliente (`apps/client/src`)

Camadas marcadas com `shared/` ficam em `packages/shared/src/` e são usadas também pela API ou pelo servidor.

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Lógica | `shared/game/world.ts`, `shared/game/progress.ts` | Layout do mundo, obstáculos, superfícies, paleta, missões/XP (puro, testado) |
| Simulação | `shared/game/motion.ts`, `game/sim.ts` | Movimento do avatar em passo fixo de 60 Hz, colisão, passos (puro, testado); estado vivo mutável fora do zustand ([IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md)) |
| Eventos | `game/events.ts` | Barramento `step` / `gift` / `mission`: pegadas, partículas e som reagem à jogabilidade |
| Estado | `game/store.ts` | zustand: painel aberto, alvo próximo, destino do clique, progresso, avisos (nada por quadro) |
| Ambiente | `shared/environment/*`, `environment/runtime.ts`, `settings.ts`, `audio.ts`, `labels.ts` | Hora real de SP, relógio de rede, clima procedural, eventos, keyframes (puros, em `shared`); sincronização, presets, som e rótulos (navegador) ([environment.md](environment.md)) |
| Cena 3D | `scene/*` | react-three-fiber; `World` (canvas, presets), `Ground` (chão nevado + clique), `Props` (árvore, postes, terrenos, presentes), `Scenery` (pinheiros, montanhas, lago, bonecos de neve, trenó, cordões de luz), `Player` (movimento, câmera, vista do céu, proximidade) |
| Efeitos | `scene/environment/*` | Driver de uniforms, luz, céu, neve GPU, brilhos, fumaça, pegadas, bloom |
| Voxels | `scene/mesher.ts`, `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código → malha única por papel de material (sólido, lâmpadas, janelas, folhagem) sem faces escondidas, com oclusão de ambiente por vértice; cópias repetidas (`placements`) numa única chamada instanciada |
| Desempenho | `scene/RenderStats.tsx`, `scene/perf.ts` | Chamadas, triângulos, p50/p95 do quadro; resolução adaptativa |
| Interface | `ui/*` | HUD e painéis HTML acessíveis sobre o canvas |
| Serviços | `lib/endpoints.ts`, `lib/services.ts`, `lib/api.ts` | Hosts da API e do servidor por modo de build; `fetch` em `api.*` com degradação silenciosa (retorna `null`) |
| Rede | `shared/net/protocol.ts`, `net/multiplayer.ts`, `scene/RemotePlayers.tsx` | Presença em tempo real ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)) via `server.*`: pose própria a ≤ 10 Hz, outros visitantes por interpolação de snapshots (150 ms no passado), todos os avatares remotos em 6 chamadas de desenho |
| Worker | `worker/index.ts`, `worker/handle.ts` | Roda antes dos arquivos só para redirecionar `app.*` → `play.*` (301, mesmo caminho e query); o resto vai para os Static Assets |

`World` é carregado sob demanda (`React.lazy`): a tela de entrada aparece antes do Three.js.

### 2.1 Loop por quadro (`Player`)

1. Intenção = teclas pressionadas ou destino de clique/toque (painel aberto = parado).
2. Simulação em passos fixos de 1/60 s (`stepBody`): velocidade máxima `8,5 u/s` com aceleração e frenagem
   exponenciais, desaceleração ao chegar ao destino, colisão com círculos (`OBSTACLES` + chalés publicados)
   deslizando pelo obstáculo, limite do mundo e da árvore (`clampToWorld`). Destino bloqueado por 0,5 s é abandonado.
3. A cada `0,75 u` andados: evento `step` com a superfície (`surfaceAt`) → pegadas, neve levantada, som de passo.
4. Coleta presentes a < 1,4 u (missão `explore-gifts`; evento `gift`). Concluída a missão, os restantes somem.
5. Pose renderizada interpolada entre os dois últimos passos; pernas e braços seguem a distância andada.
6. Define `nearby` (árvore ou terreno a < 4,5 u) → botão de ação.
7. Câmera segue com amortecimento e leve antecipação na direção da velocidade; deslocamento `(0, 24, 21)`,
   multiplicado até 1,8× em telas retrato. Na vista "Olhar o céu", deslocamento `(0, 2.6, 10)` mirando para cima;
   andar encerra a vista.

## 3. API (`apps/api/src`)

- `index.ts`: só o handler `fetch` (o runtime não aceita outros exports nomeados).
- `api.ts`: `handleApi` — rotas `/health`, `/indicators`, `/lots`, `/environment` (ver [api.md](api.md)). CORS só
  para origens exatas de `ALLOWED_ORIGINS`. `/environment` é a autoridade da hora (sem estado; sem Durable Object,
  IMPL-0006). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo.
- `auth.ts`: contas opcionais (IMPL-0011), separando origem da API da origem de callback do jogo; CORS credenciado exato, cookies host-only e entrega de teste só em loopback.
- `progress.ts`: progresso privado por sessão, eventos idempotentes, importação limitada e controle de concorrência (IMPL-0012).
- Único app com acesso ao D1.

## 4. Servidor de tempo real (`apps/server/src`)

- `index.ts`: handler `fetch` e a classe `VillageRoom` (únicos exports aceitos pelo runtime).
- `handler.ts`: `/health` e `/room?i=N`; confere `Upgrade: websocket`, `Origin` (lista exata `ALLOWED_ORIGINS`,
  `originAllowed` em `env.ts`) e o
  número da sala antes de encaminhar ao Durable Object.
- `room.ts` (lógica pura, testada) e `room-do.ts` (Durable Object `VillageRoom`, API de hibernação de WebSocket):
  presença efêmera em memória, autoritativa para o que os outros veem (pose saneada, sem teletransporte, limite de
  mensagens), transmissão em lote a 10 Hz só enquanto há alguém; sala vazia hiberna. Nada é gravado no storage.

## 5. Código compartilhado (`packages/shared/src`)

Importado como `@vila/shared/<pasta>/<módulo>` (TypeScript direto, sem build). Sem DOM, three.js ou runtime da
Cloudflare.

| Pasta | Módulos | Usado por |
|---|---|---|
| `game/` | `world.ts`, `motion.ts`, `progress.ts` | client, server (limites do mundo e velocidade na sala) |
| `environment/` | `config.ts`, `time.ts`, `random.ts`, `weather.ts`, `events.ts`, `keyframes.ts`, `network-clock.ts`, `frame.ts` | client, api (`/environment`) |
| `net/` | `protocol.ts` | client, server |

## 6. Site (`apps/site`)

Site público estático ([IMPL-0005](../decisions/0005-public-site-and-domains.md)); links para o jogo apontam para
`play.vilanoeldobem.com.br`. Não importa nada dos outros apps.

## 7. Limites entre apps

- **Imports:** apps nunca importam uns dos outros. O que for usado por mais de um app vai para `packages/shared`, que
  é puro (sem DOM, three.js ou runtime da Cloudflare). Código de navegador fica em `apps/client`; código de Worker
  fica no app dono da rota.
- **Trocar um host** exige mudar três lugares juntos (senão o navegador bloqueia por CSP ou CORS, ou o servidor
  recusa o WebSocket com `403`):
  1. `apps/client/src/lib/endpoints.ts` (hosts usados pelo cliente e pelo `connect-src` da CSP);
  2. `ALLOWED_ORIGINS` em `apps/api/wrangler.jsonc` (origens que recebem CORS);
  3. `ALLOWED_ORIGINS` em `apps/server/wrangler.jsonc` (origens aceitas no WebSocket).

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
| api | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br,https://www.vilanoeldobem.com.br` | CORS por origem exata |
| server | `durable_objects` + `migrations` | binding `ROOMS` → `VillageRoom` (SQLite, tag `v1-village-room`) | Salas de presença (IMPL-0008) |
| server | `vars.ALLOWED_ORIGINS` | `https://play.vilanoeldobem.com.br` | WebSocket só do jogo |

## 9. Segurança

`_headers` do jogo, gerado a cada build por `apps/client/security-headers.ts` (via `vite.config.ts`): CSP
`default-src 'self'`, `connect-src` com exatamente a API e o servidor da build (fontes do Google e Cloudflare Web
Analytics liberados), `X-Frame-Options: DENY`, `Permissions-Policy` negando câmera, microfone, localização e
pagamento; `/assets/*` com cache imutável de 1 ano. O HTML faz `preconnect` para a API. A API manda CORS só para
origens exatas; o servidor recusa WebSocket de outra origem (`403`), o que bloqueia sequestro de WebSocket.

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

## Limitações conhecidas

- Contas implementadas para teste local; envio real e autenticação pública pendentes.
- Sem orçamento de desempenho formal para celulares de entrada (G12).
- Multiplayer só de presença (andar e ser visto): sem nomes, chat, interação entre avatares ou estado de jogo
  compartilhado (IMPL-0008).
- Separação em apps (IMPL-0009) implementada no código; o deploy dos novos Workers ainda depende de autorização.

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md) ·
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)

## Sincronização do progresso

`apps/client/src/game/account-progress.ts` mantém fila serial e cache por conta, gera a asserção X-Account-ID e
aplica respostas só à geração de conta que as pediu. `game/store.ts` preserva o visitante separadamente e restaura-o
no logout. `applyEvent` em shared continua sendo a única lógica de recompensa usada pela API e pelo cliente.
