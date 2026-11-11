# Publicar na Cloudflare

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v5 ·
> **Atualizado em:** 2026-11-11
> **Fonte de verdade:** `package.json` (scripts `deploy:*`), `apps/{client,api,server,site}/wrangler.jsonc`,
> `apps/*/package.json`

Produção ([IMPL-0005](../decisions/0005-public-site-and-domains.md),
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

| Host | Worker | App |
|---|---|---|
| https://play.vilanoeldobem.com.br | `vilanoeldobem` | `apps/client` (jogo, Static Assets) |
| https://app.vilanoeldobem.com.br | `vilanoeldobem` | 301 → `play` (mesmo caminho e query) |
| https://api.vilanoeldobem.com.br | `vilanoeldobem-api` | `apps/api` (API HTTP + D1) |
| https://server.vilanoeldobem.com.br | `vilanoeldobem-server` | `apps/server` (presença, Durable Object `VillageRoom`) |
| https://www.vilanoeldobem.com.br | `vilanoeldobem-site` | `apps/site` (site público) |
| https://vilanoeldobem.com.br | `vilanoeldobem-site` | 301 → `www` |

Os endereços `*.workers.dev` continuam ativos para diagnóstico.

Todos os Workers ficam na conta Cloudflare do projeto `9119b7496767fec497f6627c5ca56f32`
([IMPL-0003](../decisions/0003-cloudflare-workers-static-assets-d1.md)); só a API tem o binding do D1.
Deploy de produção e migrations remotas exigem autorização humana explícita (AGENTS.md).

## 1. Autenticar na conta do projeto

```bash
pnpm --filter @vila/api exec wrangler login     # usuário com acesso à conta 9119b749…
pnpm --filter @vila/api exec wrangler whoami    # a tabela de contas deve listar 9119b7496767fec497f6627c5ca56f32
```

Em CI use `CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts:Edit, D1:Edit) e
`CLOUDFLARE_ACCOUNT_ID=9119b7496767fec497f6627c5ca56f32`. `account_id` também está fixado em cada `wrangler.jsonc`.

## 2. Criar o D1 (uma vez)

```bash
cd apps/api
pnpm exec wrangler d1 create vilanoeldobem
```

Copie o `database_id` retornado para `d1_databases[0].database_id` em `apps/api/wrangler.jsonc` e faça commit.
Já feito em 2026-11-08: `vilanoeldobem` → `7c65d21d-0431-4ec5-bdd0-691dacb81f92`, localização `enam` (D1 não tem
região na América do Sul; `enam` é a mais próxima).

## 3. Aplicar migrations remotas

```bash
pnpm --filter @vila/api db:migrate:remote
```

Exige autorização humana explícita. Aplique **junto** com o deploy da API que usa o schema novo (na 0.4.0, a
migration `0004_accounts_ngo_applications.sql`; ver [§7](#7-contas-e-ongs-040)).

## 4. Publicar

Cada app tem seu script na raiz; cada um roda o build (typecheck + `wrangler deploy --dry-run` ou `vite build`) e
depois `wrangler deploy`:

```bash
pnpm deploy:api        # api.vilanoeldobem.com.br
pnpm deploy:server     # server.vilanoeldobem.com.br
pnpm deploy:client     # play.vilanoeldobem.com.br (+ redirecionamento de app.*)
pnpm deploy:site       # www.vilanoeldobem.com.br
sh scripts/smoke-api.sh                                   # padrão: api.*, server.* e play.* de produção
node apps/client/scripts/verify.mjs https://play.vilanoeldobem.com.br
```

### 4.1 Primeiro deploy da separação (IMPL-0009)

Mudança incompatível: a API perdeu o prefixo `/api`, então cliente e API vão juntos. Ordem obrigatória:

1. **API** (`pnpm deploy:api`): cria o Worker `vilanoeldobem-api` e o domínio `api.*`. Conferir
   `curl -s https://api.vilanoeldobem.com.br/health` → `"db":true`.
2. **Servidor** (`pnpm deploy:server`): cria o Worker `vilanoeldobem-server`, o domínio `server.*` e a classe de
   Durable Object `VillageRoom` pela migration `v1-village-room` (classe com SQLite, disponível no plano gratuito;
   nada é gravado nela). Conferir `curl -s https://server.vilanoeldobem.com.br/health` → `"rooms":true`.
3. **Cliente** (`pnpm deploy:client`): substitui o Worker `vilanoeldobem`, que passa a servir `play.*` e só
   redirecionar `app.*` (301).
4. **Site** (`pnpm deploy:site`): links passam a apontar para `play.*`.

Depois, rode o smoke e abra o jogo em dois aparelhos para conferir o chip "👥 2". Se `server.*/room` falhar, o
cliente segue em jogo solo (e quem desligar "Outros visitantes" no painel "Ambiente" nem conecta). Até esse deploy,
o smoke diário de produção falha (já aponta para os hosts novos).

### 4.2 Integração contínua (GitHub Actions)

- `ci.yml`: todo PR e todo push na `main` rodam `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test` e
  `pnpm build` (Node 24, pnpm do `packageManager`). O build de cada Worker inclui `wrangler deploy --dry-run`, então
  erro de empacotamento quebra no CI, não no deploy. Sem segredos e sem deploy.
- `smoke.yml`: roda `scripts/smoke-api.sh` contra produção (API, servidor e cliente) uma vez por dia (06:17 em São
  Paulo) e manualmente em **Actions → smoke → Run workflow** logo depois de cada deploy.
- O deploy continua manual (`pnpm deploy:*`), feito por quem tem acesso à conta Cloudflare.

## 5. Site público e domínios

```bash
pnpm deploy:site                     # build + wrangler deploy (www + raiz como Custom Domains)
node apps/site/scripts/verify.mjs https://www.vilanoeldobem.com.br
curl -sI https://vilanoeldobem.com.br | grep -i location   # → https://www.vilanoeldobem.com.br/
curl -sI https://app.vilanoeldobem.com.br | grep -i location   # → https://play.vilanoeldobem.com.br/
```

A zona `vilanoeldobem.com.br` está ativa na conta do projeto. Os hosts são **Workers Custom Domains** declarados em
`routes` de cada `wrangler.jsonc`; a Cloudflare cria DNS e certificado. Logo após o primeiro deploy, o host pode
responder 522 por alguns minutos até a borda propagar.

A zona injeta o **Cloudflare Web Analytics**; a CSP do jogo (gerada no build por `apps/client/security-headers.ts`) e
a do site (`apps/site/public/_headers`) liberam `static.cloudflareinsights.com` e `cloudflareinsights.com`. Os dois apps também carregam o **Google Tag
Manager** (`GTM-MQP2RVMB`, iniciado por `public/gtag-init.js`), e a CSP libera `*.googletagmanager.com`,
`*.google-analytics.com` e `*.analytics.google.com`; tags HTML personalizadas do GTM ficam bloqueadas (sem
`unsafe-inline`). O
`connect-src` do jogo lista exatamente `api.*` e `server.*` da build. Ao mudar a CSP, rode `verify.mjs` — erros de
CSP aparecem como erro de console. Trocar um host exige mudar três lugares
([architecture.md §7](../reference/architecture.md#7-limites-entre-apps)).

## 6. Reverter

Cada Worker reverte sozinho, a partir da pasta do app:

```bash
cd apps/<client|api|server|site>
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```

Reverter a API para antes da IMPL-0009 exige reverter o cliente junto (caminhos `/api/*` × sem prefixo).
Migrations não são revertidas automaticamente: corrija com uma nova migration. D1 Time Travel permite restaurar o
banco para um instante (`wrangler d1 time-travel restore vilanoeldobem --timestamp=…`, em `apps/api`).

> Atenção: use `pnpm deploy:<app>` na raiz ou `pnpm run deploy` dentro do app. `pnpm deploy` (sem `run`) é um
> comando nativo do pnpm e não publica nada.

## 7. Contas e ONGs (0.4.0)

Contas, link mágico, XP no servidor, candidatura e análise de ONGs
([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)) vão para produção **desligados**
(`ACCOUNTS_ENABLED = "false"` em `apps/api/wrangler.jsonc`). Com a bandeira desligada, `/config` responde
`{"accounts":false}`, toda rota de conta responde `404 accounts_disabled` e o jogo não mostra nada de conta.

### 7.1 Ordem do deploy da 0.4.0

1. **Migration remota 0004 + API, juntas** (ambas exigem autorização):

   ```bash
   pnpm --filter @vila/api db:migrate:remote     # aplica 0004_accounts_ngo_applications.sql
   pnpm deploy:api
   curl -s https://api.vilanoeldobem.com.br/health    # "db":true
   curl -s https://api.vilanoeldobem.com.br/config    # {"accounts":false}
   ```

   A 0004 só cria tabelas e acrescenta colunas em `ngos`: a API anterior continua funcionando com ela, então a
   migration pode ir um pouco antes do deploy, nunca depois.
2. **Cliente** (`pnpm deploy:client`): lê `/config` e esconde a interface de conta enquanto `accounts` for `false`.
3. Smoke e `verify.mjs` como em [§4](#4-publicar).

### 7.2 Cloudflare Email Service (OQ-08)

O link de acesso sai pelo Cloudflare Email Service (binding `send_email` `EMAIL`, remetente
`acesso@vilanoeldobem.com.br`, `MAIL_FROM`). Antes de ligar as contas, o domínio precisa estar cadastrado no
serviço. A documentação da comunidade cita:

```bash
cd apps/api
pnpm exec wrangler email sending enable vilanoeldobem.com.br
```

Confirmar no painel / documentação da Cloudflare (o comando e os registros DNS exigidos podem mudar). Criar ou
alterar recursos da Cloudflare exige autorização (AGENTS.md).

- O Email Service está em **beta**; enviar para qualquer destinatário pode exigir o plano Workers Paid — **verificar
  plano** antes de ligar.
- Sem o domínio cadastrado, o envio falha e a API responde `503 mail_unavailable` (falha fechada; o log traz só o
  código do erro, nunca endereço nem link).
- Conferir se `acesso@` deve receber respostas (senão, configurar o Email Routing ou deixar claro no texto).

### 7.3 Ligar as contas

Só depois de **(a)** a revisão LGPD / ECA Digital registrada pelo dono do produto e **(b)** o domínio cadastrado no
Email Service com um envio de teste recebido. Então, com autorização:

1. Mude `"ACCOUNTS_ENABLED": "true"` em `apps/api/wrangler.jsonc` (commit) e rode `pnpm deploy:api`.
2. Confira `curl -s https://api.vilanoeldobem.com.br/config` → `{"accounts":true}` e crie uma conta de teste em
   `play.*` (o link chega por e-mail; em produção a resposta nunca traz `devLink`).

Para desligar de novo, volte a bandeira para `"false"` e publique a API: os dados ficam no D1, a interface some.

### 7.4 Conceder o papel de administrador

Não há tela para isso (DEC-037). A pessoa cria a conta normalmente e confirma o link; depois, alguém com acesso à
conta Cloudflare roda, em `apps/api`:

```bash
pnpm exec wrangler d1 execute vilanoeldobem --remote --command "UPDATE users SET role='admin' WHERE nickname='...'"
```

É uma escrita remota no D1: **proibida para agentes sem autorização humana explícita** (AGENTS.md). O painel
"Análise de ONGs" aparece no painel da conta depois de recarregar o jogo. Para retirar, `role='player'`.

### 7.5 Reverter

- Reverter a API ou o cliente da 0.4.0 com `wrangler rollback` ([§6](#6-reverter)) é seguro: a versão anterior
  ignora as tabelas novas. Com a bandeira desligada, normalmente nem é preciso reverter: basta mantê-la em `"false"`.
- A migration 0004 não é revertida: as tabelas ficam (vazias, se as contas nunca foram ligadas). Se for preciso
  corrigir o schema, escreva uma nova migration.
- Se as contas já tiverem sido ligadas, desligar a bandeira esconde tudo sem apagar contas, candidaturas nem
  `audit_events`; terrenos reservados continuam reservados.

## Limitações conhecidas

- Homologação: só o banco D1 `vilanoeldobem-staging` (sem Worker publicado); veja [staging-database.md](staging-database.md).
- A `main` ainda não exige o check `ci` verde para aceitar merge (proteção de branch a configurar no GitHub).
- Deploy da separação (IMPL-0009) ainda pendente de autorização; até lá, produção roda o Worker único antigo.
- Contas (0.4.0) desligadas em produção até a revisão LGPD / ECA Digital e o cadastro do domínio no Email Service.

## Ver também

[reference/architecture.md](../reference/architecture.md) · [reference/storage.md](../reference/storage.md)
