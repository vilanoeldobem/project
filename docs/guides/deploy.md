# Publicar na Cloudflare

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v11 ·
> **Atualizado em:** 2026-11-13
> **Fonte de verdade:** `package.json` (scripts `deploy:*`), `apps/{client,api,server,site,dash}/wrangler.jsonc`,
> `apps/*/package.json`

Produção ([IMPL-0005](../decisions/0005-public-site-and-domains.md),
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

| Host | Worker | App |
|---|---|---|
| https://play.vilanoeldobem.com.br | `vilanoeldobem` | `apps/client` (jogo, Static Assets) |
| https://client.vilanoeldobem.com.br | `vilanoeldobem` | 302 → `play` (apelido com o nome do app; mesmo caminho e query). **Ainda não publicado:** o domínio nasce no próximo `pnpm deploy:client` |
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
disponibilizar as operações que dependem dela. O código de contas/arquivos desta versão requer até 0007,
a gravação de progresso requer a 0008 (`progress_writes`, IMPL-0019; sem ela `POST /progress/events` responde `500`)
e as rotas de candidatura e de análise de ONG requerem a 0009 (`ngo_withdrawals`, IMPL-0020), **mesmo com
`NGO_WITHDRAWAL_ENABLED` desligada**; **toda rota que lê a sessão requer a 0010** (`users.blocked`, IMPL-0021),
com qualquer combinação de bandeiras; operações que encontrem colunas novas ou essas tabelas ausentes retornam
`503 schema_outdated`. As rotas públicas continuam tolerantes à v3, inclusive `/lots`, `/indicators`, `/ngos/:id`,
logo e fotos: nenhuma delas lê a tabela de retiradas nem o que a 0010 cria. Isso não dispensa o upgrade antes de ativar as contas. O
último estado registrado de produção permanece v3, sem aplicação remota destas migrations nesta entrega.

**Ordem com as contas ligadas: migration antes da API.** `db:migrate:remote` aplica todas as migrations pendentes
de uma vez (levar a 0010 a um banco na v3 aplica também 0004–0009). Com `ACCOUNTS_ENABLED = "false"` a API desta
versão pode ser publicada antes de qualquer migration: as rotas públicas respondem igual nos schemas v3 a v10
(teste em `apps/api/src/public-ngo.test.ts`). Com as contas ligadas, publicar a API antes da 0009 deixa
`/ngo/application`, `/admin/applications*`, o envio de fotos e de arquivos respondendo `503 schema_outdated` até a
migration ser aplicada. Publicá-la antes da **0010** deixa **toda requisição com sessão** (inclusive `GET /me`,
progresso e exclusão de conta), o cadastro, o pedido de link e a confirmação do link respondendo
`503 schema_outdated`, sem gravar nada (nenhum link é enviado nem gasto, nenhuma sessão é aberta): na prática,
ninguém entra até a migration ser aplicada ([§10](#10-administrador-e-moderação-impl-0021)).

## 4. Publicar

Cada app tem seu script na raiz; cada um roda o build (typecheck + `wrangler deploy --dry-run` ou `vite build`) e
depois `wrangler deploy`:

```bash
pnpm deploy:api        # api.vilanoeldobem.com.br
pnpm deploy:server     # server.vilanoeldobem.com.br
pnpm deploy:client     # play.vilanoeldobem.com.br (+ redirecionamento de app.* e client.*)
pnpm deploy:site       # www.vilanoeldobem.com.br
pnpm deploy:dash       # dash.vilanoeldobem.com.br
sh scripts/smoke-api.sh                                   # padrão: api.*, server.* e play.* de produção
node apps/client/scripts/verify-live.mjs                  # padrão: https://play.vilanoeldobem.com.br
```

`apps/client/scripts/verify.mjs` é **só local**: ele usa o painel de depuração do ambiente (`?envDebug=1`), que só
existe em `localhost`, e contra produção para com tempo esgotado em `.env-debug`. Em produção use o
`verify-live.mjs`: abre o jogo num Chrome real e falha se a chegada não for direta na Vila (um diálogo aberto, a
tela "Entrar na Vila" de volta, o botão "Menu" ou um dos três caminhos fora do HUD;
[IMPL-0022](../decisions/0022-immersive-entry-and-game-menu.md)), se houver erro de console (inclusive de CSP),
requisição que falhou, presença sem conectar ou interface de conta visível com as contas desligadas. Contra uma
produção que ainda tenha a tela de boas-vindas ele falha: rode-o depois de publicar o jogo. Não cria
conta nem grava nada.

### 4.1 Primeiro deploy da separação (IMPL-0009)

Mudança incompatível: a API perdeu o prefixo `/api`, então cliente e API vão juntos. Ordem obrigatória:

1. **API** (`pnpm deploy:api`): cria o Worker `vilanoeldobem-api` e o domínio `api.*`. Conferir
   `curl -s https://api.vilanoeldobem.com.br/health` → `"db":true`.
2. **Servidor** (`pnpm deploy:server`): cria o Worker `vilanoeldobem-server`, o domínio `server.*` e a classe de
   Durable Object `VillageRoom` pela migration `v1-village-room` (classe com SQLite, disponível no plano gratuito;
   nada é gravado nela). Conferir `curl -s https://server.vilanoeldobem.com.br/health` → `"rooms":true`.
3. **Cliente** (`pnpm deploy:client`): substitui o Worker `vilanoeldobem`, que passa a servir `play.*` e só
   redirecionar `app.*` (301) e `client.*` (302). Antes do primeiro deploy com `client.*`, confira que a zona não tem
   registro DNS `client`: fora de um terminal interativo o wrangler substitui um registro existente sem perguntar.
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

### 4.4 Service binding do servidor para a API (PROPOSTA, IMPL-0021)

`apps/server/wrangler.jsonc` declara `services: [{ binding: "API", service: "vilanoeldobem-api" }]`. É por ele, e só
por ele, que uma sala pergunta à API se um tíquete de moderação vale
([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md), [api.md](../reference/api.md#remoção-por-administrador-proposta)).
Não há segredo para configurar nem recurso para criar: o binding é parte do deploy do servidor.

Ordem: **API antes do servidor**.

- O Worker `vilanoeldobem-api` precisa existir quando o servidor é publicado: a Cloudflare recusa o deploy de um
  Worker cujo binding aponta para um serviço inexistente, e a versão anterior do servidor continua no ar
  (comportamento da plataforma, não exercitado neste repositório). Em produção a API já existe.
- Para a remoção funcionar, a API publicada precisa ter a rota `POST /moderation/consume`. Uma API mais antiga não
  conhece a rota e responde `405 method_not_allowed` a esse `POST` (fora das rotas de conta ela só aceita `GET` e
  `HEAD`); a sala só aceita `200` com o corpo exato `{"ok":true}`, então responde `0` a quem pediu e ninguém é
  removido.
- Binding ausente (servidor publicado de uma configuração sem `services`), API fora do ar ou lenta (mais de 3 s): a
  sala responde `0` e ninguém é removido. A presença não é afetada em nenhum desses casos.

`PRESENCE_MODERATION_ENABLED` permanece `"false"` em produção, no servidor e na API: com ela desligada a sala
responde `0` a todo pedido e nunca chama a API, então publicar o binding sozinho não muda nada para os visitantes.
Ligar a bandeira depende da aprovação do responsável (a remoção é PROPOSTA) e dos dois Workers publicados; uma
implementação testada não autoriza a ativação. Depois de ligada, o primeiro pedido de remoção em cada sala só é
atendido 35 s depois de a sala entrar em memória (por exemplo, logo após um deploy do servidor).

Em desenvolvimento local o binding se conecta sozinho ao `wrangler dev` da API (`pnpm --filter @vila/api dev`) que
estiver rodando na mesma máquina; sem ele, a sala responde `0`. O script `dev` do servidor já liga a bandeira. O
registro local do wrangler é um só por máquina: duas cópias do repositório rodando a API ao mesmo tempo disputam o
nome `vilanoeldobem-api` (para isolar uma delas, use `WRANGLER_REGISTRY_PATH`).

## 5. Site público e domínios

```bash
pnpm deploy:site                     # build + wrangler deploy (www + raiz como Custom Domains)
node apps/site/scripts/verify.mjs https://www.vilanoeldobem.com.br
curl -sI https://vilanoeldobem.com.br | grep -i location   # → https://www.vilanoeldobem.com.br/
curl -sI https://app.vilanoeldobem.com.br | grep -i location   # → https://play.vilanoeldobem.com.br/
curl -sI https://client.vilanoeldobem.com.br | grep -i location   # → https://play.vilanoeldobem.com.br/ (depois do deploy que cria o domínio)
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

1. **Migrations sequenciais até 0010 + API**, nesta ordem (ambas exigem autorização):

   ```bash
   pnpm --filter @vila/api db:migrate:remote     # aplica somente as migrations pendentes da sequência revisada
   pnpm deploy:api
   curl -s https://api.vilanoeldobem.com.br/health    # "db":true
   curl -s https://api.vilanoeldobem.com.br/config    # {"accounts":false}
   ```

   Aplique a sequência revisada antes de ativar o fluxo de contas. 0006 contém os arquivos canônicos, 0007
   contém a galeria e guardas, 0009 contém o registro de retiradas, lido pelas rotas de candidatura e análise, e
   0010 contém o bloqueio lido em toda conferência de sessão ([§3](#3-aplicar-migrations-remotas)). O perfil público funciona na v3 com campos opcionais ausentes tratados como
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

**O primeiro administrador** é criado à mão ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md),
DEC-037). A pessoa cria a conta normalmente e confirma o link; depois, alguém com acesso à conta Cloudflare roda,
em `apps/api`:

```bash
pnpm exec wrangler d1 execute vilanoeldobem --remote --command "UPDATE users SET role='admin' WHERE nickname='...'"
```

É uma escrita remota no D1: **proibida para agentes sem autorização humana explícita** (AGENTS.md). Com o papel, a
pessoa entra no painel administrativo (`dash.*`, [§8](#8-painel-administrativo-appsdash)); no jogo, o painel da conta
ganha o link "Abrir painel administrativo" depois de recarregar.

**Os demais administradores** recebem e perdem o papel pelo painel, por um administrador, com auditoria
(`POST /admin/users/:id/role`, [api.md](../reference/api.md#papéis-impl-0021)). Ninguém muda o próprio papel, então
sempre resta um administrador; se o único administrador excluir a própria conta, o comando acima volta a ser o
caminho. Esse comando continua valendo como recuperação, e não grava `audit_events`: registre quem o rodou e por
quê.

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
2. **Migrations sequenciais até 0010 + API**, como no [§7.1](#71-ordem-do-deploy-da-040), com autorização
   explícita. A 0006 contém arquivos canônicos; a 0007 contém galeria e guardas usados em todas as rotas de
   sessão; a 0009 contém o registro de retiradas usado nas rotas de candidatura e análise; a 0010 contém o
   bloqueio lido em toda conferência de sessão. **Se contas já
   estiverem ligadas, publicar esta API antes da 0007 ou da 0010 interrompe o acesso autenticado** e, antes da 0009, as
   rotas de candidatura e análise, com `503 schema_outdated`, mesmo com fotos e retirada desligadas. Cadastro/link/logout não provam que a sessão funciona.
   Aplicar a sequência antes da API e conferir `/me` com sessão sintética de homologação. O código anterior é
   compatível com as colunas/tabelas adicionais. Esta orientação não afirma aplicação no banco remoto.
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

### 9.4 Galeria institucional — ainda desligada

`NGO_PHOTOS_ENABLED` permanece `"false"` em produção. A galeria usa o mesmo `FILES` privado e exige a
migration 0007, contas operacionais, aceite explícito do responsável técnico à exceção proposta na regra de
publicação e as decisões da OQ-15 (direitos de imagem, registro de autorização e retenção após rejeitar a ONG).
Uma implementação testada não autoriza ligar a bandeira nem criar recursos. Conferir remoção pelo responsável,
rejeição individual, recuperação de falhas de limpeza e exclusão de conta em homologação antes de pedir ativação.
A interface de edição/revisão da galeria é outra entrega. Desligar a bandeira interrompe upload/publicação,
preservando operações autenticadas de remoção e recuperação.

### 9.5 Retirada de ONG publicada — ainda desligada (PROPOSTA)

`NGO_WITHDRAWAL_ENABLED` permanece `"false"` em produção e em homologação
([IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)). A rota `POST /admin/ngos/:id/withdraw` responde
`404` e o painel não oferece a ação. Ligar a bandeira depende das respostas do dono do produto à
[OQ-14](../decisions/open-questions.md) (efeitos sobre a conta e o CNPJ, ausência de restauração, retenção,
mensagem à organização) e da política de missões da OQ-09; uma implementação testada não autoriza a ativação.
A migration 0009 vem antes da API sempre que as contas estiverem ligadas ([§3](#3-aplicar-migrations-remotas)).
Depois de existir alguma retirada, não reverta a API para uma versão anterior a esta: ela não conhece o registro
e trataria a organização como publicada nas telas privadas e voltaria a contá-la no indicador público
`approved_ngos` (perfil, logo, fotos e terreno continuam sem mostrá-la, porque o terreno foi liberado). Desligar a bandeira só impede novas retiradas; nunca republica uma organização retirada.

## 10. Administrador e moderação (IMPL-0021)

Papéis geridos pelo painel, remoção de logo por administrador, bloqueio de conta e remoção de visitante de uma
sala ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)). Nada aqui autoriza deploy, migration
remota ou ativação de bandeira: cada passo exige autorização humana explícita (AGENTS.md).

### 10.1 Ordem

1. **Migration 0010 antes da API, sempre que as contas estiverem ligadas.** A conferência de sessão desta versão
   lê `users.blocked`: sem a 0010, toda requisição com sessão responde `503 schema_outdated`
   ([§3](#3-aplicar-migrations-remotas)). Com `ACCOUNTS_ENABLED = "false"` (produção hoje) a ordem não importa: as
   rotas públicas respondem igual nos schemas v3 a v10. A 0010 é aditiva (duas colunas em `users`, duas tabelas).
2. **API** (`pnpm deploy:api`). Conferir:

   ```bash
   curl -s https://api.vilanoeldobem.com.br/config
   # … "moderation":{"presence":false,"block":false}
   ```

3. Painel e jogo (`pnpm deploy:dash`, `pnpm deploy:client`): as telas mostram só o que `/config` informa como
   ligado; com as duas bandeiras desligadas restam a gestão de papéis e a remoção de logo.

Gestão de papéis (`POST /admin/users/:id/role`) e remoção de logo (`POST /admin/ngos/:id/logo/remove`) não têm
bandeira própria: passam a existir assim que as contas estiverem ligadas com a API desta versão. A remoção de logo
exige o bucket `FILES` ([§9](#9-arquivos-das-ongs-no-r2-impl-0017)).

### 10.2 As duas bandeiras — ainda desligadas (PROPOSTA)

| Bandeira | Onde | Produção e homologação | Script local `dev` | Depende de |
|---|---|---|---|---|
| `ACCOUNT_BLOCK_ENABLED` | `apps/api/wrangler.jsonc` | `"false"` | `true` | respostas do dono do produto à [OQ-11](../decisions/open-questions.md); contas ligadas; migration 0010 |
| `PRESENCE_MODERATION_ENABLED` | `apps/api/wrangler.jsonc` **e** `apps/server/wrangler.jsonc` | `"false"` | `true` | contas ligadas; migration 0010; os dois Workers publicados, com o binding de serviço do servidor para a API |

- `ACCOUNT_BLOCK_ENABLED` controla só **novos** bloqueios. Desligá-la não desfaz bloqueios gravados (continuam
  valendo, e um administrador ainda pode desfazê-los pelo painel). Uma implementação testada não autoriza a
  ativação: a política de sanções é PENDENTE (OQ-11).
- `PRESENCE_MODERATION_ENABLED` precisa estar ligada **nos dois Workers**. Só na API, o jogo recebe bilhetes que a
  sala recusa; só no servidor, a API responde `404` ao pedido de bilhete e ao consumo. `/config` da API mostra só o
  lado da API (`moderation.presence`).
- O limite `MODERATION_LIMITER` (60 requisições / 60 s; por endereço no domínio público, por sala nas chamadas do
  binding de serviço, que não têm endereço e só são cobradas quando o bilhete foi emitido) está declarado em
  `ratelimits` de `apps/api/wrangler.jsonc` (produção).
  Homologação não tem bindings de limite (`ratelimits: []`): lá nada é limitado pela API.

### 10.3 Binding de serviço do servidor de tempo real

**Lado da API (esta entrega):** a API não declara nada novo para ser chamada. O serviço que o servidor de tempo real
deve apontar é o Worker `vilanoeldobem-api` (produção), e a rota é `POST /moderation/consume`, em qualquer nome de
host (a sala usa `https://api.internal/moderation/consume`), sem sessão, sem `Origin` e sem segredo compartilhado;
a resposta de sucesso é `200` com o corpo exato `{"ok":true}`; o bilhete é a credencial ([api.md](../reference/api.md#remover-um-visitante-de-uma-sala-impl-0021-proposta)).
Como toda rota da API, ela também fica acessível pelo domínio público `api.*`; por isso responde o mesmo `404` a
tudo o que não é um bilhete válido, não envia CORS e tem limite próprio.

**Lado do servidor de tempo real:** a declaração do binding `API` em `apps/server/wrangler.jsonc`, a bandeira
`PRESENCE_MODERATION_ENABLED` do servidor, a ordem de publicação (API antes do servidor) e o que acontece com
binding ausente, API antiga ou API fora do ar estão em
[§4.4](#44-service-binding-do-servidor-para-a-api-proposta-impl-0021). O servidor de tempo real **não tem ambiente
de homologação** (`apps/server/wrangler.jsonc` declara só produção): a remoção de visitante é conferida no ciclo
local e, depois de autorizada, em produção.

Em desenvolvimento local, o registro do `wrangler dev` é global por máquina: o binding `API` de um servidor local
alcança o Worker local que estiver registrado como `vilanoeldobem-api`. Para uma conferência isolada, defina
`WRANGLER_REGISTRY_PATH` para um diretório temporário nos dois processos.

### 10.4 Reverter

- Reverter a API para uma versão anterior com `wrangler rollback` é seguro **enquanto não houver bloqueio em
  vigor**: a versão anterior ignora as colunas e tabelas novas. **Com algum bloqueio gravado, não reverta**: a
  versão anterior não lê `users.blocked` e a conta bloqueada voltaria a usar tudo. Desbloqueie antes, ou mantenha
  esta versão.
- A migration 0010 não é revertida; as tabelas ficam (vazias, se as bandeiras nunca foram ligadas).
- Desligar `PRESENCE_MODERATION_ENABLED` faz a API responder `404` a bilhetes e consumos; bilhetes pendentes
  expiram sozinhos em 30 segundos.

## 11. Expansão da Vila (IMPL-0023, PROPOSTA)

Layout novo, migração 0011 e a bandeira `RESIDENTIAL_PLOTS_ENABLED`
([IMPL-0023](../decisions/0023-village-expansion-and-zoning.md)). Nada aqui autoriza deploy, migration remota ou
ativação de bandeira: cada passo exige autorização humana explícita (AGENTS.md).

### 11.1 Ordem

1. **O jogo (`apps/client`) pode ser publicado antes de tudo.** Ele desenha a Vila pelas constantes
   compartilhadas e usa a API só para o estado. Contra a API e o banco de hoje (v3): os 8 terrenos que já existem
   aparecem na posição nova com o estado certo, os 4 novos aparecem sem aceitar candidatura, e a leitura dos
   terrenos residenciais falha em silêncio (a API antiga responde `404`; o painel segue dizendo que a posse não
   está aberta).
2. **A API desta versão também não depende da 0011.** `GET /lots` continua lendo o que o banco tem e
   `GET /residential-plots` responde o layout das constantes, tudo `unavailable`, enquanto a tabela não existir. As
   rotas públicas respondem igual nos schemas v3 a v11.
3. **O servidor de tempo real (`apps/server`) deve ser publicado junto com o jogo.** Ele limita a pose ao raio do
   mundo, que vem do pacote compartilhado: com o servidor antigo (34 u), quem anda além disso aparece para os
   outros preso na borda antiga.
4. **Migration 0011**, quando autorizada (`pnpm --filter @vila/api db:migrate:remote`; num banco na v3 ela leva
   junto as 0004–0010). É aditiva: muda só as colunas `x` e `z` de 8 linhas de `lots`, insere 4 linhas e cria
   `residential_plots` com 112. **Antes de aplicá-la em produção**, confirmar com o dono do produto que os números
   do plano são os definitivos ([OQ-18](../decisions/open-questions.md)): depois de aplicada, a migration não se
   edita, e um plano novo pede outra migration.

### 11.2 A bandeira — desligada (PROPOSTA)

| Bandeira | Onde | Produção e homologação | Script local `dev` | Depende de |
|---|---|---|---|---|
| `RESIDENTIAL_PLOTS_ENABLED` | `apps/api/wrangler.jsonc` | `"false"` | desligada | resposta do dono do produto à [OQ-16](../decisions/open-questions.md); contas ligadas; migration 0011; **a rota de posse, que ainda não existe** |

Ligá-la hoje só faz `GET /residential-plots` responder `available` em vez de `unavailable`: ninguém consegue ter
um terreno, e o jogo continua dizendo que a posse não está aberta. Não ligar.

### 11.3 Reverter

- Jogo, API e servidor: `wrangler rollback` de cada um; nenhum deles grava nada novo.
- A migration 0011 não é revertida. Com ela aplicada e o jogo antigo no ar, os 8 terrenos continuam funcionando (o
  jogo antigo usa as posições das próprias constantes); as 4 linhas novas e `residential_plots` ficam sem uso.

## Limitações conhecidas

- Expansão da Vila (IMPL-0023): migration 0011 não aplicada no remoto; `RESIDENTIAL_PLOTS_ENABLED` desligada; nada
  desta entrega foi publicado. Desempenho medido só em computador (Chrome com GPU e por software), não em celular.
- Moderação (IMPL-0021): migration 0010 não aplicada no remoto; `ACCOUNT_BLOCK_ENABLED` e
  `PRESENCE_MODERATION_ENABLED` desligadas; nada desta entrega foi publicado (API, servidor de tempo real com o
  binding de serviço, painel e jogo).
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
