# Arquitetura

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/web/`, `migrations/`

## 1. Visão geral

```
www.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem-site" (apps/site: Static Assets; raiz → 301 www)
app.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem"
                      ├─ /api/*  → worker/api.ts ──▶ D1 "vilanoeldobem" (binding DB)
                      │    └─ /api/room (WebSocket) ──▶ Durable Object VillageRoom "plaza-0…7" (binding ROOMS)
                      └─ resto   → Static Assets (dist/, SPA fallback, public/_headers)
```

Jogo e site são Workers separados ([IMPL-0005](../decisions/0005-public-site-and-domains.md)). No jogo, só `/api/*` executa código (`assets.run_worker_first`); páginas e arquivos estáticos são
servidos direto pela borda.

## 2. Cliente (`apps/web/src`)

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Lógica | `game/world.ts`, `game/progress.ts` | Layout do mundo, obstáculos, superfícies, paleta, missões/XP (puro, testado) |
| Simulação | `game/motion.ts`, `game/sim.ts` | Movimento do avatar em passo fixo de 60 Hz, colisão, passos (puro, testado); estado vivo mutável fora do zustand ([IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md)) |
| Eventos | `game/events.ts` | Barramento `step` / `gift` / `mission`: pegadas, partículas e som reagem à jogabilidade |
| Estado | `game/store.ts` | zustand: painel aberto, alvo próximo, destino do clique, progresso, avisos (nada por quadro) |
| Ambiente | `environment/*` | Hora real de SP, relógio de rede, clima procedural, eventos, keyframes, presets ([environment.md](environment.md)) |
| Cena 3D | `scene/*` | react-three-fiber; `World` (canvas, presets), `Ground` (chão nevado + clique), `Props` (árvore, postes, terrenos, presentes), `Scenery` (pinheiros, montanhas, lago, bonecos de neve, trenó, cordões de luz), `Player` (movimento, câmera, vista do céu, proximidade) |
| Efeitos | `scene/environment/*` | Driver de uniforms, luz, céu, neve GPU, brilhos, fumaça, pegadas, bloom |
| Voxels | `scene/mesher.ts`, `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código → malha única por papel de material (sólido, lâmpadas, janelas, folhagem) sem faces escondidas, com oclusão de ambiente por vértice; cópias repetidas (`placements`) numa única chamada instanciada |
| Desempenho | `scene/RenderStats.tsx`, `scene/perf.ts` | Chamadas, triângulos, p50/p95 do quadro; resolução adaptativa |
| Interface | `ui/*` | HUD e painéis HTML acessíveis sobre o canvas |
| API | `lib/api.ts` | `fetch` com degradação silenciosa (retorna `null`) |
| Rede | `net/protocol.ts`, `net/multiplayer.ts`, `scene/RemotePlayers.tsx` | Presença em tempo real ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)): pose própria a ≤ 10 Hz, outros visitantes por interpolação de snapshots (150 ms no passado), todos os avatares remotos em 6 chamadas de desenho |

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

## 3. Worker (`apps/web/worker`)

- `index.ts`: só o handler `fetch` (o runtime não aceita outros exports nomeados).
- `room.ts` (lógica pura, testada) e `room-do.ts` (Durable Object `VillageRoom`, API de hibernação de WebSocket):
  presença efêmera em memória, autoritativa para o que os outros veem (pose saneada, sem teletransporte, limite de
  mensagens), transmissão em lote a 10 Hz só enquanto há alguém; sala vazia hiberna.
- `api.ts`: `handleApi` — ver [api.md](api.md). `/api/environment` é a autoridade da hora (sem estado; sem Durable
  Object, IMPL-0006). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo.

## 4. Configuração (`wrangler.jsonc`)

| Chave | Valor | Motivo |
|---|---|---|
| `account_id` | `9119b7496767fec497f6627c5ca56f32` | Conta do projeto |
| `assets.not_found_handling` | `single-page-application` | Rotas do cliente caem no `index.html` |
| `assets.run_worker_first` | `["/api/*"]` | Worker só para API |
| `durable_objects` + `migrations` | binding `ROOMS` → `VillageRoom` (SQLite, tag `v1-village-room`) | Salas de presença (IMPL-0008) |
| `d1_databases[0]` | binding `DB`, `migrations_dir: ../../migrations` | Migrations na raiz do repo |
| `observability.enabled` | `true` | Logs de erro (requisito do doc 06) |

## 5. Segurança

`public/_headers`: CSP `default-src 'self'` (fontes do Google e Cloudflare Web Analytics liberados), `X-Frame-Options: DENY`,
`Permissions-Policy` negando câmera, microfone, localização e pagamento; `/assets/*` com cache imutável de 1 ano.

## 6. Desempenho

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

- Sem autenticação nem rotas de escrita.
- Sem orçamento de desempenho formal para celulares de entrada (G12).
- Multiplayer só de presença (andar e ser visto): sem nomes, chat, interação entre avatares ou estado de jogo
  compartilhado (IMPL-0008).

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md)
