# Publicar na Cloudflare

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v7 ·
> **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `package.json` (scripts `deploy:*`), `apps/{client,api,server,site,dash}/wrangler.jsonc`,
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
| https://dash.vilanoeldobem.com.br | `vilanoeldobem-dash` | `apps/dash` (painel administrativo), ver [§8](#8-painel-administrativo-appsdash) |

Os endereços `*.workers.dev` continuam ativos para diagnóstico (o painel administrativo não tem um:
`workers_dev: false`).

**Último deploy: 2026-11-12**, os cinco Workers a partir da `main` (`e2fa200`), na ordem API → servidor → painel →
jogo → site. Nenhuma migration remota foi aplicada (o D1 de produção está na v3) e as contas seguem desligadas.

Todos os Workers ficam na conta Cloudflare do projeto `9119b7496767fec497f6627c5ca56f32`
([IMPL-0003](../decisions/0003-cloudflare-workers-static-assets-d1.md)); só a API tem o binding do D1 e o do bucket
R2 dos arquivos de ONG ([§9](#9-arquivos-das-ongs-no-r2-impl-0017)).
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

Exige autorização humana explícita. Confira o histórico remoto e aplique a sequência efetiva antes de
disponibilizar as operações que dependem dela. O código de contas/arquivos desta versão requer até 0007;
operações que encontrem colunas novas ausentes retornam `503 schema_outdated`. As rotas públicas continuam
tolerantes à v3, inclusive `/ngos/:id`; isso não dispensa o upgrade antes de ativar as contas. O último estado
registrado de produção permanece v3, sem aplicação remota destas migrations nesta entrega.

## 4. Publicar

Cada app tem seu script na raiz; cada um roda o build (typecheck + `wrangler deploy --dry-run` ou `vite build`) e
depois `wrangler deploy`:

```bash
pnpm deploy:api        # api.vilanoeldobem.com.br
pnpm deploy:server     # server.vilanoeldobem.com.br
pnpm deploy:client     # play.vilanoeldobem.com.br (+ redirecionamento de app.*)
pnpm deploy:site       # www.vilanoeldobem.com.br
pnpm deploy:dash       # dash.vilanoeldobem.com.br
sh scripts/smoke-api.sh                                   # padrão: api.*, server.* e play.* de produção
node apps/client/scripts/verify-live.mjs                  # padrão: https://play.vilanoeldobem.com.br
```

`apps/client/scripts/verify.mjs` é **só local**: ele usa o painel de depuração do ambiente (`?envDebug=1`), que só
existe em `localhost`, e contra produção para com tempo esgotado em `.env-debug`. Em produção use o
`verify-live.mjs`: abre o jogo num Chrome real, entra na Vila e falha se houver erro de console (inclusive de CSP),
requisição que falhou, presença sem conectar ou interface de conta visível com as contas desligadas. Não cria
conta nem grava nada.

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

### 4.3 Limite de inatividade da presença (IMPL-0014)

`IDLE_TIMEOUT_SECONDS` em `vars` de `apps/server/wrangler.jsonc` (padrão `"300"`): segundos sem atividade real até a
sala fechar a conexão com o código `4002` ([IMPL-0014](../decisions/0014-realtime-idle-timeout.md)). Aceita inteiro
de `60` a `86400`; qualquer outro valor vale `300`. É variável de texto, não segredo; mudar o valor exige novo
`pnpm deploy:server`.

Ordem do deploy que introduz o limite: **servidor antes do cliente**.

- Servidor novo com cliente antigo: funciona, mas o cliente antigo trata o `4002` como queda e reconecta sozinho
  depois de 1 s. Abas antigas esquecidas abertas continuam ocupando a sala, em janelas de 5 minutos, até serem
  recarregadas ou fechadas; a economia só fica completa quando essas abas somem.
- Cliente novo com servidor antigo: o `["a"]` é descartado como mensagem inválida e conta para o limite de abuso
  (`1008` depois de 200 descartes, mais de uma hora de uso sem andar). Por isso o servidor vai primeiro.

Conferência depois do deploy: abrir o jogo, não tocar em nada por pouco mais de 5 minutos e ver o chip "👥 N" virar
"👥 em pausa"; um clique no chão deve trazer "👥 N" de volta. No painel da Cloudflare, a duração (GB-s) do Durable
Object `VillageRoom` deve parar de crescer nos períodos sem ninguém ativo.

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
Manager** (`GTM-MQP2RVMB`, iniciado por `public/gtag-init.js`). A CSP libera `https://www.googletagmanager.com` como script e
`*.googletagmanager.com`, `*.google-analytics.com` e `*.analytics.google.com` como imagem e conexão. No jogo,
`public/login-fragment.js` roda antes do GTM e tira o token `#login=` da URL. Tags HTML personalizadas do GTM ficam bloqueadas (sem
`unsafe-inline`). O
`connect-src` do jogo lista exatamente `api.*` e `server.*` da build. Ao mudar a CSP, rode `verify.mjs` — erros de
CSP aparecem como erro de console. Trocar um host exige mudar todos os lugares que o citam
([architecture.md §7](../reference/architecture.md#7-limites-entre-apps)).

## 6. Reverter

Cada Worker reverte sozinho, a partir da pasta do app:

```bash
cd apps/<client|api|server|site|dash>
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

1. **Migrations sequenciais até 0007 + API** (ambas exigem autorização):

   ```bash
   pnpm --filter @vila/api db:migrate:remote     # aplica somente as migrations pendentes da sequência revisada
   pnpm deploy:api
   curl -s https://api.vilanoeldobem.com.br/health    # "db":true
   curl -s https://api.vilanoeldobem.com.br/config    # {"accounts":false}
   ```

   Aplique a sequência revisada antes de ativar o fluxo de contas. 0006 contém os arquivos canônicos e 0007
   contém a galeria e guardas. O perfil público funciona na v3 com campos opcionais ausentes tratados como
   vazios; teste uma ONG inexistente em `GET /ngos/00000000-0000-4000-8000-000000000000` → 404. Isso não afirma
   que o banco remoto já recebeu as migrations.
2. **Cliente** (`pnpm deploy:client`): lê `/config` e esconde a interface de conta enquanto `accounts` for `false`.
3. Smoke e `verify.mjs` como em [§4](#4-publicar).

### 7.2 E-mail pelo Resend (IMPL-0012)

O link de acesso sai pela API HTTPS do [Resend](https://resend.com) (`apps/api/src/mail.ts`), com remetente
`MAIL_FROM` (`acesso@vilanoeldobem.com.br`). A chave fica no segredo `RESEND_API_KEY` do Worker `vilanoeldobem-api`
— nunca em `vars`, no repositório ou em log. Criar ou alterar segredos e recursos exige autorização (AGENTS.md).

1. **Domínio no Resend.** Em *Domains*, adicionar o domínio do remetente e criar no DNS os registros SPF e DKIM
   exatamente como o painel mostra (`TXT` e `MX` ou `CNAME`). A verificação costuma sair em minutos e pode levar até
   72 h. Sem domínio verificado, o Resend recusa o envio (`403 validation_error`). O Resend recomenda um
   subdomínio no lugar do domínio raiz; se o remetente mudar, ajustar `MAIL_FROM` em `apps/api/wrangler.jsonc`.
2. **Chave.** Em *API Keys*, criar uma chave com permissão só de envio (*Sending access*).
3. **Segredo no Worker**, por um dos caminhos:
   - **GitHub:** gravar a chave em `RESEND_API_KEY` e um token da Cloudflare com permissão de editar Workers em
     `CLOUDFLARE_API_TOKEN` (*Settings → Secrets and variables → Actions*), depois rodar à mão o workflow
     **api-secrets** (*Actions → api-secrets → Run workflow*). Ele só roda quando alguém dispara e não imprime a chave.
   - **Local:** `cd apps/api && pnpm exec wrangler secret put RESEND_API_KEY --env=""`.

   Gravar um segredo publica na hora uma nova versão do Worker com o mesmo código.
4. **Conferir:** `curl -s https://api.vilanoeldobem.com.br/health` → `"mail": true` (diz só se a chave existe, nunca
   o valor).

- Sem a chave, ou se o Resend recusar o envio, a API responde `503 mail_unavailable` (falha fechada). O log traz só
  `mail_error`, o status HTTP e o nome do erro do Resend: nunca endereço, link ou chave.
- Homologação (`env.staging`) não recebe a chave: lá o envio sempre falha fechado.
- O Resend passa a tratar o e-mail e o nickname de quem pede o link (operador fora do Brasil): isso entra na
  revisão LGPD / ECA Digital antes de ligar as contas.
- Conferir se `acesso@` deve receber respostas (senão, deixar claro no texto do e-mail).

### 7.3 Ligar as contas

Só depois de **(a)** a revisão LGPD / ECA Digital registrada pelo dono do produto e **(b)** o domínio verificado no
Resend, `"mail": true` em `/health` e um envio de teste recebido. Então, com autorização:

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

É uma escrita remota no D1: **proibida para agentes sem autorização humana explícita** (AGENTS.md). Com o papel, a
pessoa entra no painel administrativo (`dash.*`, [§8](#8-painel-administrativo-appsdash)); no jogo, o painel da conta
ganha o link "Abrir painel administrativo" depois de recarregar. Para retirar, `role='player'`. Nenhuma rota da API
concede ou retira papel.

### 7.5 Reverter

- Reverter a API ou o cliente da 0.4.0 com `wrangler rollback` ([§6](#6-reverter)) é seguro: a versão anterior
  ignora as tabelas novas. Com a bandeira desligada, normalmente nem é preciso reverter: basta mantê-la em `"false"`.
- A migration 0004 não é revertida: as tabelas ficam (vazias, se as contas nunca foram ligadas). Se for preciso
  corrigir o schema, escreva uma nova migration.
- Se as contas já tiverem sido ligadas, desligar a bandeira esconde tudo sem apagar contas, candidaturas nem
  `audit_events`; terrenos reservados continuam reservados.

## 8. Painel administrativo (`apps/dash`)

Backoffice em `dash.vilanoeldobem.com.br` ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)): app estático
(Static Assets, sem script de Worker, sem bindings e sem segredos) que fala só com a API. **Publicado em
2026-11-12** (Worker `vilanoeldobem-dash` e Custom Domain criados nesse deploy). Com as contas desligadas ele mostra
"Contas desligadas" e só dados públicos. Os passos abaixo ficam como registro e valem para um novo ambiente.

### 8.1 Antes de publicar

1. **Acesso.** O painel fica aberto na internet como qualquer site estático e não usa Cloudflare Access (OQ-10):
   quem protege os dados é a API, que exige sessão e papel `admin` em cada rota. O HTML e o JavaScript não contêm
   dado nenhum.
2. **Excluir `dash.*` do Cloudflare Web Analytics** (injeção automática da zona). A CSP do painel bloqueia o script
   de medição; se ele for injetado, aparece erro de CSP no console e o `verify.mjs` do painel falha. Conferido em
   2026-11-12: o HTML de `dash.*` saiu sem o script e o `verify.mjs` daquela versão passou em produção; se o Web
   Analytics da zona mudar, confira de novo. O `verify.mjs` atual exige `img-src 'self' blob:` (IMPL-0017): contra
   produção ele só volta a passar depois de o painel ser publicado de novo.
3. **Contas.** O painel só tem utilidade com `ACCOUNTS_ENABLED = "true"` ([§7.3](#73-ligar-as-contas)). Com a
   bandeira desligada ele abre, mostra "Contas desligadas" e só dados públicos.

### 8.2 Ordem

1. **API primeiro** (`pnpm deploy:api`): ela precisa conhecer a origem do painel (`ALLOWED_ORIGINS`,
   `ACCOUNT_ORIGINS` e `DASH_ORIGIN` em `apps/api/wrangler.jsonc`, já no repositório). Sem isso o navegador bloqueia
   as chamadas do painel por CORS. Publicar a API com essas variáveis antes de o painel existir é seguro: são só
   textos de configuração.
2. **Painel** (`pnpm deploy:dash`): cria o Worker `vilanoeldobem-dash` e o Custom Domain `dash.*` (a Cloudflare
   cria o registro DNS e o certificado; o host pode responder 522 por alguns minutos).
3. **Jogo** (`pnpm deploy:client`): a versão nova troca o painel "Análise de ONGs" pelo link "Abrir painel
   administrativo". Publicar o jogo **antes** do painel deixa os admins sem tela de análise: publique na ordem.
4. Conferir:

   ```bash
   curl -sI https://dash.vilanoeldobem.com.br | grep -iE "content-security-policy|x-robots-tag|cache-control|referrer-policy"
   node apps/dash/scripts/verify.mjs https://dash.vilanoeldobem.com.br https://api.vilanoeldobem.com.br
   ```

   O `verify.mjs` confere os cabeçalhos, a tela de entrada (se as contas estiverem ligadas) e o estado de cada seção
   com as contas desligadas; não entra em conta nenhuma.

### 8.3 Reverter

`wrangler rollback` em `apps/dash` ([§6](#6-reverter)). O painel não tem dados nem migrations. Para tirá-lo do ar
sem apagar o Worker, remova a rota (ou bloqueie no Access); apagar o Worker ou o domínio é mudança de recurso e
exige autorização. Se o jogo novo já estiver publicado, reverter o painel deixa os admins sem tela de análise:
reverta o jogo junto ou mantenha o painel.

## 9. Arquivos das ONGs no R2 (IMPL-0017)

Logo e documentos das candidaturas ficam num bucket R2 privado, lido só pela API
([IMPL-0017](../decisions/0017-ngo-files-r2.md)). **PROPOSTA, desligado em produção**
(`NGO_FILES_ENABLED = "false"` em `apps/api/wrangler.jsonc`). O R2 já está habilitado na conta (2026-11-12); **o
bucket ainda não existe**.

### 9.1 Ordem

Cada passo abaixo exige autorização humana explícita (AGENTS.md): cria recurso, aplica migration remota ou publica.

1. **Criar o bucket** (uma vez), em `apps/api`:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=9119b7496767fec497f6627c5ca56f32 pnpm exec wrangler r2 bucket create vilanoeldobem-files --location enam
   ```

   `enam` é a mesma localização do D1 (o R2 não tem região na América do Sul; a dica é "melhor esforço"). Não ligue
   o endereço público `r2.dev` nem um domínio próprio: o bucket é privado e assim deve ficar.
   **Sempre publique a API com `pnpm deploy:api`, nunca com `wrangler deploy` puro.** O wrangler fixado (4.158.0)
   vem com o provisionamento automático ligado: ao ver no `wrangler.jsonc` um bucket que não existe, um
   `wrangler deploy` puro **cria o bucket sozinho**, sem perguntar e sem a localização `enam`. O script
   `pnpm deploy:api` passa `--x-provision=false`; com ele, sem o bucket, o esperado é o deploy falhar e a versão que
   já está no ar continuar valendo (lido no código do wrangler; não testado com um deploy real).
2. **Migration 0006 + API**, como no [§7.1](#71-ordem-do-deploy-da-040): `pnpm --filter @vila/api db:migrate:remote`
   (aplica também a 0004 e a 0005, se ainda faltarem) e `pnpm deploy:api`. A 0006 só cria a tabela `ngo_files`: a
   API anterior continua funcionando com ela. Com as contas desligadas a API nova não lê essa tabela, mas ela tem
   de existir **antes** de ligar as contas (`DELETE /me` a consulta sempre que o bucket está ligado).
3. **Conferir:**

   ```bash
   curl -s https://api.vilanoeldobem.com.br/health    # "files": true  (bucket ligado ao Worker)
   curl -s https://api.vilanoeldobem.com.br/config    # "files": false (envio desligado)
   ```

4. **Painel e jogo** (`pnpm deploy:dash`, `pnpm deploy:client`): com `files: false` as telas não mostram nada de
   arquivo; publicar antes ou depois da API não quebra nada.

### 9.2 Ligar o envio

Só depois de **(a)** as contas ligadas ([§7.3](#73-ligar-as-contas)), **(b)** a lista de documentos definida
(PEN-019), **(c)** a revisão LGPD / ECA Digital cobrir os documentos e o prazo de retenção (OQ-12). Então, com
autorização: mude `"NGO_FILES_ENABLED": "true"` em `apps/api/wrangler.jsonc` (commit) e rode `pnpm deploy:api`.
`/config` passa a responder `"files": true`.

Para desligar, volte a bandeira para `"false"` e publique a API: os arquivos ficam guardados, as telas somem, os
logos das ONGs publicadas deixam de aparecer e a exclusão de conta continua apagando os documentos.

### 9.3 Reverter

`wrangler rollback` da API ([§6](#6-reverter)) é seguro **enquanto o envio nunca tiver sido ligado**: a versão
anterior ignora a tabela e o bucket. Depois de ligado, uma versão anterior a esta não apaga os documentos do R2 na
exclusão de conta: não reverta para antes dela; desligue a bandeira. A migration 0006 não é revertida. Apagar o bucket apaga os arquivos de todas as ONGs e é mudança de recurso: exige autorização.

## Limitações conhecidas

- Painel administrativo (`apps/dash`): publicado, sem utilidade prática enquanto as contas estiverem desligadas.
- Homologação: só o banco D1 `vilanoeldobem-staging` (sem Worker publicado); veja [staging-database.md](staging-database.md).
- A `main` ainda não exige o check `ci` verde para aceitar merge (proteção de branch a configurar no GitHub).
- Medição com Google (OQ-13): desde 2026-11-12 a tag tenta enviar dados para hosts de publicidade do Google que a CSP
  do jogo bloqueia. Cada bloqueio é um erro de console; `verify.mjs` (local) e `verify-live.mjs` (produção) falham por
  isso até a configuração do Google Analytics ser ajustada. Nada mais falha nessas conferências.
- Contas (0.4.0) desligadas em produção até a revisão LGPD / ECA Digital, a verificação do domínio no Resend e a
  chave `RESEND_API_KEY` no Worker.
- Arquivos de ONG (IMPL-0017): bucket não criado, migration 0006 não aplicada, envio desligado.

## Ver também

[reference/architecture.md](../reference/architecture.md) · [reference/storage.md](../reference/storage.md) ·
[IMPL-0015](../decisions/0015-dash-backoffice-app.md) · [IMPL-0017](../decisions/0017-ngo-files-r2.md)
