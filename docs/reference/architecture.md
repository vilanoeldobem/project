# Arquitetura

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-09
> **Fonte de verdade:** `apps/web/`, `migrations/`

## 1. Visão geral

```
www.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem-site" (apps/site: Static Assets; raiz → 301 www)
app.vilanoeldobem.com.br ──▶ Worker "vilanoeldobem"
                      ├─ /api/*  → worker/api.ts ──▶ D1 "vilanoeldobem" (binding DB)
                      └─ resto   → Static Assets (dist/, SPA fallback, public/_headers)
```

Jogo e site são Workers separados ([IMPL-0005](../decisions/0005-public-site-and-domains.md)). No jogo, só `/api/*` executa código (`assets.run_worker_first`); páginas e arquivos estáticos são
servidos direto pela borda.

## 2. Cliente (`apps/web/src`)

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Lógica | `game/world.ts`, `game/progress.ts` | Layout do mundo, paleta, missões/XP (puro, testado) |
| Estado | `game/store.ts` | zustand: painel aberto, alvo próximo, posição, progresso, avisos |
| Ambiente | `environment/*` | Hora real de SP, relógio de rede, clima procedural, eventos, keyframes, presets ([environment.md](environment.md)) |
| Cena 3D | `scene/*` | react-three-fiber; `World` (canvas, presets), `Ground` (chão nevado + clique), `Props` (árvore, postes, terrenos, presentes), `Scenery` (pinheiros, montanhas, lago, bonecos de neve, trenó, cordões de luz), `Player` (movimento, câmera, vista do céu, proximidade) |
| Efeitos | `scene/environment/*` | Driver de uniforms, luz, céu, neve GPU, brilhos, fumaça, pegadas, bloom |
| Voxels | `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código; `InstancedMesh` por papel de material (sólido, lâmpadas, janelas, folhagem) |
| Interface | `ui/*` | HUD e painéis HTML acessíveis sobre o canvas |
| API | `lib/api.ts` | `fetch` com degradação silenciosa (retorna `null`) |

`World` é carregado sob demanda (`React.lazy`): a tela de entrada aparece antes do Three.js.

### 2.1 Loop por quadro (`Player`)

1. Direção = teclas pressionadas ou alvo de clique/toque.
2. Move a `9 u/s`, limita ao raio do mundo e fora da árvore (`clampToWorld`).
3. Coleta presentes a < 1,4 u (missão `explore-gifts`).
4. Define `nearby` (árvore ou terreno a < 4,5 u) → botão de ação.
5. Câmera segue com amortecimento; deslocamento `(0, 24, 21)`, multiplicado até 1,8× em telas retrato. Na vista
   "Olhar o céu", deslocamento `(0, 2.6, 10)` mirando para cima; andar encerra a vista.

## 3. Worker (`apps/web/worker`)

- `index.ts`: só o handler `fetch` (o runtime não aceita outros exports nomeados).
- `api.ts`: `handleApi` — ver [api.md](api.md). `/api/environment` é a autoridade da hora (sem estado; sem Durable
  Object, IMPL-0006). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo.

## 4. Configuração (`wrangler.jsonc`)

| Chave | Valor | Motivo |
|---|---|---|
| `account_id` | `9119b7496767fec497f6627c5ca56f32` | Conta do projeto |
| `assets.not_found_handling` | `single-page-application` | Rotas do cliente caem no `index.html` |
| `assets.run_worker_first` | `["/api/*"]` | Worker só para API |
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
| Draw calls estimadas | ~70 (floresta inteira em 3 InstancedMesh; neve em 1) |
| `dpr` | 1 até o máximo do preset (1–2) |

## Limitações conhecidas

- Sem autenticação nem rotas de escrita.
- Sem orçamento de desempenho formal para celulares de entrada (G12).

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md)
