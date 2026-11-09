# Publicar na Cloudflare

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `apps/web/wrangler.jsonc`, `apps/web/package.json`

Produção ([IMPL-0005](../decisions/0005-public-site-and-domains.md)):

| Host | Worker | App |
|---|---|---|
| https://app.vilanoeldobem.com.br | `vilanoeldobem` | `apps/web` (jogo + API + D1) |
| https://www.vilanoeldobem.com.br | `vilanoeldobem-site` | `apps/site` (site público) |
| https://vilanoeldobem.com.br | `vilanoeldobem-site` | 301 → `www` |

Os endereços `*.workers.dev` continuam ativos para diagnóstico.

Publica o Worker `vilanoeldobem` (Static Assets + API) com D1 na conta Cloudflare do projeto
`9119b7496767fec497f6627c5ca56f32` ([IMPL-0003](../decisions/0003-cloudflare-workers-static-assets-d1.md)).
Deploy de produção e migrations remotas exigem autorização humana explícita (AGENTS.md).

## 1. Autenticar na conta do projeto

```bash
cd apps/web
pnpm exec wrangler login            # usuário com acesso à conta 9119b749…
pnpm exec wrangler whoami           # a tabela de contas deve listar 9119b7496767fec497f6627c5ca56f32
```

Em CI use `CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts:Edit, D1:Edit) e
`CLOUDFLARE_ACCOUNT_ID=9119b7496767fec497f6627c5ca56f32`. `account_id` também está fixado no `wrangler.jsonc`.

## 2. Criar o D1 (uma vez)

```bash
pnpm exec wrangler d1 create vilanoeldobem
```

Copie o `database_id` retornado para `d1_databases[0].database_id` em `wrangler.jsonc` e faça commit.
Já feito em 2026-11-08: `vilanoeldobem` → `7c65d21d-0431-4ec5-bdd0-691dacb81f92`, localização `enam` (D1 não tem
região na América do Sul; `enam` é a mais próxima).

## 3. Aplicar migrations remotas

```bash
pnpm db:migrate:remote
```

## 4. Publicar

```bash
pnpm run deploy                     # build (typecheck + vite) + wrangler deploy
../../scripts/smoke-api.sh https://app.vilanoeldobem.com.br
node scripts/verify.mjs https://app.vilanoeldobem.com.br
```

## 5. Site público e domínios

```bash
cd apps/site
pnpm run deploy                      # build + wrangler deploy (www + raiz como Custom Domains)
node scripts/verify.mjs https://www.vilanoeldobem.com.br
curl -sI https://vilanoeldobem.com.br | grep -i location   # → https://www.vilanoeldobem.com.br/
```

A zona `vilanoeldobem.com.br` está ativa na conta do projeto. Os hosts são **Workers Custom Domains** declarados em
`routes` de cada `wrangler.jsonc`; a Cloudflare cria DNS e certificado. Logo após o primeiro deploy, o host pode
responder 522 por alguns minutos até a borda propagar.

A zona injeta o **Cloudflare Web Analytics**; a CSP (`public/_headers`) libera `static.cloudflareinsights.com` e
`cloudflareinsights.com`. Ao mudar a CSP, rode `verify.mjs` — erros de CSP aparecem como erro de console.

## 6. Reverter

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```

Migrations não são revertidas automaticamente: corrija com uma nova migration. D1 Time Travel permite restaurar o
banco para um instante (`wrangler d1 time-travel restore vilanoeldobem --timestamp=…`).

> Atenção: use `pnpm run deploy`. `pnpm deploy` (sem `run`) é um comando nativo do pnpm e não publica nada.

## Limitações conhecidas

- Ainda não há ambiente de homologação separado (ROADMAP, tarefas de base).

## Ver também

[reference/architecture.md](../reference/architecture.md) · [reference/storage.md](../reference/storage.md)
