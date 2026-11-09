# Arquitetura

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
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
| Cena 3D | `scene/*` | react-three-fiber; `World` (luz, névoa, sombras), `Ground` (chão + clique), `Props` (árvore, postes, palmeiras, terrenos, presentes), `Player` (movimento, câmera, proximidade) |
| Voxels | `scene/Voxels.tsx`, `scene/models.ts` | Modelos gerados por código; `InstancedMesh` por modelo (sólido + emissivo) |
| Interface | `ui/*` | HUD e painéis HTML acessíveis sobre o canvas |
| API | `lib/api.ts` | `fetch` com degradação silenciosa (retorna `null`) |

`World` é carregado sob demanda (`React.lazy`): a tela de entrada aparece antes do Three.js.

### 2.1 Loop por quadro (`Player`)

1. Direção = teclas pressionadas ou alvo de clique/toque.
2. Move a `9 u/s`, limita ao raio do mundo e fora da árvore (`clampToWorld`).
3. Coleta presentes a < 1,4 u (missão `explore-gifts`).
4. Define `nearby` (árvore ou terreno a < 4,5 u) → botão de ação.
5. Câmera segue com amortecimento; deslocamento `(0, 24, 21)`, multiplicado até 1,8× em telas retrato.

## 3. Worker (`apps/web/worker`)

- `index.ts`: só o handler `fetch` (o runtime não aceita outros exports nomeados).
- `api.ts`: `handleApi` — ver [api.md](api.md). Erros viram `500 {"error":"internal"}` e o log só tem rota e tipo.

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

| Item | Valor (0.2.0) |
|---|---|
| Chunk `three` (three + r3f + drei) | ~1,1 MB / 313 kB gzip |
| App + CSS | ~27 kB / 10 kB gzip |
| Draw calls estimadas | ~40 (chão ≈ 4.400 voxels em 1 InstancedMesh) |
| `dpr` | 1–1,75 |

## Limitações conhecidas

- Sem autenticação nem rotas de escrita.
- Sem orçamento de desempenho formal para celulares de entrada (G12).

## Ver também

[api.md](api.md) · [storage.md](storage.md) · [IMPL-0001](../decisions/0001-stack-react-threejs-cloudflare.md)
