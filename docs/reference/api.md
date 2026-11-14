# API HTTP e servidor de tempo real

> **Status:** Implementado (0.4.0; contas desligadas em produção por `ACCOUNTS_ENABLED`) · **Versão do software:** 0.4.0 ·
> **Schema D1:** v12 · **Atualizado em:** 2026-11-13
> **Fonte de verdade:** `apps/api/src/{api,auth,mail,session,progress,ngo,files,ngo-photos,media-storage,public-ngo,admin,backoffice,account-moderation,presence-moderation,donations,abacatepay,http}.ts`, `apps/api/src/api.test.ts`,
> `apps/api/src/accounts.test.ts`, `apps/api/src/files.test.ts`, `apps/api/src/{account-moderation,presence-moderation,logo-removal}.test.ts`,
> `packages/shared/src/accounts/{validate,files,contract,moderation,errors}.ts`, `apps/server/src/handler.ts`,
> `apps/server/src/room.ts`, `apps/server/src/room-do.ts`, `apps/server/src/env.ts`,
> `packages/shared/src/net/protocol.ts`

Dois Workers ([IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

| Serviço | Base em produção | Base local |
|---|---|---|
| API HTTP (`apps/api`) | `https://api.vilanoeldobem.com.br` | `http://localhost:8787` |
| Tempo real (`apps/server`) | `https://server.vilanoeldobem.com.br` (WebSocket `wss://`) | `http://localhost:8788` |

Rotas sem prefixo (o host já diz qual é o serviço; até a IMPL-0009 eram `/api/*` no mesmo host do jogo). Chaves,
valores de estado e códigos de erro em inglês; `label`, `note` e as mensagens de `fields` são textos de interface em
pt-BR. Todas as respostas são JSON UTF-8.

## API (`api.vilanoeldobem.com.br`)

Rotas públicas (somente leitura): só `GET`/`HEAD`/`OPTIONS`; outros métodos → `405` com `Allow: GET, HEAD, OPTIONS`.
Rotas de conta (`/auth/*`, `/me`, `/progress*`, `/ngo/*`, `/admin/*`,
[IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)) aceitam também `POST` e `DELETE` e só existem com a
bandeira `ACCOUNTS_ENABLED` ligada ([§ Contas](#contas-impl-0011)). Uma rota não é para navegadores:
`POST /moderation/consume`, chamada pelo servidor de tempo real
([§ Remover um visitante de uma sala](#remover-um-visitante-de-uma-sala-impl-0021-proposta)).

A migration 0007 é pré-requisito das rotas conciliadas. Nas rotas de conta, uma operação que encontre ausência
das colunas `files_deleting` ou `file_write_token` retorna `503 schema_outdated`, sem repetir a escrita com
guardas enfraquecidos. Isso não é um bloqueio global de autenticação: cadastro, emissão de links e consultas
sem sessão não dependem necessariamente dessas colunas. Aplicar o esquema antes de disponibilizar o fluxo.

A migration 0010 ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)) é pré-requisito de **toda
rota que lê a sessão**: a conferência da sessão lê `users.blocked`. Num banco sem a 0010, com as contas ligadas,
toda requisição com cookie de sessão válido, `POST /auth/register`, `POST /auth/link`, `POST /auth/verify` e (com a
bandeira ligada, para um bilhete bem formado) `POST /moderation/consume` respondem `503 schema_outdated`, nunca
`500`, **e nada é gravado**: nenhuma conta, nenhum link, nenhuma sessão
([o que cada rota de entrada faz](#cadastro-e-link-mágico-p13-oq-03)). `GET /me` sem sessão, `POST /auth/logout` e
as rotas públicas continuam respondendo. Com as contas ligadas, a migration vem antes da API
([deploy §3](../guides/deploy.md#3-aplicar-migrations-remotas)).

### CORS

As páginas do jogo, do site e do painel administrativo estão em outra origem, então a API responde com CORS **só**
para origens exatas da lista `ALLOWED_ORIGINS` (`apps/api/wrangler.jsonc`): `https://play.vilanoeldobem.com.br`,
`https://www.vilanoeldobem.com.br` e `https://dash.vilanoeldobem.com.br`. Sem curingas: um host parecido nunca
passa. `Access-Control-Allow-Credentials` só vai para as origens de `ACCOUNT_ORIGINS` (o jogo e o painel); o site lê
dados públicos sem cookie. Em desenvolvimento local as duas listas vêm do script `dev` (`http://localhost:5173` e
`http://localhost:8799` do jogo, `http://localhost:5175` e `http://localhost:8797` do painel).

| Requisição | Resposta |
|---|---|
| `Origin` na lista | `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Credentials: true` (só para origens de `ACCOUNT_ORIGINS`), `Access-Control-Allow-Methods: GET, HEAD, POST, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, X-Vila-Account, X-Vila-Caption`, `Access-Control-Max-Age: 86400`, `Vary: Origin` |
| `Origin` ausente ou fora da lista | só `Vary: Origin` (o navegador bloqueia a leitura; `curl` e servidores continuam lendo as rotas públicas) |
| `OPTIONS` (preflight) | `204` sem corpo, com os cabeçalhos acima quando a origem é permitida |
| qualquer método em `/moderation/consume` | **nenhum** cabeçalho CORS (nem `Vary`), seja qual for a `Origin`: o preflight de uma página falha e ela não lê a resposta |

`Access-Control-Allow-Credentials` existe por causa do cookie de sessão das rotas de conta; o cliente chama com
`credentials: "include"`.

`handleApi` aplica esses cabeçalhos na própria resposta devolvida pelo roteador (`res.headers.set`) e devolve a mesma
`Response`, em vez de reembrulhar `res.body` num `Response` novo: reembrulhar transforma um corpo de tamanho fixo
(`Content-Length`) em fluxo, e o navegador local podia ficar esperando o fim do corpo depois de um `POST`.

### GET /health

`Cache-Control: no-store`.

```json
{ "ok": true, "version": "0.4.0", "environment": "production", "db": true, "mail": false, "files": false }
```

`version` vem da constante `VERSION` em `apps/api/src/api.ts`. `mail` diz se o segredo `RESEND_API_KEY` existe no
Worker (nunca o valor). `files` diz se o bucket R2 está ligado ao Worker (binding `FILES`,
[IMPL-0017](../decisions/0017-ngo-files-r2.md)); não diz se o envio de arquivos está ligado — isso é `/config`.

### GET /config

Bandeiras que o cliente precisa saber antes de mostrar interface. `Cache-Control: no-store`.

```json
{ "accounts": false, "quests": false, "files": false, "withdrawal": false, "moderation": { "presence": false, "block": false },
  "residentialPlots": false, "donations": false }
```

`accounts` é `true` só quando `ACCOUNTS_ENABLED = "true"`. Com `false`, o jogo esconde toda a interface de conta
(chip "Entrar", candidatura de ONG) e a Vila segue jogável sem conta (OQ-02); o painel administrativo mostra o
aviso "Contas desligadas" e só dados públicos. O painel lista todas as chaves que esta rota devolver.

`quests` é `true` só quando `QUESTS_V1_ENABLED = "true"` (ligada no script local `dev`, desligada em produção e
staging). A missão narrativa `quests-v1` é PROPOSTA (DEC-039..042, PEN-025). O cliente só mostra as quests quando
`quests` é `true` **e** a bandeira dele também está ligada (`VITE_QUESTS_V1_ENABLED=true` no build ou `?quests=1` em
localhost/desenvolvimento). Ver [quests.md](quests.md) e [IMPL-0013](../decisions/0013-quests-v1-runtime.md).

`files` é `true` só quando as contas estão ligadas, `NGO_FILES_ENABLED = "true"` **e** o bucket R2 está ligado ao
Worker. Com `false`, o jogo e o painel não mostram nada de arquivo e as rotas de arquivo respondem
`404 files_disabled`. O envio de logo e documentos é PROPOSTA ([IMPL-0017](../decisions/0017-ngo-files-r2.md),
PEN-019): ligado no script local `dev`, desligado em produção e staging.

`withdrawal` é `true` só quando as contas estão ligadas **e** `NGO_WITHDRAWAL_ENABLED = "true"`. Com `false`, o
painel não oferece a retirada de ONG publicada e a rota responde `404`. A retirada é **PROPOSTA**
([IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md), OQ-14): desligada em produção, em staging e no
script local `dev`.

`moderation` diz o que funciona agora, para o jogo e o painel mostrarem só isso
([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md), **PROPOSTA**):

- `moderation.presence` é `true` só com as contas ligadas **e** `PRESENCE_MODERATION_ENABLED = "true"` na API
  (remover um visitante de uma sala). A API não sabe se o servidor de tempo real também está com a bandeira e o
  binding: se não estiver, a sala responde que não removeu.
- `moderation.block` é `true` só com as contas ligadas **e** `ACCOUNT_BLOCK_ENABLED = "true"` (novos bloqueios de
  conta). Com `false`, um bloqueio já gravado continua valendo e ainda pode ser desfeito.

As duas bandeiras ficam `"false"` em produção e staging e `true` no script local `dev`. A gestão de papéis e a
remoção de logo por administrador não têm bandeira própria (valem com as contas ligadas).

`residentialPlots` é `true` só com as contas ligadas **e** `RESIDENTIAL_PLOTS_ENABLED = "true"`. A posse de
terrenos residenciais é **PROPOSTA** ([IMPL-0024](../decisions/0024-village-expansion-and-zoning.md),
[OQ-17](../decisions/open-questions.md)): desligada em produção, em staging e no script local `dev`. Não existe
rota de posse; a bandeira hoje só muda o estado que `GET /residential-plots` responde. É o mesmo valor do campo
`enabled` daquela rota, em qualquer esquema e sem banco (`/config` não lê o banco).

`donations` é `true` só com `DONATIONS_ENABLED = "true"`; não depende de `accounts`, porque a doação também
existe para visitantes. Com `false`, o jogo mantém os botões de doação desabilitados com a nota honesta
(IMPL-0002) e nenhuma rota `/donations/*` existe. Doações são **PROPOSTA**
([IMPL-0023](../decisions/0023-donations-abacatepay.md), PEN-004/PEN-006/PEN-026): ligada no script local `dev`,
desligada em produção e staging. As rotas de doação dependem da migration 0011; num banco atrás do código elas
respondem `503 schema_outdated`.

### GET /indicators

Indicadores públicos (P02, DEC-027). `value: null` quando não há fonte verificável; a interface mostra "—" e `note`.
Cache 30 s.

| key | Fonte | Valor na 0.4.0 |
|---|---|---|
| `approved_ngos` | ONGs com `status='published'` ligadas a um terreno `published` (o que a Vila mostra; uma ONG retirada não tem terreno e não é contada) | número (ou `null` sem D1) |
| `registered_users` | — | `null` (o código ainda traz a nota "Cadastro ainda não implementado.") |
| `confirmed_donations` | `donations` com `status='paid'`, lida só com `DONATIONS_ENABLED = "true"` | número, ou `null` com a bandeira desligada (PEN-004, PEN-006) |
| `confirmed_amount` | soma de `donations.amount_cents` das mesmas doações | número em **centavos**, ou `null` |
| `people_impacted` | — | `null` (exige metodologia) |

```json
{ "updatedAt": "2026-11-08T21:00:00.000Z", "indicators": [ { "key": "approved_ngos", "label": "ONGs aprovadas", "value": 0 } ] }
```

### GET /lots

Terrenos e, só quando a ONG está `published`, nome, resumo e logo dela. `Cache-Control: no-store`. Candidaturas em
andamento mudam o `state` do terreno (`application_sent`, `under_review`), mas nunca expõem dados da organização.

```json
{ "lots": [ { "id": "plaza-01", "street": "plaza", "slot": 1, "x": 30.5, "z": 5,
              "state": "available", "ngo_id": null, "ngo_name": null, "ngo_summary": null, "ngo_logo": null } ] }
```

São os terrenos reservados a ONGs aprovadas (DEC-028): 8 linhas (`plaza-01`…`plaza-08`) num banco antes da
migração 0012, 12 (`plaza-01`…`plaza-12`) depois dela, que também move os oito primeiros para a fachada da praça
([IMPL-0024](../decisions/0024-village-expansion-and-zoning.md)). A forma da resposta é a mesma em todo esquema. O
jogo desenha os terrenos pelas constantes compartilhadas (`LOTS`) e usa esta rota só para o estado: um terreno que
a rota não lista (banco antes da 0012) aparece no jogo como "Terreno em preparação" (rótulo 3D, painel e lista
"Explorar ONGs"), sem aceitar candidatura; o jogo não envia a visita a ele como progresso.

`ngo_id`, `ngo_name`, `ngo_summary` e `ngo_logo` só aparecem para ONG e terreno publicados; nos demais estados são `null`.

`ngo_logo` é o caminho do logo nesta API (`/ngos/<id>/logo?v=<versão>`) quando a ONG publicada tem um; senão
`null`. Com o envio de arquivos desligado é sempre `null` (e a tabela `ngo_files` nem é lida).

### GET /residential-plots

Terrenos residenciais da Vila ([IMPL-0024](../decisions/0024-village-expansion-and-zoning.md), **PROPOSTA**) e o
estado de cada um. Pública, sempre ligada, `Cache-Control: no-store`. **Nunca diz quem é o dono de um terreno**
(não existe dono: a tabela não tem coluna de posse).

```json
{ "enabled": false,
  "plots": [ { "id": "premium-01", "tier": "premium", "slot": 1, "x": 44.5, "z": -7.5, "facing": -1.5708,
               "state": "unavailable" } ] }
```

| Campo | Significado |
|---|---|
| `enabled` | a bandeira: `true` só com as contas ligadas e `RESIDENTIAL_PLOTS_ENABLED = "true"`. É o mesmo valor de `residentialPlots` em `GET /config`, em qualquer esquema. Se um terreno pode ser pedido é o `state` dele |
| `tier` | `premium`, `standard` ou `economy` (da mais perto da árvore para a mais longe) |
| `slot` | posição dentro da faixa, a partir de 1 |
| `x`, `z`, `facing` | centro do terreno e rotação (rad) que o vira para a rua em frente; espelham `RESIDENTIAL_PLOTS` |
| `state` | `unavailable` enquanto a posse está desligada; com a bandeira ligada, `available` para o terreno cuja linha existe em `residential_plots`. `occupied` está reservado para a fase que trouxer a posse: nada o responde hoje |

112 terrenos (16 premium, 32 padrão, 64 econômico), sempre na mesma ordem. O que cada faixa exige não está aqui: é
um requisito (um nível), guardado em `VILLAGE_PLAN` no código compartilhado, nunca um preço. Não há `POST`: nenhuma
rota grava posse nesta versão (`405` para qualquer método além de `GET`, `HEAD` e `OPTIONS`).

**De onde vem a resposta.** A lista é sempre o layout das constantes compartilhadas (`RESIDENTIAL_PLOTS`): os 112
terrenos, na mesma ordem, com as posições do layout. A tabela só acrescenta estado.

- Com a bandeira desligada (ou as contas desligadas, ou sem banco) a resposta é uma constante e **o banco não é
  lido**.
- Com a bandeira ligada, a rota lê os ids de `residential_plots`: o terreno cuja linha existe responde
  `available`; linha que falta responde `unavailable`; linha que o layout não conhece é ignorada.
- **Esquemas antigos e erro de banco.** A tabela vem com a migração 0012 e produção está na 0003. Num banco sem a
  tabela, ou se a leitura falhar por qualquer motivo, a rota responde `200` com o layout e todo terreno
  `unavailable`, nunca `500` nem uma lista menor (o erro que não for "tabela ausente" vai para o log só pelo nome).
  `enabled` continua sendo a bandeira.

### GET /ngos/:id/logo

Logo de uma ONG **publicada e ligada a um terreno publicado** ([IMPL-0017](../decisions/0017-ngo-files-r2.md)); só existe com
`NGO_FILES_ENABLED = "true"` e o bucket ligado (senão `404 files_disabled`). ONG não publicada, sem logo ou
inexistente → `404 not_found`. É a única rota pública que entrega um arquivo: documentos nunca saem por aqui.

Cabeçalhos: `Content-Type` do arquivo (`image/png` ou `image/jpeg`), `Cache-Control: no-cache`, `ETag`
(com `If-None-Match` igual → `304`), `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: cross-origin`.

### GET /environment

Autoridade da hora e contrato do clima procedural ([environment.md](environment.md), IMPL-0006).
`Cache-Control: no-store` (o cliente mede o RTT para ancorar o relógio). Sem dados pessoais.

```json
{ "type": "environment.snapshot", "schemaVersion": 1, "worldId": "vila-noel-do-bem",
  "serverTimeMs": 1794274440067, "timezone": "America/Sao_Paulo", "timeScale": 1,
  "configVersion": 1, "weatherAlgorithmVersion": 1, "weatherSeed": 1078754363,
  "weatherSlotDurationMs": 2700000, "weatherTransitionMs": 300000,
  "cycle": { "dawnStart": "05:00", "dayStart": "06:00", "duskStart": "17:00", "nightStart": "18:30" } }
```

O cliente rejeita snapshots com `schemaVersion`, `timezone`, `timeScale` ou `weatherAlgorithmVersion` diferentes
dos que conhece e ignora `configVersion` menor que a atual.

## Contas (IMPL-0011)

Contas, link mágico, XP no servidor, candidatura de ONG (P12) e análise administrativa
([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)). **Desligadas em produção** até a revisão LGPD /
ECA Digital: `ACCOUNTS_ENABLED = "false"` em `apps/api/wrangler.jsonc`; o script local
`pnpm --filter @vila/api dev` liga a bandeira com `ENVIRONMENT=development`.

### Regras comuns

Avaliadas nesta ordem, para toda rota de conta:

1. `ACCOUNTS_ENABLED` diferente de `"true"` → `404 {"error":"accounts_disabled"}`.
2. Sem binding D1 → `503 db_unavailable`.
3. `Origin` ausente ou fora de `ACCOUNT_ORIGINS` (o jogo e o painel administrativo; sem essa variável, vale
   `ALLOWED_ORIGINS`) → `403 forbidden_origin` (inclusive em `GET`; `curl` sem `Origin` não chega às rotas de conta).
4. `/auth/*`: limite por IP com o binding `AUTH_LIMITER` (10 requisições a cada 60 s por `CF-Connecting-IP`; o IP é
   só a chave do limite, nunca gravado) → `429 too_many_requests`.
5. Corpo (`POST`): exige `Content-Type: application/json` (`415 json_required`; também força o preflight de CORS),
   no máximo 16 000 bytes (32 000 na candidatura; `413 too_large`), objeto JSON (`400 bad_json`). Sem
   `Content-Length`, a leitura para assim que o limite é passado (nunca guarda um corpo enorme na memória).
6. Escritas da própria conta (`POST /progress/events`, `POST /ngo/application`) levam `accountId`, o id da conta que
   a página acredita estar conectada. Diferente da sessão do cookie (outra aba trocou de conta) → `409
   account_changed`, nada é gravado; o cliente relê `/me` e passa a mostrar a conta certa.
7. Sessão de conta bloqueada ([bloqueio de conta](#bloqueio-de-conta-impl-0021-proposta), PROPOSTA): toda rota que
   exige sessão responde `403 session_blocked`, exceto `GET /me`, `POST /auth/logout` e `DELETE /me`. A conferência
   é feita a cada requisição e não depende da bandeira.

Todas as respostas de conta têm `Cache-Control: no-store`, imposto pelo roteador (inclusive em erros).
Campos de texto de cadastro e candidatura: caracteres de controle (NUL, ESC, quebras de linha…) viram espaço e
espaços repetidos são juntados. Erros de validação vêm como
`{"error":"invalid","fields":{"campo":"mensagem em pt-BR"}}`.

**Sessão:** cookie `__Host-vila_session` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`, 30 dias) no host da
API. O D1 guarda só o SHA-256 do valor. `play.*`, `dash.*` e `api.*` são o mesmo site, então o navegador envia o
cookie nas chamadas com `credentials: "include"`: a sessão criada no jogo vale no painel administrativo e vice-versa.
Rotas que exigem sessão respondem `401 not_signed_in` sem ela.

### Cadastro e link mágico (P13, OQ-03)

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/register` | `{name, nickname, city, email}` | `202 {"ok":true}` e envia o link. Só o jogo: vindo do painel (`Origin` = `DASH_ORIGIN`) → `403 forbidden_origin` |
| `POST /auth/link` | `{email}` | `202 {"ok":true}` (sempre a mesma resposta) |
| `POST /auth/verify` | `{token}` | `200 {user}` + `Set-Cookie: __Host-vila_session=…` |
| `POST /auth/logout` | — | `204`, apaga a sessão e o cookie |
| `GET /me` | — | `200 {user}` ou `200 {"user": null}` sem sessão (visitante não é erro) |
| `POST /me` | `{name, nickname, city}` | `200 {user}` (correção; e-mail não muda) |
| `DELETE /me` | — | `204`, exclui a conta (ver abaixo) |

`user` = `{id, name, nickname, city, email, role, deletionPending, blocked?}` (`role`: `player` ou `admin`; a
interface mostra "Padrão" e "Administrador", `ROLE_LABEL` em `packages/shared/src/accounts/contract.ts`). `deletionPending`
é booleano e informa exclusão iniciada ainda não concluída; clientes toleram a ausência em APIs anteriores.
`blocked` = `{message, at}` só existe enquanto a conta está bloqueada
([bloqueio de conta](#bloqueio-de-conta-impl-0021-proposta)): `message` é a mensagem que a administração escreveu
para a pessoa, entregue como foi escrita, e `at` o instante do bloqueio. Só a própria pessoa recebe esses
dados; para os outros, só o nickname é público.

**Campos (P13):** exatamente Nome, Nickname, Cidade e E-mail (DEC-038, **CONFIRMADO**). As regras de formato abaixo
são **PROPOSTA** (`packages/shared/src/accounts/validate.ts`, mesmas regras e mensagens no formulário e na API):

| Campo | Regra (PROPOSTA) |
|---|---|
| `name` | 2 a 80 caracteres (espaços repetidos colapsados) |
| `nickname` | 3 a 20 de `[A-Za-z0-9_.-]`, começando e terminando com letra, número ou `_`; único sem diferenciar maiúsculas (`409 nickname_taken`) |
| `city` | 2 a 60 caracteres |
| `email` | formato de e-mail, até 254 caracteres, guardado em minúsculas; único |

**Link:** token aleatório de 256 bits, guardado como SHA-256, válido por 15 minutos e de uso único (só a primeira
requisição que marca `used_at` vence). No máximo 3 links por conta a cada 15 minutos (acima disso a resposta continua
`202`, sem envio). O link aponta para o jogo (`<origin>/#login=<token>`): o token vai no **fragmento**, que o navegador
nunca envia a servidor nenhum, então não aparece em log de acesso do Worker do jogo. O cliente confirma com
`POST /auth/verify` e tira o token da barra de endereço. A primeira confirmação marca a conta como verificada e
encerra a sessão que aquele navegador já tinha (um navegador, uma conta). Cadastros não confirmados
são apagados depois de 24 horas (na próxima chamada de `POST /auth/register`).

**Sem enumeração de contas:** `POST /auth/link` responde igual para e-mail cadastrado ou não; `POST /auth/register`
com e-mail já cadastrado responde `202` como um cadastro novo (e reenvia o link à conta existente). Um e-mail de
conta bloqueada recebe exatamente as mesmas respostas e o mesmo e-mail (é o mesmo caminho de código): nada diz a
um terceiro que aquele e-mail está bloqueado.

**`devLink`:** só quando `ENVIRONMENT` é exatamente `development` ou `test`, a resposta `202` traz também
`{"devLink":"http://localhost:8799/#login=…"}`, para desenvolvimento e testes de navegador. Qualquer outro valor
(ausente, `production`, `staging`…) nunca devolve o link: ele só vai por e-mail (falha fechada — devolver o link
permitiria entrar na conta de qualquer pessoa).

**Destino do link:** a base do link é `GAME_ORIGIN` (`https://play.vilanoeldobem.com.br`), nunca o site que fez o
pedido. Uma única exceção ([IMPL-0015](../decisions/0015-dash-backoffice-app.md)): em `POST /auth/link`, quando o
cabeçalho `Origin` é **exatamente** igual a `DASH_ORIGIN` (`https://dash.vilanoeldobem.com.br`), o link abre o painel
administrativo (`https://dash.vilanoeldobem.com.br/#login=<token>`) e o e-mail diz isso. A comparação é de texto
(sem curinga, prefixo ou barra final); nada no corpo, na query ou em outros cabeçalhos muda o destino, e sem
`DASH_ORIGIN` configurado vale sempre o jogo. `POST /auth/register` nunca aponta para o painel.
**Limites por conta:** 3 links a cada 15 minutos e 10 por dia, contados e gravados num único
comando (pedidos em paralelo não passam do limite). Acima do limite a resposta continua `202`, sem envio.

**Sem enumeração:** o nickname é conferido antes do e-mail (mesma resposta com ou sem conta); `/auth/link` responde
`202` mesmo se o envio falhar (um `503` ali revelaria que a conta existe).

**Banco sem a migration 0010:** uma sessão aberta ali não serviria para nada (toda rota com sessão responde
`503 schema_outdated`), então as três rotas de entrada leem `users.blocked` **antes de gravar qualquer coisa** e
respondem `503 schema_outdated` sem escrever:

- `POST /auth/register`, com campos válidos: nenhuma conta é criada e nenhum link é gerado ou enviado (campos
  inválidos continuam `400 invalid`).
- `POST /auth/link`: `503` para **qualquer** e-mail (cadastrado, desconhecido ou malformado), então a resposta
  continua sem dizer se a conta existe; nenhum link é gerado ou enviado.
- `POST /auth/verify`: `503` para qualquer token de formato aceito, válido ou não (fora do formato continua
  `400 invalid_token`). O link **não é marcado como usado**, nenhuma sessão é gravada, nenhum cookie é enviado e
  `verified_at` não muda; depois de aplicada a migration, o mesmo link ainda vale dentro dos seus 15 minutos.

Num banco em dia nada disso muda: a consulta de `/auth/link` é a mesma para todo e-mail, e a confirmação continua
de uso único (só vence a requisição que marca `used_at`).

**Correção (`POST /me`):** `{name, nickname, city}` corrige os dados (direito de correção; também desfaz um cadastro
feito por outra pessoa com este e-mail antes do dono entrar). O e-mail não é editável. Se a conta for bloqueada
enquanto o pedido está a caminho, a correção é recusada no próprio comando: `403 session_blocked`, nada muda.

**Exclusão (`DELETE /me`):** apaga a conta, as sessões, os links e os eventos de missão (cascata no D1); uma
candidatura de ONG continua, sem o vínculo com quem a enviou (`applicant_id` vira `NULL`). Grava `audit_events`
`user.delete` (ator e assunto pelo id, sem dados pessoais).
Se a limpeza dos arquivos falhar, `GET /me` mantém a sessão e responde `deletionPending: true`. A tela da conta
exibe a exclusão pendente e o botão **Tentar concluir exclusão**. A exclusão não pode ser cancelada: parte dos
bytes já pode ter sido apagada. O cliente relê esse estado depois de uma falha e repete o mesmo `DELETE /me`.

### E-mail (Resend, IMPL-0012)

`apps/api/src/mail.ts`. `POST https://api.resend.com/emails` com o segredo `RESEND_API_KEY`, remetente `MAIL_FROM`
(`acesso@vilanoeldobem.com.br`, nome "Vila Noel do Bem"), limite de 8 s. Uma única mensagem: o link de acesso, em
pt-BR, texto e HTML, sem rastreio nem marketing.

| Situação | Resultado |
|---|---|
| Produção sem `RESEND_API_KEY` | `503 mail_unavailable` |
| Resend recusa o envio (status ≠ 2xx) | `503 mail_unavailable`; log `mail_error <status> <nome do erro>` |
| Falha de rede ou tempo esgotado | `503 mail_unavailable`; log `mail_error network <classe do erro>` |
| `ENVIRONMENT` = `development` ou `test` | envia se houver chave e devolve `devLink` |
| Qualquer outro ambiente sem chave | `503 mail_unavailable` (nunca devolve o link) |

O log nunca traz endereço, link, chave nem a mensagem de erro do Resend.

### Missões e XP no servidor (P14, DEC-040, DEC-042)

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /progress` | — | `{progress}` |
| `POST /progress/events` | `{accountId, events: [{missionId, eventId}]}` (1 a 50) | `{progress}` |

- `missionId` precisa existir em `MISSIONS` ou em `QUESTS` (`packages/shared/src/game/`); `eventId` precisa ser um que
  o jogo produz para aquela missão: id de presente (`GIFTS`), `win`, id de terreno (`LOTS`), `panel`, ou, nas quests,
  `accept`, `turn-in` e os ids de objetivo de `objectiveEventIds` (`KNOWN_EVENTS` em `apps/api/src/progress.ts`).
  Qualquer item inválido → `400 bad_events` (nada é gravado).
- Eventos de quest só são gravados com `QUESTS_V1_ENABLED = "true"`. Com a flag desligada eles são ignorados (o lote
  responde `200` e os demais eventos são gravados); as quatro missões rápidas valem sempre. A flag é exposta em
  `GET /config` (`quests`). O conteúdo e os valores de XP são PROPOSTA (PEN-025); ver [quests.md](quests.md).
- Idempotente: a chave primária `(user_id, mission_id, event_id)` torna um evento repetido inócuo. O progresso é
  refeito repetindo os eventos gravados, na ordem em que foram gravados, pelo mesmo `applyEvent` do cliente: cada
  missão dá XP uma vez (e o XP de uma quest entra só no `turn-in`).
- Quests dependem de ordem ([IMPL-0013](../decisions/0013-quests-v1-runtime.md)): um evento de quest só é gravado se
  for uma transição válida sobre o progresso já gravado (o lote é aplicado na ordem recebida). Evento ainda inválido
  (`accept` com outra missão em andamento, objetivo antes do `accept`) é omitido. Os eventos válidos do mesmo lote
  são gravados e a resposta `200 {progress}` permite ao cliente carregar o progresso da conta. Isso preserva a
  regra anterior de IMPL-0013; não enfileira automaticamente uma segunda quest. Eventos das quatro missões rápidas continuam armazenados
  uma vez, inclusive além da meta; o limite de 500 linhas por conta conta somente chaves novas e únicas.
- A gravação usa revisão por conta e token exclusivo em uma transação D1 ([IMPL-0019](../decisions/0019-progress-concurrency-and-acknowledgment.md)).
  Duas sessões que leem o mesmo progresso não podem gravar decisões incompatíveis: a perdedora relê e revalida o
  lote, até três tentativas, com espera aleatória curta entre elas (20–39 ms e 40–59 ms). Contenção persistente →
  `409 progress_conflict`, sem confirmar o lote perdedor. Eventos
  de quest já aceitos mantêm sua posição; um registro legado que nunca foi uma transição válida pode ser reposicionado
  somente quando seu reenvio for válido, sob a mesma proteção. O timestamp de novas linhas não retrocede em relação
  ao histórico da conta, preservando a ordem mesmo com diferença de relógio entre Workers.
- Ao entrar, o cliente envia o progresso de visitante deste navegador (em lotes de 50), apaga-o do navegador e mostra
  o da conta; depois envia cada evento novo. Eventos que falham ficam numa fila (`vila.pending.v1:<id da conta>`) e
  são reenviados quando a conexão volta, em novo evento ou na próxima entrada. `409 progress_conflict` preserva
  essa fila; não existe atualização instantânea da tela entre dispositivos nem nova tentativa por temporizador.
  Um evento que o servidor omite sai da fila (a resposta foi `200`), e a tela só troca o progresso local pelo da
  conta na próxima entrada ou ao recarregar a página.
  `GET /progress` recupera o estado persistido pela sessão da conta. Ao sair, o jogo volta ao progresso de visitante (vazio depois da migração):
  num navegador compartilhado a próxima pessoa não herda nada.
- Confiança (**PROPOSTA**): o servidor confere ids de missão, ids de evento conhecidos, idempotência e, nas quests, a
  ordem das transições; não prova que o presente foi achado nem que o NPC foi visitado na cena. Uma conta consegue
  forjar no máximo o XP do catálogo (575 XP com as quests ligadas). XP não dá nada que dinheiro compre, e doação não
  dá XP.

O formato de sucesso é sempre `{progress}`, o estado autoritativo da conta. Exemplo: um visitante com
`lake-lanterns` aceita entra na conta que tem `harness-bells` ativa e 40 XP; o `accept` incompatível é omitido, o
cliente adota o estado da conta e limpa a fila enviada. O progresso de visitante dessa quest não é levado para a conta.
Não existe abandono, substituição automática da quest ativa ou fila de futuras quests; essa decisão continua em
[OQ-09](../decisions/open-questions.md). Com quests desligadas os eventos são omitidos; o cliente usa `/config`
para não enviá-los.

Prova local com duas sessões e dados sintéticos: `apps/api/scripts/verify-progress.mjs` (somente localhost), incluindo
concorrência, reenvio, novo login, XP/nível e isolamento de contas. O script não publica recursos nem aplica migrations
remotas; aplicar `0008_progress_write_guard.sql` no banco local antes de iniciar o Worker.

Na raiz do checkout, com Node 24 e pnpm 10, usar somente o simulador local:

```bash
pnpm db:migrate:local
node apps/api/scripts/verify-progress.mjs --seed > .progress-smoke-seed.sql
pnpm --filter @vila/api exec wrangler d1 execute DB --local --file ../../.progress-smoke-seed.sql
pnpm --filter @vila/api exec wrangler dev --local --port 8795 --inspector-port 9245 --var ACCOUNTS_ENABLED:true --var QUESTS_V1_ENABLED:true --var ALLOWED_ORIGINS:http://localhost:8799 --var ACCOUNT_ORIGINS:http://localhost:8799 --var ENVIRONMENT:development
# Em outro terminal, depois de o Worker ficar pronto:
node apps/api/scripts/verify-progress.mjs http://127.0.0.1:8795
```

O seed reinicia somente as duas contas sintéticas identificadas no script. Não executar esse SQL remotamente;
apagar `.progress-smoke-seed.sql` e encerrar o Worker após a prova. As flags acima valem só para esse processo local.

### Candidatura de ONG (P12, DEC-015, DEC-037)

| Método e rota | Resposta |
|---|---|
| `GET /ngo/application` | `{application, files}` (a da própria conta) ou `{application: null, files: []}` |
| `POST /ngo/application` | `201 {application, files}` (primeira) ou `200 {application, files}` (reenvio); corpo com `accountId` e os campos abaixo |

Quatro etapas do wireframe; a lista de campos é **PROPOSTA** (G08, PEN-019). Os critérios são declarados; logo e
documentos são opcionais e seguem [§ Arquivos da candidatura](#arquivos-da-candidatura-impl-0017) (`files` vem
vazio enquanto o envio estiver desligado).

| Etapa | Campo | Regra |
|---|---|---|
| 1. Dados da organização | `name` | 3 a 120 caracteres |
| | `cnpj` | 14 dígitos (pontuação ignorada) com dígitos verificadores válidos; sequências repetidas recusadas |
| | `openedOn` | `YYYY-MM-DD`, pelo menos 1 ano antes de hoje (DEC-015, critério 2; medida pela data do CNPJ — PEN-013, **PROPOSTA**) |
| | `city` | 2 a 60 caracteres |
| 2. Documentos e comprovações | `declarations` | `{activeCnpj, oneYear, fundsConfirmable}`, os três `true` (os três critérios do DEC-015) |
| | `fundsConfirmation` | como os recursos podem ser confirmados, 20 a 1000 caracteres |
| 3. Apresentação e projetos | `summary` | 20 a 280 caracteres (aparece na casa) |
| | `description` | 50 a 2000 caracteres |
| | `tags` | 1 a 4 de `children`, `elderly`, `animals`, `education`, `health`, `food`, `housing`, `environment`, `culture`, `sport`, `disability`, `women` (DEC-028; lista **PROPOSTA**) |
| | `projects` | até 3 (`[{title, description}]`, título 3–80, descrição até 400; extras ignorados) |
| 4. Revisão e envio | `lotId` | `plaza-NN`, terreno `available` (ou o que a candidatura já ocupa) |

`application` = os campos acima + `{id, status, revision, reviewNote, createdAt, updatedAt}`. Depois de uma
[retirada administrativa](#retirada-administrativa-de-ong-publicada-impl-0020-proposta) (PROPOSTA), o status
efetivo é `withdrawn` e há `withdrawal: {reason, at}`: `reason` é a mensagem que a administração escreveu para a
organização, vista só pelo responsável e pelos admins. A mensagem anterior da análise (`reviewNote`) é preservada.
A lista administrativa mostra o status, não a mensagem.

Regras do envio:

- Exige conta verificada (`403 not_verified`).
- Uma candidatura ativa por conta: com uma em `submitted`, `under_review` ou `published` → `409 application_active`.
- ONG retirada → `409 application_withdrawn`: o código atual não permite reenvio nem nova candidatura da mesma
  conta (PROPOSTA; o retorno à Vila é pergunta aberta, OQ-14).
- Terreno ocupado → `409 lot_unavailable` (com `fields.lotId`); CNPJ de outra candidatura → `409 cnpj_in_use` (com
  `fields.cnpj`). A reserva do terreno é condicional no mesmo lote de SQL; se outra pessoa levou o terreno no meio,
  a mudança é desfeita e a resposta é `409 lot_unavailable`.
- O envio reserva o terreno (`application_sent`) e grava `audit_events` `ngo.submit`.
- **Reenvio** depois de `changes_requested` ou `rejected`: mesma linha, `revision + 1`, volta a `submitted`, apaga a
  mensagem anterior; se o terreno mudou, o antigo é liberado. Audita `ngo.resubmit`.
- Nada fica público antes da aprovação. Depois dela, `/lots` mostra nome e resumo; `/ngos/:id` disponibiliza
  também descrição, causas e projetos. A candidatura avisa quais campos serão públicos; cidade e contato não
  integram o perfil público. Fotos exigem ainda aprovação individual.

**Estados da candidatura e do terreno** (nomes **PROPOSTA** do plano; terreno conforme DEC-028):

| Candidatura (`ngos.status`) | Terreno (`lots.state`) |
|---|---|
| `submitted` | `application_sent` |
| `under_review` | `under_review` |
| `changes_requested` | `application_sent` (continua reservado) |
| `published` | `published` |
| `rejected` | `available` (liberado, `ngo_id = NULL`) |
| `withdrawn` (status efetivo da API; aprovação anterior preservada no banco) | `available` (associações atuais liberadas, `ngo_id = NULL`) |

### Arquivos da candidatura (IMPL-0017)

Logo e documentos da candidatura, guardados num bucket R2 privado
([IMPL-0017](../decisions/0017-ngo-files-r2.md)). **PROPOSTA**, desligado em produção: as rotas só existem com
`NGO_FILES_ENABLED = "true"` e o bucket ligado (`/config` → `files: true`); senão `404 files_disabled`. A lista de
documentos que uma ONG deve enviar é PENDENTE (PEN-019): nenhum é obrigatório nem tem nome.

| Tipo (`kind`) | Quantos | Formatos | Tamanho | Lados da imagem | Quem lê |
|---|---|---|---|---|---|
| `logo` | 1 (enviar outro substitui) | PNG, JPEG | até 512 KB | 64 a 1024 px | público só depois de `published` (`GET /ngos/:id/logo`) |
| `document` | até 5 | PDF, PNG, JPEG | até 5 MB | até 8192 px | só quem enviou e os admins |

Os limites vêm de `FILE_RULES` em `packages/shared/src/accounts/files.ts`, usados pela API e pelas telas.

| Método e rota | Requisição | Resposta |
|---|---|---|
| `POST /ngo/application/files?kind=logo\|document` | corpo = os bytes do arquivo; `Content-Type` = formato do arquivo; `X-Vila-Account` = id da conta | `201 {file, revision}` |
| `GET /ngo/application/files/:id` | — | os bytes (só os da própria candidatura) |
| `DELETE /ngo/application/files/:id` | `X-Vila-Account` | `200 {revision}` |
| `GET /admin/applications/:id/files/:fileId` | — | os bytes (admin) |
| `POST /ngo/application/files/recover` | sem corpo; `X-Vila-Account` = id da conta responsável | `200 {cleaned, remaining}` |
| `POST /admin/applications/:id/files/recover` | sem corpo; `X-Vila-Account` = id do admin | `200 {cleaned, remaining}` |

`file` é `{id, kind, contentType, size, createdAt}`. **Não existe nome de arquivo**: o nome original não é enviado,
guardado nem devolvido (costuma trazer nome de pessoa); as telas chamam os downloads de `logo.png` e
`documento-N.pdf`. `GET /ngo/application` e `GET /admin/applications/:id` trazem a lista em `files` (logo primeiro,
documentos na ordem de envio). A candidatura, sua revisão e `files` são lidos na mesma instrução SQL,
para que a lista corresponda à revisão mostrada ao administrador.

- **Quem pode enviar:** conta logada e verificada, com candidatura, de uma origem de `ACCOUNT_ORIGINS`.
  `X-Vila-Account` tem o mesmo papel do `accountId` das escritas em JSON (`409 account_changed` se outra aba trocou
  de conta). Limites: 20 envios ou remoções por minuto por conta (`429 too_many_requests`) e 60 mudanças de
  arquivo por candidatura a cada 24 horas (`429 too_many_file_changes`, com `fields.file`).
- **Quando:** em `submitted`, `changes_requested` e `rejected`. Durante a análise (`under_review`) os arquivos ficam
  travados, para que seja decidido exatamente o que foi visto, e depois de `published` ficam congelados (nos dois
  casos `409 application_locked`). Depois de uma retirada administrativa (`withdrawn`, IMPL-0020, **PROPOSTA**):
  nenhum envio ou troca (`409 application_withdrawn`), mas a pessoa ainda **remove** os próprios arquivos
  (`DELETE`), com a mesma auditoria e o mesmo incremento de `revision`.
- **O que a API confere:** formato aceito para o tipo (`415 file_type`); tamanho, no cabeçalho e de novo enquanto os
  bytes chegam (`413 file_too_large`); formato real, lido da assinatura dos bytes, igual ao `Content-Type`
  (`400 file_mismatch`: uma página HTML ou um PDF chamado de PNG não passa; SVG nunca é aceito); imagem bem formada
  (`400 file_invalid`) e dentro dos limites de pixels (`400 image_too_small`, `400 image_too_large`); arquivo vazio
  (`400 file_empty`). Todos trazem `fields.file` com a frase em pt-BR.
- **O que é guardado:** imagens sem os metadados conhecidos (EXIF com GPS e aparelho, XMP, IPTC, comentários,
  miniaturas, blocos de texto do PNG, bytes depois do fim da imagem); do EXIF do JPEG fica só a orientação. Os
  pixels e o perfil de cor não mudam. Só recodificar a imagem removeria tudo; PDF é guardado como veio. Um JPEG com
  mais de um cabeçalho de tamanho, ou um arquivo feito de centenas de milhares de pedaços, é recusado
  (`400 file_invalid`).
- **Revisão:** cada envio ou remoção soma 1 em `revision` (devolvido na resposta). Uma decisão do admin feita sobre
  a revisão anterior é recusada com `409 stale_revision` (menos `start_review`, que usa a revisão atual lida
  no servidor e trava os arquivos). A escrita ainda compara **estado e revisão exatos**: se uma mutação vencer
  entre a leitura e a transação, a análise não começa sobre um snapshot ultrapassado. Se a candidatura mudar
  enquanto o arquivo chega ou é removido, a resposta é `409 application_changed`; um reenvio da candidatura que
  perde para uma mudança de arquivo responde o mesmo. A intenção durável precede R2; falha na compensação deixa
  limpeza pendente rastreável. O token exclusivo impede auditoria duplicada por perdedores.
- **Falhas de armazenamento:** a reserva vazia e o PUT condicionado ao ETag são compartilhados com a galeria.
  O commit exige intenção ativa e a remove junto dos metadados. Confirmação incerta é seguida de releitura antes
  de apagar bytes; se o commit ocorreu, o arquivo permanece legível, embora a resposta possa ser `500 internal`.
  Remoção/substituição registra limpeza antes de desvincular o objeto. Uma remoção com falha física retorna
  `503 file_cleanup_pending`; um logo novo confirmado permanece válido se a limpeza do antigo falhar.
- **Recuperação:** as duas rotas `files/recover` acima tratam no máximo 50 intenções por chamada, em ordem de
  criação/id: limpeza marcada ou upload com mais de 15 minutos. `cleaned` conta exclusões confirmadas; `remaining`
  conta todas as intenções restantes, inclusive envios recentes que não foram cancelados. Não retornam chave,
  nome ou conteúdo. Exigem sessão, origem permitida, cabeçalho da conta e o limitador canônico; a rota administrativa
  exige admin. Funcionam com `NGO_FILES_ENABLED` desligado, mas exigem contas e binding `FILES`. A marca de limpeza
  impede finalização concorrente; erro mantém o registro para repetir. O prazo de 15 minutos cancela envio
  abandonado, sem estabelecer retenção de documentos ou execução automática.
- **Leitura por admin:** `GET /admin/applications/:id` lista os arquivos e `GET /admin/applications/:id/files/:fileId`
  os entrega sempre que o bucket está ligado, mesmo com `NGO_FILES_ENABLED` desligado: quem aprova vê o que existe.
- **Como os bytes são servidos:** `Content-Type` do arquivo, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: no-store`; documento sempre com
  `Content-Disposition: attachment`, logo com `inline`. As rotas conferem `Origin`, então um link direto ou um
  `<img src>` não funciona: as telas leem com `fetch` e `credentials: "include"`.
- **Auditoria:** `ngo.file_add` e `ngo.file_remove` (quem enviou), `ngo.file_read` (admin que baixou um
  **documento**; ver o logo não grava nada). `detail` é `{kind, file, revision?}`: sem nome de arquivo.
  Recuperação administrativa grava `ngo.file_cleanup` com `{requested}` antes do I/O destrutivo, inclusive quando
  houver falha parcial; é registro da tentativa, não confirmação de descarte.
- **Exclusão de conta:** `DELETE /me` apaga do R2 e do D1 os documentos da pessoa e o logo de candidatura que
  não está na Vila; o logo de uma ONG publicada **e ligada a um terreno publicado** fica. Uma ONG retirada
  (IMPL-0020) não tem terreno: o logo dela é apagado com a conta. Antes de acessar R2, marca `users.files_deleting=1`: novas escritas
  de candidatura/arquivo/foto, decisões administrativas concorrentes e a retirada (`409 account_deleting`) são recusadas, exceto rejeitar uma candidatura
  ainda aberta para liberar o terreno. Essa rejeição não cancela a exclusão nem altera a política de retenção. Se R2 falhar, a conta e
  sessão continuam (`500`) e a marca fica: o usuário repete **o mesmo `DELETE /me`** após a recuperação. Essa marca
  não expira nem é desfeita, pois parte dos bytes pode já ter sido removida. Se houver metadados sem binding
  `FILES`, responde `503 files_unavailable` **antes de apagar qualquer objeto**: a marca posta por esse pedido é
  desfeita e a conta fica como estava (sem `deletionPending`); uma marca deixada por tentativa anterior permanece. Escritas novas recebem `409 account_deleting`; leitura e sessão
  continuam disponíveis para repetir a exclusão. A transação final incrementa as revisões das candidaturas antes
  de remover a conta: uma revisão antiga não pode aprovar evidências que foram apagadas. Chaves e registros de
  upload/limpeza em `media_upload_intents` também são apagados; PUT atrasado não pode recriar os bytes removidos.

### Perfil público e galeria institucional (IMPL-0018, PROPOSTA)

Conciliação sobre o PR #32: reutiliza `FILES` e o sanitizador de imagens da IMPL-0017. Galeria é conteúdo
institucional; logo e documentos continuam no fluxo e nas telas existentes. Não há nova tela de galeria neste PR.
Envio e publicação das fotos dependem de `NGO_PHOTOS_ENABLED="true"`, desligada em produção e staging.
Leitura privada, fila e remoção permanecem acessíveis com bucket ligado mesmo se novos envios forem desligados;
exigem `ACCOUNTS_ENABLED` e sessão autorizada. Sem bucket, a galeria privada retorna `503 photos_unavailable`.
O perfil textual público degrada para `photos: []` se não houver bucket/tabela de fotos ou se a flag estiver desligada.

| Rota | Contrato |
|---|---|
| `GET /ngos/:id` | `{ngo: {id, name, summary, description, tags, projects, lotId, photos}}` |
| `POST /ngo/photos?ngoId=:id&position=0` | bytes crus PNG/JPEG, `Content-Type`, `X-Vila-Account`, `X-Vila-Caption: encodeURIComponent(legenda)`; `201 {photo}` pendente |
| `GET /ngo/photos?ngoId=:id` | `{photos}` só da própria ONG |
| `GET /admin/ngos/:id/photos` | `{photos}` para admin |
| `GET /admin/ngo-photos` | fila `{photos}` de pendentes/limpezas, até 100, ordenada por criação e id |
| `DELETE /ngo/photos/:id` | `X-Vila-Account`; responsável remove e pode repetir a limpeza que falhou |
| `GET`/`HEAD /ngo/photos/:id/content` | bytes privados para responsável |
| `GET`/`HEAD /admin/ngo-photos/:id/content` | bytes privados para admin |
| `POST /admin/ngo-photos/:id/decision` | JSON `{accountId, revision, action: "approve" | "reject" | "remove"}`; `200 {photo}` |
| `GET`/`HEAD /ngos/:ngoId/photos/:photoId` | bytes apenas da foto aprovada, ONG publicada e terreno realmente publicado |

O perfil público retorna `404` sem a associação publicada, mesmo que `requested_lot_id` exista. Expõe só campos
públicos e projetos `{title, description}`; nunca CNPJ, contato, declarações, documentos, revisão, parecer ou chave
R2. `photos` é `[]` com galeria desligada; quando ligada contém apenas `{id, url, caption, position}` aprovados,
ordenados por posição e id. O perfil usa `no-store`; logo e fotos públicos usam `no-cache` com ETag. A API
revalida a associação e a aprovação antes de responder `304`, sem abrir o corpo quando o ETag corresponde.
Retirada ou despublicação retorna `404` mesmo com ETag anterior. Bytes privados continuam `no-store`.
Sem bucket/tabela de galeria, a rota pública de foto retorna `404` e o perfil mantém `photos: []`. Depois de uma
retirada administrativa (IMPL-0020, PROPOSTA) o envio de fotos e as decisões `approve`/`reject` respondem
`409 application_withdrawn`; a remoção pelo responsável (`DELETE /ngo/photos/:id`) e por admin (`remove`) continua.

Upload: responsável verificado; ONG em `submitted`, `changes_requested` ou `published`;
até 10 fotos pendentes/aprovadas (rejeitadas e removidas liberam cota); posição inteira 0–9; legenda opcional com até 240
pontos de código Unicode, enviada no cabeçalho (máximo 3000 caracteres codificados), **nunca na URL**. PNG/JPEG
até 2 MiB, 4096 px por lado e 16 milhões de pixels. WebP e SVG não são aceitos. Assinatura e estrutura são
verificadas; EXIF/XMP/comentários/texto são removidos pelo sanitizador compartilhado. Isso não é antivírus nem
uma decodificação completa da imagem. A API não aceita o antigo corpo JSON/base64 do PR #29.

A resposta privada `photo` contém `{id, ngoId, caption, position, status, revision, contentType, byteSize,
previewUrl, uploadPending, cleanupPending}`. Revisão própria da foto, separada da candidatura. A prévia é nula
para envios incompletos, rejeições e remoções. Admin não revisa sua própria ONG; só `pending` completo pode ser
aprovado/rejeitado. Aprovar exige `GET` administrativo auditado da mesma revisão pelo mesmo admin; `HEAD` só lê
metadados do bucket e não satisfaz essa condição. O registro de acesso não prova compreensão humana.

Remoção e rejeição revogam acesso e limpam a legenda antes de apagar bytes. Falha deixa `cleanupPending: true`
e `503 photo_cleanup_pending`; a linha permanece nas listas/fila para repetir a remoção. O responsável pode
remover inclusive foto aprovada; isso não exige que o envio esteja ligado. Auditoria registra envio e leitura
administrativa (`ngo.photo.upload|read`) além de decisões `ngo.photo.approve|reject|remove`.
Não são exigidos documentos adicionais.

Erros: `400 invalid_photo_metadata` (posição/legenda), `400 file_type|file_mismatch|file_invalid|image_too_large`,
`413 too_large` (limite de corpo), `409 photo_limit_or_owner_changed`, `409 stale_revision`,
`409 photo_object_missing|photo_review_required`, `503 photo_cleanup_pending|photos_unavailable`, `403 self_review`, além dos erros comuns de sessão/origem. A mesma cota
`FILE_LIMITER` canônico se aplica a envio/remoção; o envio tem limite adicional de 60 por candidatura em 24 horas. Imagens de outra ONG, pendentes ou removidas retornam `404` ao público.

Ao excluir a conta, toda a galeria é removida, inclusive fotos aprovadas. Isso é distinto da retenção do logo
institucional canônico. A exclusão falha de forma retomável se a limpeza dos bytes falhar; não confirma remoção
com objetos ainda pendentes. Direitos de imagem e consentimentos continuam sob OQ-15: o envio **não pede nem registra** declaração alguma, e a retenção das fotos depois de rejeitar a candidatura da ONG não está definida (PROPOSTA; a bandeira fica desligada até o dono do produto responder).

### Análise administrativa (DEC-037)

Só contas com `role = 'admin'`; outras → `403 admin_only`. O primeiro administrador é criado à mão no D1
([deploy.md §7](../guides/deploy.md#7-contas-e-ongs-040)); os demais recebem e perdem o papel pelo painel
([papéis](#papéis-impl-0021)).

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /admin/applications[?status=…]` | — | `{applications: [{id, name, city, status, revision, lotId, createdAt, updatedAt}]}` (até 200, mais recentes primeiro) |
| `GET /admin/applications/:id` | — | `{application, applicant: {nickname, deletionPending} \| null, history: [{at, action, detail, actor}], files}` |
| `POST /admin/applications/:id/decision` | `{action, revision, note?, checks?}` | `{application}` |

`status` filtra pelos cinco estados anteriores ou `withdrawn`, projetado junto com a revisão no mesmo snapshot.
Sem filtro, lista candidaturas e retiradas, incluindo ONGs retiradas sem solicitante. ONGs publicadas sem
candidatura e sem retirada continuam excluídas. `?status=published` não inclui retiradas.
`:id` é o UUID da candidatura. Quem enviou aparece só pelo nickname (`null` se a conta foi excluída); `actor` no
histórico é o nickname do admin.

| `action` | De | Para (candidatura / terreno) | `note` |
|---|---|---|---|
| `start_review` | `submitted` | `under_review` / `under_review` | opcional |
| `approve` | `submitted`, `under_review` | `published` / `published` | opcional |
| `request_changes` | `submitted`, `under_review` | `changes_requested` / `application_sent` | obrigatória, ≥ 10 caracteres |
| `reject` | `submitted`, `under_review`, `changes_requested` | `rejected` / `available` | obrigatória, ≥ 10 caracteres |

Com `applicant.deletionPending: true`, o painel mostra o aviso de exclusão pendente, bloqueia iniciar análise,
aprovar e pedir ajustes; essas ações válidas retornam `409 account_deleting`, inclusive se a intenção vencer
uma corrida com a decisão. **Rejeitar continua permitido nos estados da tabela**, com justificativa, revisão/estado
exatos, proibição de autoanálise e auditoria somente da decisão vencedora. Libera o terreno, mantém a intenção
de exclusão e não apaga fotos automaticamente. Se o estado mudar com a tela aberta, o painel relê o detalhe ao
receber `account_deleting`. ONG já publicada continua fora da transição de rejeição; tirá-la da Vila é a
[retirada administrativa](#retirada-administrativa-de-ong-publicada-impl-0020-proposta) (PROPOSTA, desligada).

- `note` (até 1000 caracteres) é a mensagem à organização; fica em `ngos.review_note` e aparece para quem enviou.
- `revision` (obrigatório, inteiro) é a versão que o admin está vendo. `start_review` não a confere: inicia a
  análise da versão atual, qualquer que seja, e trava os arquivos. Nas outras ações, se a organização reenviou ou
  mudou um arquivo ([§ Arquivos da candidatura](#arquivos-da-candidatura-impl-0017)) enquanto a tela estava aberta, a decisão é recusada (`409 stale_revision`, nada é gravado) em vez de valer para um conteúdo que
  ninguém analisou.
- `approve` exige `checks: {activeCnpj, oneYear, fundsConfirmable}`, os três `true` (as verificações do DEC-015);
  senão `400 checks_required`.
- Ação desconhecida → `400 bad_action`; sem `revision` → `400 revision_required`; mensagem faltando → `400
  note_required` (com `fields.note`); transição fora da tabela ou corrida com outra decisão → `409 bad_transition`
  (só uma de duas decisões simultâneas vale, com uma linha de auditoria); candidatura inexistente → `404 not_found`.
- Cada decisão grava `audit_events` `ngo.<action>` com o id do admin e `detail`
  `{from, to, lot, revision, hasNote}` (na aprovação, também `checks`) — sem e-mail e sem o texto da mensagem.
- A aprovação publica a casa: `/lots` traz nome e resumo e `/ngos/:id` disponibiliza descrição, causas e projetos,
  sem cidade ou contato. O jogo desenha o chalé gerado pela semente do terreno ([IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md)).

A tela dessas rotas é a seção "Candidaturas" do painel administrativo (`apps/dash`); o jogo não as chama mais.

### Retirada administrativa de ONG publicada (IMPL-0020, PROPOSTA)

**PROPOSTA, desligada em produção e homologação** (`NGO_WITHDRAWAL_ENABLED = "false"`). A política da retirada
(efeito sobre a conta e o CNPJ, retorno da organização, retenção, liberação do terreno) é PENDENTE:
[OQ-14](../decisions/open-questions.md). Contrato técnico em
[IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md); nada aqui autoriza a ativação.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /admin/ngos/:id/withdraw` | `{accountId, revision, reason}` | `200 {application}` com `status: "withdrawn"`, nova `revision` e `withdrawal: {reason, at}` |

Exige `ACCOUNTS_ENABLED = "true"`, `NGO_WITHDRAWAL_ENABLED = "true"` (senão `404 not_found`), `Origin` permitida
e sessão de administrador. `accountId` é a conta que a página acredita estar logada; `revision` é a versão em
tela (inteiro positivo).

**`reason` é a mensagem para a organização**, não uma anotação interna: de 10 a 1000 caracteres (pontos de código
Unicode, depois de aparar espaços, sem NUL), entregue **como foi escrita** ao responsável em
`GET /ngo/application` (`withdrawal.reason`) e mostrada no detalhe administrativo. Não aparece na lista, na
auditoria nem em resposta pública. Não há envio de e-mail.

O que acontece, em uma transação D1 (registro, revisão, terrenos e auditoria; só o pedido vencedor escreve):

- a ONG ganha um registro em `ngo_withdrawals`; a linha em `ngos` **conserva `status = 'published'`** e as
  respostas privadas passam a mostrar o estado efetivo `withdrawn`;
- todo terreno **realmente associado** à ONG volta a `available` com `ngo_id = null` (mesmo quando
  `requested_lot_id` é outro ou nulo); terreno de outra ONG não é tocado; outra organização pode pedi-lo;
- `audit_events` recebe uma linha `ngo.withdraw` com `{from, to, revision, lots, hasReason}`, sem o texto.

Leituras públicas: na próxima leitura, `/lots`, `/indicators`, `/ngos/:id`, o logo e as fotos (lista e bytes,
`GET`/`HEAD`, inclusive com `If-None-Match`) deixam de mostrar a ONG, porque todas exigem o terreno publicado.
Nenhuma rota pública lê `ngo_withdrawals`: elas respondem igual nos schemas v3 a v9, com a bandeira ligada ou
desligada. Desligar a bandeira não republica nada. Conteúdo já baixado e uma cena já aberta no jogo não são
revogados (o jogo lê os terrenos ao abrir).

Depois da retirada:

| Quem | Pode | Não pode |
|---|---|---|
| Responsável | ler a candidatura, os arquivos e as fotos; **remover** os próprios arquivos (`DELETE /ngo/application/files/:id`) e fotos (`DELETE /ngo/photos/:id`); excluir a conta | enviar ou trocar logo, documento ou foto, reenviar a candidatura ou enviar outra (`409 application_withdrawn`) |
| Admin | ler tudo como antes; remover foto (`remove`) | aprovar ou rejeitar foto (`409 application_withdrawn`); qualquer decisão sobre a candidatura (`409 bad_transition`); desfazer a retirada (não há rota) |

**O que o código faz hoje (a ratificar ou mudar na OQ-14):** a conta do responsável não consegue enviar outra
candidatura, nem para outra organização; o CNPJ continua em uso (`409 cnpj_in_use` para qualquer conta); não há
restauração; a candidatura, o registro (com a mensagem), os arquivos e as fotos ficam guardados sem prazo.
Missões, XP e eventos de progresso não mudam (OQ-09 trata a missão cujo alvo sai da Vila).

| Erro | Significado |
|---|---|
| `404 not_found` | bandeira desligada, id inválido ou ONG inexistente |
| `400 revision_required` | `revision` ausente ou não é inteiro positivo |
| `400 reason_required` (+ `fields.reason`) | mensagem para a organização ausente, curta ou longa demais |
| `409 account_changed` | `accountId` diferente da sessão |
| `403 self_review` | o admin é o responsável pela ONG |
| `409 application_withdrawn` | a ONG já foi retirada (inclusive por um pedido concorrente) |
| `409 account_deleting` | exclusão da conta do responsável pendente: repetir depois que ela terminar |
| `409 stale_revision` | a versão em tela não é mais a atual |
| `409 bad_transition` | a ONG não está publicada |
| `503 schema_outdated` | banco sem a migration 0009 |

Schema: as rotas de candidatura (`/ngo/application`, arquivos e fotos da candidatura) e de análise
(`/admin/applications*`, decisões, retirada) leem `ngo_withdrawals` **mesmo com a bandeira desligada**. Num banco
sem a migration 0009 respondem `503 schema_outdated` antes de gravar qualquer coisa; sessão, progresso e exclusão
de conta continuam funcionando. Com as contas ligadas, a migration vem antes da API
([deploy §3](../guides/deploy.md#3-aplicar-migrations-remotas)). Provas locais em
[development.md](../guides/development.md#retirada-de-ong-publicada-local-impl-0020-proposta).

### Doações e conciliação com AbacatePay (IMPL-0023, PROPOSTA)

**PROPOSTA**, atrás de `DONATIONS_ENABLED` (`"false"` em produção e staging; `"true"` no script local `dev`).
Depende da migration 0011 e, nas rotas administrativas, de `ACCOUNTS_ENABLED`. A política — contrato da parceira,
provedor e Título — segue PENDENTE (PEN-004, PEN-006, PEN-026): o código não decide tarifas, repasses nem a regra
do Título para links externos. Nenhuma doação é concluída sem confirmação do provedor (ou de um comprovante
conferido por admin, no caso do link próprio).

Rotas (valores sempre em **centavos** inteiros; mínimo R$ 2,00, máximo R$ 50.000,00 por Pix):

| Método e rota | Quem | Resposta |
|---|---|---|
| `GET /donations/config` | público | `{global: {enabled, recipientName, ngoPercentBps, fixedFeeCents, minAmountCents}}`; nunca CNPJ nem subconta |
| `GET /ngos/:id/donation-info` | público | ONG publicada em terreno publicado: `{ngoId, name, method, enabled, ngoPercentBps, fixedFeeCents, minAmountCents, confirmedDonations, confirmedAmountCents}`; sem URL, subconta ou CNPJ |
| `POST /donations/pix` | visitante ou conta | `{targetKind: "global" \| "ngo", ngoId?, amountCents}` → `201 {donation}`, com `brCode`, `brCodeBase64`, `expiresAt`, `devMode` |
| `GET /donations/:id[?refresh=1]` | público | `{donation}`; com `refresh=1` e status `pending`, consulta o provedor e concilia antes de responder |
| `POST /donations/:id/simulate` | sandbox | só fora de produção e com cobrança `devMode`: simula o pagamento e concilia |
| `POST /donations/redirect` | visitante ou conta | `{ngoId}` de ONG com link próprio conferido → `{url, tracked: true, titleCredit: "none"}`; registra o clique, não a doação |
| `POST /webhooks/abacatepay` | AbacatePay | eventos `transparent.completed`, `transparent.refunded`, `transparent.disputed`, `transparent.lost` |
| `GET /donations/my-title` | conta | `{title: {eligibleCents, confirmedCount, tier, tierLabel, nextTierCents}, donations}` |
| `GET /admin/donations/overview` | admin | `{settings, ngos, recentDonations, recentRedirects}` |
| `POST /admin/donations/settings` | admin | `{accountId, primaryNgoName, primaryNgoCnpj, ngoPercentBps, fixedFeeCents, subAccountId?}` → `{settings}` |
| `POST /admin/ngos/:id/payment-config` | admin | `{accountId, paymentMethod, donationUrl?, linkValidated?, ngoPercentBps, fixedFeeCents, subAccountId?}` → `{payment}` |
| `POST /admin/donations/external-proof` | admin | `{accountId, ngoId, amountCents, proofReference, note?}` → `201 {donation}` |

Regras:

- **Split**: `ngoShare = floor(amount × ngoPercentBps / 10000) − fixedFeeCents`; o resto (incluindo a taxa fixa)
  fica com a Vila. Padrões: 95,00% e R$ 0,80. A configuração é recusada se, na doação mínima, a ONG receberia
  menos de 1 centavo ou a Vila menos que a taxa base de R$ 0,80 — o mesmo limite que o split da AbacatePay exige
  (`soma(splits) ≤ valor − platformFee`). Tudo é inteiro em centavos; não há arredondamento em tela.
- **Doação global**: uma única instituição parceira (DEC-010..013), na subconta dela. Nunca é dividida entre as
  ONGs da Vila. Sem instituição configurada, a rota responde `409 global_donation_not_configured`.
- **Doação da ONG**: subconta da própria ONG (criada/localizada pelo CNPJ) ou link próprio HTTPS da organização.
  O link só fica ativo depois de a administração abri-lo e marcar `linkValidated`; a URL é validada (HTTPS, host
  público, sem credenciais, `javascript:`/`data:` recusados). Redirecionar não conta doação nem Título.
- **Título (P15, DEC-041; PROPOSTA)**: cada doação Pix `paid` de uma conta credita **uma vez**
  (`title_credited = 1`); a soma é lida de `donations`, não de um contador, então repetir webhook não duplica.
  Estorno ou disputa perdida desfazem o crédito. Doação não concede XP (DEC-042). Comprovante externo entra nos
  indicadores com `title_credited = 0`: a regra do Título para link externo segue PENDENTE (PEN-026).
- **Webhook**: exige `X-Webhook-Secret` (ou `?webhookSecret=`) igual a `ABACATEPAY_WEBHOOK_SECRET` **e**
  `X-Webhook-Signature` = base64(HMAC-SHA256(corpo bruto, chave pública da AbacatePay)), comparados em tempo
  constante. O corpo é lido como bytes, nunca re-serializado. O id do evento (`log_…`) entra em
  `abacatepay_webhook_events`: repetição responde `{ok: true, duplicate: true}` e não altera nada. A atualização
  da doação só vale enquanto o id ainda não foi gravado, e a gravação vem em seguida na mesma transação; nenhum
  horário entra na decisão, e o mesmo evento entregue duas vezes ao mesmo tempo é aplicado uma vez. Um evento novo
  responde `{ok: true, applied}`, com `applied: false` quando o status atual da doação não admite a mudança.
  Estorno (`transparent.refunded`, `transparent.lost`) é final e vale a partir de qualquer status anterior, mesmo
  quando chega antes de `transparent.completed`; nenhum evento posterior reabre uma doação estornada.
- **Sandbox**: com `ABACATEPAY_API_KEY` de sandbox (`abc_dev_…`) e sem subcontas habilitadas na conta, a
  configuração usa o marcador local `dev_sacc_<cnpj>` e a cobrança sai sem `splits`; o split completo continua
  gravado no D1. Em produção a mesma recusa vira `409 subaccounts_unavailable`, e o admin pode informar um
  `sacc_…` existente.
- **Privacidade**: CNPJ, subconta e URL do link próprio nunca aparecem em rota pública; a auditoria
  (`donation.settings_update`, `ngo.payment_config`, `donation.external_proof`) guarda ids, método, percentual e
  valores, nunca CNPJ, URL ou referência do comprovante. Nenhuma chave, segredo ou dado do pagador é registrado.
- **Schema**: com a bandeira ligada e o banco sem a migration 0011, as rotas de doação respondem
  `503 schema_outdated` (inclusive o webhook); com a bandeira desligada nenhuma rota pública lê as tabelas novas
  e `/indicators` continua `null` (teste cobre v3 a v12).

### Listas do painel administrativo (IMPL-0015)

Só leitura, só `role = 'admin'` (`401 not_signed_in` sem sessão, `403 admin_only` sem o papel), `Cache-Control:
no-store`. Mais recentes primeiro. Consultar não grava `audit_events` (só mutações são auditadas).

| Método e rota | Resposta |
|---|---|
| `GET /admin/audit[?before=<ISO>&limit=<1..100>]` | `{events: [{at, action, subject, detail, actor}], next}` |
| `GET /admin/users[?before=<ISO>&limit=<1..100>]` | `{users: [{id, nickname, role, city, createdAt, verified, blocked}], next}` |

- `limit`: inteiro de 1 a 100 (padrão 50); fora disso → `400 bad_limit`.
- `before`: instante UTC em ISO 8601 terminado em `Z`, com ou sem milissegundos (`2026-11-11T12:00:00.000Z`); só
  vêm linhas **estritamente anteriores**. Outro formato → `400 bad_before`.
- `next`: o `before` da página seguinte, ou `null` na última. Linhas com o mesmo instante da última linha da página
  vêm todas juntas, então a página pode passar um pouco de `limit` (sem isso, a página seguinte as pularia).
- `events`: `actor` é o **nickname** de quem agiu (`null` se a conta foi excluída), nunca id ou e-mail; `subject` é
  `ngo:<id>` ou `user:<id>`; `detail` é o texto JSON gravado (sem dados pessoais) ou `null`. Ações e detalhes em
  [storage.md](storage.md#audit_events).
- `users`: **sem e-mail e sem nome** (só o nickname é público; o painel guarda o mínimo — LGPD, ECA Digital).
  `verified` diz se a conta já confirmou um link; cadastros não confirmados aparecem com `false` até expirarem.
  `blocked` diz se há um bloqueio em vigor; a mensagem do bloqueio nunca aparece aqui.
- Papel e bloqueio mudam só pelas rotas de [papéis](#papéis-impl-0021) e de
  [bloqueio de conta](#bloqueio-de-conta-impl-0021-proposta). Não existe rota que altere os dados ou apague a
  conta de terceiros. Quais sanções existem e quem as aplica continua PENDENTE (OQ-11, DEC-037).
- No painel, essas ações ficam na seção "Usuários" e a remoção de logo, no detalhe da candidatura
  ([architecture §11](architecture.md#11-painel-administrativo-appsdashsrc)).

### Papéis (IMPL-0021)

Dois papéis ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)): **Padrão** (`player` no banco e
na API) e **Administrador** (`admin`). Sem bandeira própria: vale com as contas ligadas. O primeiro administrador
continua sendo criado pelo comando documentado no banco ([deploy §7.4](../guides/deploy.md#74-conceder-o-papel-de-administrador)).

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /admin/users/:id/role` | `{accountId, role}` (`role`: `"player"` ou `"admin"`) | `200 {user}` |

`user` tem o formato de uma linha de `GET /admin/users`: `{id, nickname, role, city, createdAt, verified, blocked}`
(sem e-mail, sem nome). `accountId` é o id do administrador que a página acredita estar conectado.

- **Idempotente:** pedir o papel que a conta já tem responde `200` com a conta e **não** grava auditoria.
- **Um batch, um vencedor:** a mudança só é gravada se a conta-alvo ainda está no estado lido e se quem pede
  **ainda é administrador** no momento da gravação; só a requisição vencedora grava a auditoria
  `user.role_change` (assunto `user:<id>`, detalhe `{"from","to"}`).
- **Sempre resta um administrador:** ninguém muda o próprio papel, e quem rebaixa precisa ser administrador
  quando o batch confirma. Se os dois últimos administradores se rebaixam ao mesmo tempo, exatamente um vence; o
  outro recebe `409 last_admin`.
- **O rebaixamento não revoga mais nada:** a sessão continua; a próxima requisição administrativa dessa conta
  responde `403 admin_only`.

| Erro | Quando |
|---|---|
| `401 not_signed_in`, `403 admin_only`, `409 account_changed` | sessão, papel e conta em uso, como nas outras rotas de admin |
| `400 bad_role` | `role` diferente de `"player"` e `"admin"` |
| `403 self_role` | `:id` é a própria conta de quem pede (qualquer `role`) |
| `404 not_found` | conta inexistente (inclusive excluída durante o pedido) |
| `409 account_blocked` | promover uma conta bloqueada (desbloquear antes) |
| `409 last_admin` | rebaixar quem, naquele instante, é o único administrador (só acontece em disputa) |
| `403 admin_only` | quem pediu deixou de ser administrador entre a conferência da sessão e a gravação |
| `503 schema_outdated` | banco sem a migration 0010 |

### Bloqueio de conta (IMPL-0021, PROPOSTA)

**PROPOSTA, desligada em produção e homologação** (`ACCOUNT_BLOCK_ENABLED = "false"`). A política (quais sanções
existem, quem aplica, duração, recurso, aviso) é PENDENTE: [OQ-11](../decisions/open-questions.md). O código entrega
só o mecanismo; nada aqui autoriza a ativação.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /admin/users/:id/block` | `{accountId, message}` | `200 {user}` com `blocked: true` |
| `POST /admin/users/:id/unblock` | `{accountId}` | `200 {user}` com `blocked: false` |

`message` é a **mensagem para a pessoa bloqueada**: 10 a 1000 caracteres, contados como no SQLite (pontos de
código) **depois de tirar o que ninguém vê** e de aparar espaços. Caracteres de formatação e de controle
(categorias Unicode Cf e Cc: espaço de largura zero, inversão de direção do texto, hífen opcional, retorno de
carro…) são removidos antes da contagem e não são guardados; quebra de linha e tabulação dentro do texto ficam.
Dez caracteres invisíveis, portanto, não são uma mensagem (`400 message_required`), e uma inversão de direção não
chega à pessoa. Ela lê o texto guardado, em `GET /me` (`user.blocked.message`). Não é uma anotação interna, e não
existe uma. A resposta, a lista de contas e a auditoria nunca trazem o texto. A regra é uma só
(`cleanBlockMessage`, `packages/shared/src/accounts/moderation.ts`), na API e no painel.

**O que o bloqueio faz, no servidor:**

- **Todas as sessões da conta terminam** no mesmo batch do bloqueio.
- **O link de acesso continua funcionando, com as mesmas respostas de qualquer e-mail** (sem enumeração). Ele abre
  uma **sessão restrita**: `GET /me` (com `blocked: {message, at}`), `POST /auth/logout` e `DELETE /me` funcionam;
  toda outra rota com sessão responde `403 session_blocked` (progresso, correção de dados, candidatura, arquivos,
  fotos, rotas de admin). É assim que a pessoa lê o motivo: depois de provar que o e-mail é dela.
- **Escritas em andamento são recusadas no SQL:** candidatura ou reenvio, correção de dados (`POST /me`),
  gravação de progresso (inclusive a criação do contador de gravações da conta), a confirmação de um envio de
  logo, documento ou foto e a remoção de um arquivo ou de uma foto pelo responsável conferem o bloqueio dentro do
  próprio comando ou batch, e respondem `403 session_blocked` (o envio de arquivo responde
  `409 application_changed` e o de foto, `409 photo_limit_or_owner_changed`). O que estava a caminho quando o
  bloqueio foi gravado não é guardado nem apagado. As únicas escritas que não conferem o bloqueio são as que só
  concluem limpezas já registradas de bytes fora de uso (envio abandonado, foto já removida) e o registro
  provisório de um envio, descartado quando a confirmação é recusada.
- **A exclusão da conta nunca é tirada:** `DELETE /me` funciona na sessão restrita. A exclusão apaga a conta e o
  registro do bloqueio (com a mensagem); a auditoria guarda só os ids. **Nada guarda o e-mail depois da
  exclusão**: ele pode ser cadastrado de novo. O bloqueio é da conta, não da pessoa (pergunta na OQ-11).
- **Cadastro com o mesmo e-mail:** enquanto a conta existe, `POST /auth/register` com o e-mail dela não cria nada
  (responde `202` e envia o link da conta existente, como sempre). Um cadastro bloqueado que nunca confirmou o link
  **não** expira em 24 horas.
- **Administrador não é bloqueado:** `409 admin_account`; rebaixar antes. Conta bloqueada não é promovida.

**Bandeira:** `ACCOUNT_BLOCK_ENABLED` controla só **novos** bloqueios (`POST …/block` → `404 not_found` com ela
desligada). Um bloqueio já gravado continua valendo com a bandeira desligada, e `POST …/unblock` funciona sempre
(com as contas ligadas). Depois do desbloqueio, a sessão que a pessoa abriu pelo próprio link volta a valer por
inteiro.

Um batch por mudança, com as mesmas duas conferências dos papéis (estado lido da conta-alvo; quem pede ainda é
administrador). Auditoria: `user.block` e `user.unblock`, assunto `user:<id>`, detalhe `{"block":"<id do
registro>"}`, sem o texto.

| Erro | Quando |
|---|---|
| `404 not_found` | bloqueio com a bandeira desligada; conta inexistente (inclusive excluída durante o pedido) |
| `401 not_signed_in`, `403 admin_only`, `409 account_changed` | sessão, papel e conta em uso |
| `400 message_required` (+ `fields.message`) | bloqueio sem a mensagem para a pessoa (10 a 1000 caracteres visíveis; caracteres de formatação e de controle não contam) |
| `403 self_block` | bloquear a própria conta |
| `409 admin_account` | a conta-alvo é de um administrador (inclusive promovida durante o pedido) |
| `409 bad_transition` | bloquear conta já bloqueada; desbloquear conta que não está bloqueada (inclusive por pedido concorrente) |
| `403 session_blocked` | qualquer rota com sessão, fora as três acima, chamada por uma conta bloqueada (inclusive bloqueada enquanto o pedido estava a caminho) |
| `503 schema_outdated` | banco sem a migration 0010 |

### Remover um visitante de uma sala (IMPL-0021, PROPOSTA)

**PROPOSTA, desligada em produção e homologação** (`PRESENCE_MODERATION_ENABLED = "false"`, na API e no servidor
de tempo real). A presença continua anônima ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)):
um id numérico por conexão, sem conta e sem nome. O servidor de tempo real nunca fica sabendo quem é ninguém, nem
o administrador. Esta seção descreve a metade da API; a mensagem `["m", …]`, o código de fechamento `4003` e o
binding de serviço estão na parte do servidor de tempo real.

| Método e rota | Quem chama | Corpo | Resposta |
|---|---|---|---|
| `POST /admin/moderation/ticket` | o jogo, com a sessão de um administrador | `{accountId, room, target}` | `200 {ticket, expiresAt}` |
| `POST /moderation/consume` | o servidor de tempo real, por binding de serviço | `{ticket, room, target}` | `200 {"ok": true}` ou `4xx {error}` |

1. O jogo do administrador pede um **bilhete** de uso único. `room` é um inteiro de `0` a `7` (`MAX_ROOMS`);
   `target` é o id da conexão do visitante (inteiro seguro positivo). `ticket` tem 32 caracteres de
   `[A-Za-z0-9_-]` (192 bits aleatórios), é guardado como SHA-256, vale **30 segundos** (`expiresAt`, instante
   ISO) e fica preso àquele administrador, àquela sala e àquele alvo. No máximo **10 bilhetes por administrador
   por minuto** (contagem e inserção num único comando; acima disso `429 too_many_requests`). Pedir o bilhete não
   grava auditoria: nada aconteceu ainda.
2. O jogo envia `["m", target, ticket]` na conexão aberta com a sala (cabe em `MAX_MESSAGE_BYTES`).
3. A sala devolve o bilhete à API em `POST /moderation/consume`. A API marca o bilhete como usado e grava a
   auditoria **no mesmo batch, só para a requisição vencedora**, e só se o bilhete não foi usado, não expirou,
   confere com `room` e `target`, e o administrador que o pediu **ainda é administrador e não está bloqueado**.
   Auditoria: `presence.remove`, assunto `room:<n>`, detalhe `{"target": <id da conexão>}` (um id de conexão não é
   dado pessoal; nem o bilhete nem o endereço de quem chamou são gravados). **Ela registra que a remoção foi
   autorizada, não que uma conexão foi fechada**: se o alvo sair durante a chamada, o bilhete foi consumido e a
   auditoria gravada, mas a sala responde ao administrador que não removeu.
4. Só com `200` e o corpo **exatamente** `{"ok":true}` a sala fecha a conexão do alvo (ela compara o corpo; um
   campo a mais valeria como recusa). É uma cortesia, não um banimento: um visitante anônimo pode
   voltar. Bloquear contas é a [seção anterior](#bloqueio-de-conta-impl-0021-proposta).

**`POST /moderation/consume` não é rota de navegador.** Não usa sessão nem `Origin`; o bilhete é a credencial. A
sala a chama pelo binding de serviço como `POST https://api.internal/moderation/consume`, com
`Content-Type: application/json`, **sem `Origin`** e sem endereço de cliente; a rota responde em qualquer nome de
host e não passa pela conferência de origem das rotas de conta.
Não envia nenhum cabeçalho CORS, e exige `Content-Type: application/json` (corpo de até 1 000 bytes), então uma
página não consegue chamá-la nem ler a resposta. É limitada pelo binding `MODERATION_LIMITER` (60 requisições a
cada 60 s), de duas formas. **Com endereço** (`CF-Connecting-IP`, quem chama pelo domínio público): a chave é o
endereço e o limite é cobrado **antes** de olhar o bilhete, seja qual for o corpo. **Pelo binding de serviço**, que
não tem endereço: a chave é a **sala** (`room:<n>`), para que uma sala movimentada não gaste o limite das outras, e
o limite só é cobrado de um bilhete **que foi emitido** (uma leitura pela chave primária do SHA-256, que não grava
nada). Um bilhete que ninguém emitiu, ou um corpo malformado, recebe o mesmo `404` sem gastar o limite da sala: a
sala repassa qualquer `["m", …]` bem formado de qualquer conexão, e sem isso visitantes anônimos esgotariam o
limite e o bilhete verdadeiro do administrador seria recusado com `429`. Um bilhete emitido repetido em excesso
(sala ou alvo errado, já usado, expirado) continua limitado. Sem o binding de limite (homologação, testes) nada é
limitado e nada falha; a sala tem os próprios limites por conexão (um `["m", …]` por segundo, dez por minuto).
Tudo o que não
é um bilhete válido e não usado para aquela sala e aquele alvo recebe a mesma resposta `404 not_found` — inclusive
bilhete, sala ou alvo malformados, e a rota com a bandeira ou as contas desligadas. Uma tentativa com sala ou alvo
errado não gasta o bilhete.

| Erro | Rota | Quando |
|---|---|---|
| `404 not_found` | bilhete | `PRESENCE_MODERATION_ENABLED` desligada |
| `401 not_signed_in`, `403 admin_only`, `409 account_changed`, `403 forbidden_origin` | bilhete | sessão, papel, conta em uso e origem, como nas outras rotas de admin |
| `400 bad_room`, `400 bad_target` | bilhete | sala fora de `0…7` ou alvo que não é inteiro seguro positivo |
| `429 too_many_requests` | bilhete | décimo primeiro bilhete do mesmo administrador em 60 s |
| `404 not_found` | consumo | bilhete desconhecido, usado, expirado, de outra sala ou alvo; administrador rebaixado, bloqueado ou excluído; bandeira ou contas desligadas |
| `405 method_not_allowed` (`Allow: POST`) | consumo | método diferente de `POST` (`OPTIONS` responde `204` sem CORS) |
| `415 json_required`, `413 too_large`, `400 bad_json` | consumo | corpo que não é um objeto JSON pequeno |
| `429 too_many_requests` | consumo | limite do `MODERATION_LIMITER`: por endereço (domínio público), ou por sala para um bilhete emitido (binding) |
| `503 db_unavailable`, `503 schema_outdated` | as duas | sem binding D1; banco sem a migration 0010 |

### Remoção de logo por administrador (IMPL-0021)

O logo de uma ONG publicada é público, então a administração precisa poder tirá-lo do ar. Sem bandeira própria:
vale com as contas ligadas e o bucket `FILES` ligado ao Worker (não depende de `NGO_FILES_ENABLED`).

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /admin/ngos/:id/logo/remove` | `{accountId, revision}` | `200 {application}` com a nova `revision` |

Vale em **qualquer estado** da candidatura, inclusive ONG retirada. Mesmas guardas da remoção feita pelo
responsável: `revision` é a versão em tela; a remoção sobe a `revision` (uma análise aberta na versão anterior
fica `409 stale_revision`), apaga a linha em `ngo_files` e o objeto no R2, tudo reivindicado pelo token da
operação num único batch, e só a requisição vencedora grava a auditoria `ngo.logo_remove` (assunto `ngo:<id>`,
detalhe `{"file","revision"}`). Em seguida `/lots` devolve `ngo_logo: null` e `GET /ngos/:id/logo` responde `404`.
A remoção não conta no limite diário de alterações de arquivos da candidatura.

Como nas rotas de papel e de bloqueio, a remoção só é gravada se quem pede **ainda é administrador** (e não está
bloqueado) quando o batch confirma. Vale também **depois que o responsável excluiu a conta**: a ONG publicada
continua na Vila com o logo, sem responsável (`applicant_id` e `ngo_files.uploaded_by` nulos), e a administração
ainda consegue tirá-lo do ar; a pendência de limpeza do objeto (`media_upload_intents`) fica então em nome do
administrador que removeu.

| Erro | Quando |
|---|---|
| `401 not_signed_in`, `403 admin_only`, `409 account_changed` | sessão, papel e conta em uso |
| `403 admin_only` (ou `401 not_signed_in`, conta excluída) | quem pediu deixou de ser administrador entre a conferência da sessão e a gravação; nada é removido |
| `404 not_found` | id que não é UUID, ONG inexistente ou sem logo |
| `400 revision_required` | sem `revision` inteiro ≥ 1 |
| `503 files_unavailable` | sem o binding `FILES` |
| `403 self_review` | o administrador é o responsável pela organização |
| `409 account_deleting` | exclusão da conta do responsável pendente |
| `409 stale_revision` | a versão em tela não é mais a atual (inclusive por remoção concorrente) |
| `503 file_cleanup_pending` | a linha já saiu, mas o R2 não apagou o objeto: repetir `POST /admin/applications/:id/files/recover` |
| `503 schema_outdated` | banco sem a migration 0009 ou 0010 |

## Servidor de tempo real (`server.vilanoeldobem.com.br`)

Só `GET`; outros métodos → `405`. Respostas HTTP com `Cache-Control: no-store`.

### GET /health

```json
{ "ok": true, "service": "server", "rooms": true }
```

`rooms` diz se o binding `ROOMS` (Durable Object `VillageRoom`) existe.

### GET /room?i=N (WebSocket)

Presença em tempo real numa praça ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)).
URL do cliente: `wss://server.vilanoeldobem.com.br/room?i=N`. Exige `Upgrade: websocket` e `Origin` exatamente numa
origem de `ALLOWED_ORIGINS` (`apps/server/wrangler.jsonc`: `https://play.vilanoeldobem.com.br`), o que bloqueia
sequestro de WebSocket por outros sites.
`N` = sala `0`…`7` (`MAX_ROOMS`); cada sala comporta 40 visitantes (`ROOM_CAPACITY`). Sem nome, conta, chat ou
texto livre: só um id numérico anônimo por conexão e a pose do avatar. Nada é gravado.

| Direção | Mensagem | Significado |
|---|---|---|
| cliente → sala | `["p", x, z, yaw, speed]` | pose, no máximo 10 Hz e só quando muda |
| cliente → sala | `["a"]` | a pessoa clicou, tocou ou digitou sem que uma pose ou visual tenha saído nos últimos 20 s (`ACTIVE_MS`); conta como atividade ([IMPL-0014](../decisions/0014-realtime-idle-timeout.md)) |
| cliente → sala | `"ping"` | mantém a conexão; resposta `"pong"` sem acordar a sala; **não** conta como atividade |
| cliente → sala | `["m", alvo, tíquete]` | **PROPOSTA** (IMPL-0021): um administrador pede que a sala remova a conexão `alvo`; veja [Remoção por administrador](#remoção-por-administrador-proposta) |
| sala → cliente | `["w", id, sala]` | boas-vindas com o id anônimo |
| sala → cliente | `["s", tickMs, [[id, x, z, yaw, speed, idadeMs], …]]` | poses que mudaram (10 Hz); na entrada, a lista toda |
| sala → cliente | `["l", id]` | alguém saiu |
| sala → cliente | `["m", alvo, 1]` ou `["m", alvo, 0]` | **PROPOSTA** (IMPL-0021): resposta só para quem pediu a remoção; `1` = a sala fechou `alvo` com `4003`, `0` = ninguém foi fechado |
| cliente → sala | `["k", chapéu, cachecol, suéter, cores]` | visual do avatar (ids do catálogo, IMPL-0010); a sala só aceita ids existentes no encaixe certo |
| sala → cliente | `["k", id, [chapéu, cachecol, suéter, cores]]` | visual de alguém (ao mudar; na entrada, todos os não padrão) |

A sala corrige a pose recebida: dentro do mundo, velocidade até a máxima do avatar, sem teletransporte (o passo é
limitado ao que daria para andar desde a última pose; a primeira pose é livre). Limite de 20 mensagens/s por
conexão (rajada de 40); mais de 200 descartadas → fecha com `1008`. Sala cheia → fecha com `4001` e o cliente tenta
a próxima.

**Inatividade** ([IMPL-0014](../decisions/0014-realtime-idle-timeout.md)): a sala guarda, por conexão, a hora da
última atividade real: pose que move ou gira o avatar, visual (`["k", …]`) ou `["a"]`. `"ping"`, pose repetida,
mensagem inválida ou descartada pelo limite não contam. Conexão sem atividade por mais de `IDLE_TIMEOUT_SECONDS`
(`apps/server/wrangler.jsonc`, padrão `300`; inteiro de `60` a `86400`, qualquer outro valor cai no padrão) é
fechada pela sala com o código **`4002`** e motivo `idle`; os outros recebem `["l", id]` como em qualquer saída.
Quando a última conexão sai ou é fechada, a sala para o timer e hiberna.

| Código de fechamento | Motivo | O que o cliente faz |
|---|---|---|
| `4001` | `full` (sala cheia) | tenta a próxima sala na hora; depois de uma volta completa, espera 30 s |
| `4002` | `idle` (inatividade) | **não** reconecta sozinho: mostra "👥 em pausa" e reconecta no próximo toque, clique ou tecla |
| `4003` | `removed` (removida por um administrador; **PROPOSTA**, IMPL-0021) | mensagem honesta e 60 s sem reconectar sozinho (a espera vale também para quem desliga e religa "Outros visitantes"; recarregar a página reconecta na hora); um cliente que não conhece o código o trata como queda e reconecta |
| `1008` | `rate` (abuso do protocolo) | nova tentativa com espera exponencial (1–30 s) |
| outros (`1006`, queda de rede, deploy) | — | nova tentativa com espera exponencial (1–30 s) |

O cliente também desliga sozinho (fecha com `1000`, motivo `hidden`) quando a aba fica oculta por 2 minutos e
volta do mesmo jeito: no próximo toque, clique ou tecla com a aba visível.

Carga medida (`apps/server/scripts/load.mjs`, `wrangler dev` local, 2026-11-11): 41 robôs → 40 conectados e 1
recusado como cheio; cada visitante recebe ~9,7 mensagens/s e ~10 kB/s; do tick à chegada p95 9 ms (sem rede real).

#### Remoção por administrador (PROPOSTA)

**PROPOSTA** ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)), atrás da bandeira `PRESENCE_MODERATION_ENABLED` do servidor
(`"false"` em produção; a API tem uma bandeira de mesmo nome). Código: `apps/server/src/moderation.ts` e
`removeOnRequest` em `apps/server/src/room-do.ts`.

A presença continua anônima: a sala não sabe quem é ninguém, nem o administrador. O jogo do administrador pede à API
um tíquete de uso único (válido por 30 s, preso àquele administrador, à sala e ao id da conexão) e envia
`["m", alvo, tíquete]` pela conexão que já está aberta. `alvo` é um id de conexão (inteiro positivo seguro) e
`tíquete` tem exatamente 32 caracteres de `[A-Za-z0-9_-]`. A sala só aceita a forma exata escrita por `encodeRemove`
(sem espaços, número em dígitos simples, no máximo 57 bytes); qualquer outra coisa que comece com `["m"` é mensagem
inválida como as demais e conta para o fechamento `1008`.

A sala pergunta à API se o tíquete vale, pelo service binding `API` (de Worker para Worker, sem segredo
compartilhado): `POST /moderation/consume` com `{ticket, room, target}` e limite de 3 s. Só um `200` com corpo
exatamente `{"ok":true}` é sim. Nesse caso a sala fecha o alvo com **`4003`** (motivo `removed`), os outros recebem
`["l", alvo]` uma única vez e quem pediu recebe `["m", alvo, 1]`. Em qualquer outro caso a resposta é
`["m", alvo, 0]` e ninguém é fechado:

- bandeira desligada: a API nem é chamada, e não é abuso (o cliente pode ser mais novo que o servidor);
- o alvo é a própria conexão ou não está nesta sala;
- a sala está em memória há menos de 35 s (explicado abaixo);
- outro pedido da mesma conexão ainda está sendo verificado;
- binding ausente, recusa da API (`404`, `409`, …), erro, corpo diferente do esperado ou demora maior que 3 s;
- o alvo saiu, ou foi fechado por inatividade, enquanto a API era consultada. Aqui o tíquete já foi consumido e o
  registro de auditoria da API existe, embora a sala não tenha removido ninguém.

Se quem pediu sair durante a consulta, a remoção confirmada pela API acontece do mesmo jeito; só a resposta se perde.

Limites por conexão, que valem também com a bandeira desligada: um `["m", …]` por segundo
(`REMOVE_MIN_INTERVAL_MS`) e 10 por minuto (`REMOVE_MAX_PER_MINUTE`), respondidos ou não. Passou disso, a sala fecha
quem pediu com `1008`. `["m", …]` não conta como atividade.

Espera de 35 s (`REMOVAL_WARMUP_MS`): um id nunca se repete enquanto a sala está em memória, mas uma sala que
reinicia (deploy, sala que esvaziou) volta a contar do menor id livre, e um tíquete emitido pouco antes poderia
apontar para outra pessoa com o mesmo id. Por isso a sala só atende pedidos depois de ficar em memória por mais
tempo do que um tíquete vive (30 s). Essa espera não estava no contrato da IMPL-0021; foi acrescentada na
implementação.

A sala não guarda nem registra o tíquete, a resposta da API ou quem pediu: mantém só os horários dos últimos
pedidos de cada conexão, em memória, para aplicar os limites. Nada vai para o storage do Durable Object nem para o
log. Remover não é banir: o visitante é anônimo e pode entrar de novo.

## Erros

Corpo `{"error":"<código>"}`; erros de formulário trazem também `fields` com mensagens em pt-BR.

| Serviço | Status | Código | Quando |
|---|---|---|---|
| ambos | 404 | `not_found` | rota desconhecida; candidatura inexistente na análise |
| API | 405 | `method_not_allowed` | rota pública com método diferente de GET/HEAD/OPTIONS; `/moderation/consume` com método diferente de POST |
| servidor | 405 | `method_not_allowed` | método diferente de GET |
| API | 503 | `db_unavailable` | rota dependente de D1 (incluindo `/lots`, `/ngos/:id` e rotas de conta) sem binding |
| API | 503 | `schema_outdated` | operação de conta depende de colunas da migration 0007, da tabela `ngo_withdrawals` (0009) ou de `users.blocked` / `moderation_tickets` (0010) ausentes; atualizar esquema antes de ativar o fluxo |
| API | 503 | `schema_outdated` | rota de doação depende das tabelas da migration 0011 ausentes; atualizar esquema antes de ativar `DONATIONS_ENABLED` |
| API | 409 | `account_deleting` | exclusão pendente bloqueia candidatura/arquivos, análise/aprovação/ajustes e a retirada; dono pode repetir exclusão, admin pode rejeitar candidatura aberta e liberar terreno |
| API | 503 | `files_unavailable` | exclusão/recuperação exige armazenamento de arquivos, mas o binding `FILES` está ausente |
| API | 503 | `file_cleanup_pending` | remoção/recuperação canônica não concluiu a limpeza; repetir `files/recover`, sem interpretar a retirada do metadado como descarte físico |
| API | 404 | `accounts_disabled` | rota de conta com `ACCOUNTS_ENABLED` desligado |
| API | 403 | `forbidden_origin` | rota de conta com `Origin` ausente ou fora de `ACCOUNT_ORIGINS`; `POST /auth/register` vindo do painel administrativo |
| API | 429 | `too_many_requests` | `/auth/*` acima de 10 requisições/60 s pelo mesmo IP; envio, remoção ou recuperação de arquivo acima de 20/60 s pela mesma conta; mais de 10 bilhetes de moderação por administrador em 60 s; `/moderation/consume` acima de 60/60 s pelo mesmo endereço ou, pelo binding de serviço, pela mesma sala |
| API | 415 | `json_required` | `POST` de conta sem `Content-Type: application/json` |
| API | 413 | `too_large` | corpo acima de 16 000 bytes (32 000 na candidatura) |
| API | 400 | `bad_json` | corpo não é um objeto JSON |
| API | 400 | `invalid` (+ `fields`) | cadastro ou candidatura com campo inválido |
| API | 409 | `nickname_taken` (+ `fields.nickname`) | nickname já usado |
| API | 400 | `invalid_token` | link desconhecido, expirado ou já usado |
| API | 503 | `mail_unavailable` | produção sem `RESEND_API_KEY` ou falha no envio |
| API | 401 | `not_signed_in` | rota que exige sessão, sem sessão válida |
| API | 403 | `admin_only` | rota `/admin/*` sem papel `admin`; mudança de papel, bloqueio, desbloqueio ou remoção de logo pedido por quem deixou de ser administrador antes da gravação |
| API | 403 | `session_blocked` | conta bloqueada (IMPL-0021, PROPOSTA) em qualquer rota com sessão, exceto `GET /me`, `POST /auth/logout` e `DELETE /me`; também a escrita que estava a caminho quando o bloqueio foi gravado |
| API | 400 | `bad_role` | mudança de papel com `role` diferente de `player` e `admin` |
| API | 403 | `self_role` | mudar o próprio papel |
| API | 409 | `last_admin` | rebaixar o único administrador (só em disputa entre os dois últimos) |
| API | 409 | `account_blocked` | promover uma conta bloqueada |
| API | 400 | `message_required` (+ `fields.message`) | bloqueio sem a mensagem para a pessoa (10 a 1000 caracteres visíveis) |
| API | 403 | `self_block` | bloquear a própria conta |
| API | 409 | `admin_account` | bloquear a conta de um administrador |
| API | 400 | `bad_room`, `bad_target` | bilhete de moderação com sala fora de `0…7` ou alvo que não é inteiro seguro positivo |
| API | 403 | `self_review` | decisão, retirada ou remoção de logo sobre a organização do próprio administrador |
| API | 400 | `bad_events` | `/progress/events` vazio, com mais de 50 ou com missão/evento desconhecido |
| API | 409 | `progress_conflict` | três tentativas de gravação perderam a revisão; a fila pode ser reenviada |
| API | 429 | `too_many_events` | novas chaves de evento excederiam o limite de 500 por conta |
| API | 403 | `not_verified` | candidatura de conta não verificada |
| API | 409 | `application_active` | já existe candidatura `submitted`, `under_review` ou `published` |
| API | 409 | `lot_unavailable` (+ `fields.lotId`) | terreno ocupado (inclusive por corrida) |
| API | 409 | `cnpj_in_use` (+ `fields.cnpj`) | CNPJ já usado por outra candidatura |
| API | 400 | `bad_action` | `action` desconhecida na decisão |
| API | 400 | `note_required` (+ `fields.note`) | pedir ajustes ou rejeitar sem mensagem de ≥ 10 caracteres |
| API | 409 | `bad_transition` | decisão fora da tabela de transições; bloquear conta já bloqueada ou desbloquear conta sem bloqueio |
| API | 409 | `account_changed` | escrita com `accountId` (ou `X-Vila-Account`, nos arquivos) diferente da sessão (outra aba trocou de conta) |
| API | 409 | `stale_revision` | decisão sobre versão que já não é a atual |
| API | 400 | `revision_required` | decisão sem `revision` inteiro |
| API | 400 | `checks_required` | aprovação sem as três verificações do DEC-015 |
| API | 404 | `files_disabled` | rota de arquivo com `NGO_FILES_ENABLED` desligado ou sem o bucket |
| API | 400 | `bad_kind` | envio de arquivo com `kind` diferente de `logo` ou `document` |
| API | 415 | `file_type` (+ `fields.file`) | formato não aceito para o tipo de arquivo |
| API | 413 | `file_too_large` (+ `fields.file`) | arquivo acima do limite do tipo |
| API | 400 | `file_mismatch`, `file_invalid`, `file_empty`, `image_too_small`, `image_too_large` (+ `fields.file`) | conteúdo diferente do formato informado, imagem ilegível, arquivo vazio, imagem fora dos limites de pixels |
| API | 409 | `no_application` | envio de arquivo por conta sem candidatura |
| API | 409 | `application_locked` | envio ou remoção de arquivo com a candidatura em análise ou a ONG já publicada |
| API | 409 | `application_withdrawn` | ONG retirada da Vila (IMPL-0020, PROPOSTA): envio de arquivo ou foto, reenvio, nova candidatura da mesma conta, aprovação/rejeição de foto ou segunda retirada |
| API | 400 | `reason_required` (+ `fields.reason`) | retirada sem a mensagem para a organização (10 a 1000 caracteres) |
| API | 409 | `too_many_files` (+ `fields.file`) | sexto documento |
| API | 429 | `too_many_file_changes` (+ `fields.file`) | mais de 60 envios e remoções de arquivo na mesma candidatura em 24 horas |
| API | 409 | `application_changed` | a candidatura mudou enquanto o arquivo era enviado ou removido |
| API | 404 | `not_found` | rota de doação com `DONATIONS_ENABLED` desligado; ONG não publicada; doação inexistente |
| API | 400 | `invalid_donation_amount` | valor fora de R$ 2,00 a R$ 50.000,00 ou que não é inteiro em centavos |
| API | 409 | `global_donation_not_configured` | instituição parceira ou subconta da doação global ainda não configurada |
| API | 409 | `ngo_payment_not_configured` | ONG sem subconta ativa ou com link próprio ainda não conferido |
| API | 503 | `payment_provider_unavailable` | AbacatePay sem chave, fora do ar ou recusando a chamada |
| API | 409 | `subaccounts_unavailable` | em produção, a AbacatePay ainda não habilitou subcontas na conta |
| API | 401 | `invalid_webhook_signature` | webhook com segredo diferente de `ABACATEPAY_WEBHOOK_SECRET` ou assinatura HMAC inválida |
| API | 400 | `invalid` (+ `fields`) | configuração de doação inválida: CNPJ, split, link HTTPS ou referência do comprovante |
| API | 400 | `bad_limit` | `/admin/audit` ou `/admin/users` com `limit` que não é um inteiro de 1 a 100 |
| API | 400 | `bad_before` | `/admin/audit` ou `/admin/users` com `before` que não é um instante ISO terminado em `Z` |
| servidor | 426 | `upgrade_required` | `/room` sem `Upgrade: websocket` |
| servidor | 403 | `forbidden_origin` | `/room` com `Origin` ausente ou fora de `ALLOWED_ORIGINS` |
| servidor | 400 | `bad_room` | `/room` com `i` fora de `0…7` |
| servidor | 503 | `multiplayer_unavailable` | `/room` sem o binding `ROOMS` |
| API | 500 | `internal` | exceção; log `api_error <rota> <tipo>` (nunca corpo, e-mail ou token) |

## Ver também

[architecture.md](architecture.md) · [storage.md](storage.md) · [IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md) ·
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0023](../decisions/0023-donations-abacatepay.md) ·
[IMPL-0015](../decisions/0015-dash-backoffice-app.md)
