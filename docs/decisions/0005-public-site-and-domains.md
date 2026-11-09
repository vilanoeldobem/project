# IMPL-0005: Site público em `apps/site` e domínios `www` / `app`

**Status:** Aceita (0.3.0, 2026-11-08)
**Data:** 2026-11-08
**Fontes:** pedido do responsável técnico (Augusto, 2026-11-08); DEC-021 (propósito e promessa), DEC-024 (logo em
teste), PEN-011 (domínio); Código: `apps/site/`, `apps/web/wrangler.jsonc`, `apps/site/wrangler.jsonc`

## Contexto

O jogo estava só em `*.workers.dev`. O domínio `vilanoeldobem.com.br` está registrado e ativo como zona na conta
Cloudflare do projeto. Faltava uma página pública que explique a Vila antes de entrar no jogo.

## Decisão

| Host | Worker | Conteúdo |
|---|---|---|
| `www.vilanoeldobem.com.br` | `vilanoeldobem-site` (`apps/site`) | Site público (canônico) |
| `vilanoeldobem.com.br` | `vilanoeldobem-site` | `301` → `www`, preservando caminho e query |
| `app.vilanoeldobem.com.br` | `vilanoeldobem` (`apps/web`) | Jogo 3D + API |

1. Site em React + Vite servido por Workers Static Assets; o Worker roda primeiro só para o redirecionamento da raiz
   (`worker/redirect.ts`, testado). Página 404 própria.
2. Todos os "Entrar na Vila" apontam para `https://app.vilanoeldobem.com.br` (`src/config.ts`); `verify.mjs` confere.
3. Textos só com formulações aprovadas (propósito e promessa DEC-021; regras de doação; critérios DEC-015; prazo
   DEC-043). Sem slogan (PEN-015). Logo: marcador temporário em texto, como no jogo (DEC-024).
4. Domínios como **Workers Custom Domains** (DNS e certificado gerenciados pela Cloudflare). `workers.dev` continua ativo.
5. CSP dos dois apps libera `static.cloudflareinsights.com` (script) e `cloudflareinsights.com` (conexão): a zona
   injeta o Cloudflare Web Analytics automaticamente, e a CSP anterior bloqueava o beacon (erro de console).

## Alternativas consideradas

- **Site e jogo no mesmo host** — rejeitada: o jogo carrega ~310 kB gzip de Three.js; o site precisa abrir rápido e
  ser indexável.
- **Desligar o Web Analytics na zona** — rejeitada por ora: é a única métrica de acesso sem cookies disponível;
  revisar na análise LGPD (ROADMAP, tarefas de base).

## Consequências

- Positivas: endereço oficial; site leve; jogo isolado em `app.`.
- Negativas: dois deploys (`pnpm run deploy` e `pnpm run deploy:site`).
- Verificação: `scripts/smoke-api.sh https://app.vilanoeldobem.com.br`;
  `node apps/site/scripts/verify.mjs https://www.vilanoeldobem.com.br`; `curl -sI https://vilanoeldobem.com.br` → 301.

## Relacionados

[IMPL-0003](0003-cloudflare-workers-static-assets-d1.md) · [guides/deploy.md](../guides/deploy.md)
