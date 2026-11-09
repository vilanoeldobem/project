# IMPL-0003: Um Worker com Static Assets + D1, monorepo pnpm

**Status:** Aceita (0.1.0, 2026-11-08)
**Data:** 2026-11-08
**Fontes:** [IMPL-0001](0001-stack-react-threejs-cloudflare.md); doc 06 (logs, backup); Código:
`apps/web/wrangler.jsonc`, `apps/web/worker/`, `migrations/`, `pnpm-workspace.yaml`

## Decisão

1. Um único Worker `vilanoeldobem` na conta `9119b7496767fec497f6627c5ca56f32` serve a SPA (Static Assets, fallback
   SPA) e a API (`run_worker_first: ["/api/*"]`).
2. D1 `vilanoeldobem` é o único armazenamento do servidor; migrations em `migrations/` na raiz.
3. Monorepo pnpm com `apps/*`; hoje só `apps/web`. Novos apps (ex.: painel admin) entram em `apps/`.
4. `worker/index.ts` exporta só o handler; a lógica fica em `worker/api.ts` para testes sem `workerd`.
5. `observability.enabled` para logs de erro.

## Alternativas consideradas

- **Cloudflare Pages + Functions** — rejeitada: Workers Static Assets é o caminho atual da Cloudflare, com um só
  arquivo de configuração.
- **Workers KV como banco** — rejeitada: dados relacionais (ONG ↔ terreno ↔ auditoria) pedem SQL.
- **Durable Objects agora** — adiada: úteis para chat/presença em tempo real (P05, P06), fora desta fatia.

## Consequências

- Positivas: um deploy; cache de borda para assets; D1 com Time Travel para restauração.
- Negativas: limites do D1 (tamanho/consultas) a monitorar; chat em tempo real exigirá Durable Objects.
- Verificação: `curl /api/health` → `"db": true`.

## Relacionados

[guides/deploy.md](../guides/deploy.md) · [reference/architecture.md](../reference/architecture.md)
