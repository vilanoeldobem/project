# apps/site — Vila Noel do Bem (site público)

Página institucional em `www.vilanoeldobem.com.br` (o domínio raiz redireciona para `www`). Os botões
"Entrar na Vila" levam ao jogo em `app.vilanoeldobem.com.br` (`apps/web`). Guia: [`docs/guides/deploy.md`](../../docs/guides/deploy.md).

```bash
pnpm --filter @vila/site dev          # http://localhost:5173
pnpm --filter @vila/site build
pnpm --filter @vila/site run deploy   # build + wrangler deploy (custom domains www + raiz)
```
