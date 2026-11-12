# API HTTP e servidor de tempo real

> **Status:** Implementado (0.4.0; contas desligadas em produção por `ACCOUNTS_ENABLED`) · **Versão do software:** 0.4.0 ·
> **Schema D1:** v7 · **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `apps/api/src/{api,auth,mail,session,progress,ngo,files,ngo-photos,media-storage,public-ngo,admin,backoffice,http}.ts`, `apps/api/src/api.test.ts`,
> `apps/api/src/accounts.test.ts`, `apps/api/src/files.test.ts`, `packages/shared/src/accounts/{validate,files}.ts`, `apps/server/src/handler.ts`,
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
bandeira `ACCOUNTS_ENABLED` ligada ([§ Contas](#contas-impl-0011)).

A migration 0007 é pré-requisito das rotas conciliadas. Nas rotas de conta, uma operação que encontre ausência
das colunas `files_deleting` ou `file_write_token` retorna `503 schema_outdated`, sem repetir a escrita com
guardas enfraquecidos. Isso não é um bloqueio global de autenticação: cadastro, emissão de links e consultas
sem sessão não dependem necessariamente dessas colunas. Aplicar o esquema antes de disponibilizar o fluxo.

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
{ "accounts": false, "quests": false, "files": false }
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

### GET /indicators

Indicadores públicos (P02, DEC-027). `value: null` quando não há fonte verificável; a interface mostra "—" e `note`.
Cache 30 s.

| key | Fonte | Valor na 0.4.0 |
|---|---|---|
| `approved_ngos` | `COUNT(*) FROM ngos WHERE status='published'` | número (ou `null` sem D1) |
| `registered_users` | — | `null` (o código ainda traz a nota "Cadastro ainda não implementado.") |
| `confirmed_donations` | — | `null` (PEN-004, PEN-006) |
| `confirmed_amount` | — | `null` |
| `people_impacted` | — | `null` (exige metodologia) |

```json
{ "updatedAt": "2026-11-08T21:00:00.000Z", "indicators": [ { "key": "approved_ngos", "label": "ONGs aprovadas", "value": 0 } ] }
```

### GET /lots

Terrenos e, só quando a ONG está `published`, nome, resumo e logo dela. `Cache-Control: no-store`. Candidaturas em
andamento mudam o `state` do terreno (`application_sent`, `under_review`), mas nunca expõem dados da organização.

```json
{ "lots": [ { "id": "plaza-01", "street": "plaza", "slot": 1, "x": 20.33, "z": 8.42,
              "state": "available", "ngo_id": null, "ngo_name": null, "ngo_summary": null, "ngo_logo": null } ] }
```

`ngo_id`, `ngo_name`, `ngo_summary` e `ngo_logo` só aparecem para ONG e terreno publicados; nos demais estados são `null`.

`ngo_logo` é o caminho do logo nesta API (`/ngos/<id>/logo?v=<versão>`) quando a ONG publicada tem um; senão
`null`. Com o envio de arquivos desligado é sempre `null` (e a tabela `ngo_files` nem é lida).

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

`user` = `{id, name, nickname, city, email, role, deletionPending}` (`role`: `player` ou `admin`). `deletionPending`
é booleano e informa exclusão iniciada ainda não concluída; clientes toleram a ausência em APIs anteriores. Só a própria pessoa recebe esses
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
com e-mail já cadastrado responde `202` como um cadastro novo (e reenvia o link à conta existente).

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

**Correção (`POST /me`):** `{name, nickname, city}` corrige os dados (direito de correção; também desfaz um cadastro
feito por outra pessoa com este e-mail antes do dono entrar). O e-mail não é editável.

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
  essa fila; não existe atualização instantânea da tela entre dispositivos nem retry por temporizador nesta entrega.
  `GET /progress` recupera o estado persistido pela sessão da conta. Ao sair, o jogo volta ao progresso de visitante (vazio depois da migração):
  num navegador compartilhado a próxima pessoa não herda nada.
- Confiança (**PROPOSTA**): o servidor confere ids de missão, ids de evento conhecidos, idempotência e, nas quests, a
  ordem das transições; não prova que o presente foi achado nem que o NPC foi visitado na cena. Uma conta consegue
  forjar no máximo o XP do catálogo (575 XP com as quests ligadas). XP não dá nada que dinheiro compre, e doação não
  dá XP.

O formato de sucesso continua `{progress}`. `progress_pending` foi retirado durante a revisão: um visitante com
`lake-lanterns` aceita consegue entrar na conta que tem `harness-bells` ativa e 40 XP; o cliente adota o estado da
conta e limpa a fila incompatível, em vez de ficar mostrando o progresso local com aviso incorreto de conexão.
Não existe abandono, substituição automática da quest ativa ou fila de futuras quests; essa decisão continua em
OQ-09. Com quests desligadas os eventos são omitidos; o cliente usa `/config` para não enviá-los.
As bandeiras de produção continuam desligadas.

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

`application` = os campos acima + `{id, status, revision, reviewNote, createdAt, updatedAt}`.

Regras do envio:

- Exige conta verificada (`403 not_verified`).
- Uma candidatura ativa por conta: com uma em `submitted`, `under_review` ou `published` → `409 application_active`.
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
  casos `409 application_locked`).
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
- **Exclusão de conta:** `DELETE /me` apaga do R2 e do D1 os documentos da pessoa e o logo de candidatura não
  publicada; o logo de uma ONG publicada fica. Antes de acessar R2, marca `users.files_deleting=1`: novas escritas
  de candidatura/arquivo/foto e decisões administrativas concorrentes são recusadas, exceto rejeitar uma candidatura
  ainda aberta para liberar o terreno. Essa rejeição não cancela a exclusão nem altera a política de retenção. Se R2 falhar, a conta e
  sessão continuam (`500`); se houver metadados sem binding `FILES`, responde `503 files_unavailable`. O usuário
  repete **o mesmo `DELETE /me`** após a recuperação. A marca não expira nem é desfeita automaticamente, pois
  parte dos bytes pode já ter sido removida. Escritas novas recebem `409 account_deleting`; leitura e sessão
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
Sem bucket/tabela de galeria, a rota pública de foto retorna `404` e o perfil mantém `photos: []`. A conciliação da operação de retirada do PR #33 é uma próxima entrega separada.

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
com objetos ainda pendentes. Direitos de imagem e consentimentos continuam sob OQ-15.

### Análise administrativa (DEC-037)

Só contas com `role = 'admin'` (concedido à mão no D1, ver [deploy.md §7](../guides/deploy.md#7-contas-e-ongs-040));
outras → `403 admin_only`.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /admin/applications[?status=…]` | — | `{applications: [{id, name, city, status, revision, lotId, createdAt, updatedAt}]}` (até 200, mais recentes primeiro) |
| `GET /admin/applications/:id` | — | `{application, applicant: {nickname, deletionPending} \| null, history: [{at, action, detail, actor}], files}` |
| `POST /admin/applications/:id/decision` | `{action, revision, note?, checks?}` | `{application}` |

`status` filtra por um dos cinco estados; sem filtro, lista as candidaturas (exclui ONGs publicadas sem candidatura).
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
receber `account_deleting`. ONG já publicada continua fora da transição de rejeição; retirada é outra entrega.

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

### Listas do painel administrativo (IMPL-0015)

Só leitura, só `role = 'admin'` (`401 not_signed_in` sem sessão, `403 admin_only` sem o papel), `Cache-Control:
no-store`. Mais recentes primeiro. Consultar não grava `audit_events` (só mutações são auditadas).

| Método e rota | Resposta |
|---|---|
| `GET /admin/audit[?before=<ISO>&limit=<1..100>]` | `{events: [{at, action, subject, detail, actor}], next}` |
| `GET /admin/users[?before=<ISO>&limit=<1..100>]` | `{users: [{id, nickname, role, city, createdAt, verified}], next}` |

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
- Não existe rota que conceda papel, altere ou apague contas de terceiros, nem ação de sanção (regras não
  definidas, DEC-037).

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
| sala → cliente | `["w", id, sala]` | boas-vindas com o id anônimo |
| sala → cliente | `["s", tickMs, [[id, x, z, yaw, speed, idadeMs], …]]` | poses que mudaram (10 Hz); na entrada, a lista toda |
| sala → cliente | `["l", id]` | alguém saiu |
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
| `1008` | `rate` (abuso do protocolo) | nova tentativa com espera exponencial (1–30 s) |
| outros (`1006`, queda de rede, deploy) | — | nova tentativa com espera exponencial (1–30 s) |

O cliente também desliga sozinho (fecha com `1000`, motivo `hidden`) quando a aba fica oculta por 2 minutos e
volta do mesmo jeito: no próximo toque, clique ou tecla com a aba visível.

Carga medida (`apps/server/scripts/load.mjs`, `wrangler dev` local, 2026-11-11): 41 robôs → 40 conectados e 1
recusado como cheio; cada visitante recebe ~9,7 mensagens/s e ~10 kB/s; do tick à chegada p95 9 ms (sem rede real).

## Erros

Corpo `{"error":"<código>"}`; erros de formulário trazem também `fields` com mensagens em pt-BR.

| Serviço | Status | Código | Quando |
|---|---|---|---|
| ambos | 404 | `not_found` | rota desconhecida; candidatura inexistente na análise |
| API | 405 | `method_not_allowed` | rota pública com método diferente de GET/HEAD/OPTIONS |
| servidor | 405 | `method_not_allowed` | método diferente de GET |
| API | 503 | `db_unavailable` | rota dependente de D1 (incluindo `/lots`, `/ngos/:id` e rotas de conta) sem binding |
| API | 503 | `schema_outdated` | operação de conta depende de colunas da migration 0007 ausentes; atualizar esquema antes de ativar o fluxo |
| API | 409 | `account_deleting` | exclusão pendente bloqueia candidatura/arquivos e análise/aprovação/ajustes; dono pode repetir exclusão, admin pode rejeitar candidatura aberta e liberar terreno |
| API | 503 | `files_unavailable` | exclusão/recuperação exige armazenamento de arquivos, mas o binding `FILES` está ausente |
| API | 503 | `file_cleanup_pending` | remoção/recuperação canônica não concluiu a limpeza; repetir `files/recover`, sem interpretar a retirada do metadado como descarte físico |
| API | 404 | `accounts_disabled` | rota de conta com `ACCOUNTS_ENABLED` desligado |
| API | 403 | `forbidden_origin` | rota de conta com `Origin` ausente ou fora de `ACCOUNT_ORIGINS`; `POST /auth/register` vindo do painel administrativo |
| API | 429 | `too_many_requests` | `/auth/*` acima de 10 requisições/60 s pelo mesmo IP; envio, remoção ou recuperação de arquivo acima de 20/60 s pela mesma conta |
| API | 415 | `json_required` | `POST` de conta sem `Content-Type: application/json` |
| API | 413 | `too_large` | corpo acima de 16 000 bytes (32 000 na candidatura) |
| API | 400 | `bad_json` | corpo não é um objeto JSON |
| API | 400 | `invalid` (+ `fields`) | cadastro ou candidatura com campo inválido |
| API | 409 | `nickname_taken` (+ `fields.nickname`) | nickname já usado |
| API | 400 | `invalid_token` | link desconhecido, expirado ou já usado |
| API | 503 | `mail_unavailable` | produção sem `RESEND_API_KEY` ou falha no envio |
| API | 401 | `not_signed_in` | rota que exige sessão, sem sessão válida |
| API | 403 | `admin_only` | rota `/admin/*` sem papel `admin` |
| API | 400 | `bad_events` | `/progress/events` vazio, com mais de 50 ou com missão/evento desconhecido |
| API | 409 | `progress_conflict` | três tentativas de gravação perderam a revisão; a fila pode ser reenviada |
| API | 429 | `too_many_events` | novas chaves de evento excederiam o limite de 500 por conta |
| API | 403 | `not_verified` | candidatura de conta não verificada |
| API | 409 | `application_active` | já existe candidatura `submitted`, `under_review` ou `published` |
| API | 409 | `lot_unavailable` (+ `fields.lotId`) | terreno ocupado (inclusive por corrida) |
| API | 409 | `cnpj_in_use` (+ `fields.cnpj`) | CNPJ já usado por outra candidatura |
| API | 400 | `bad_action` | `action` desconhecida na decisão |
| API | 400 | `note_required` (+ `fields.note`) | pedir ajustes ou rejeitar sem mensagem de ≥ 10 caracteres |
| API | 409 | `bad_transition` | decisão fora da tabela de transições |
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
| API | 409 | `too_many_files` (+ `fields.file`) | sexto documento |
| API | 429 | `too_many_file_changes` (+ `fields.file`) | mais de 60 envios e remoções de arquivo na mesma candidatura em 24 horas |
| API | 409 | `application_changed` | a candidatura mudou enquanto o arquivo era enviado ou removido |
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
[IMPL-0015](../decisions/0015-dash-backoffice-app.md)
