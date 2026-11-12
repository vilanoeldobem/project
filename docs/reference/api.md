# API HTTP e servidor de tempo real

> **Status:** Implementado (0.4.0; contas desligadas em produção por `ACCOUNTS_ENABLED`) · **Versão do software:** 0.4.0 ·
> **Schema D1:** v5 · **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `apps/api/src/{api,auth,mail,session,progress,ngo,public-ngo,admin,backoffice,http}.ts`, `apps/api/src/api.test.ts`,
> `apps/api/src/accounts.test.ts`, `packages/shared/src/accounts/validate.ts`, `apps/server/src/handler.ts`,
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

### CORS

As páginas do jogo, do site e do painel administrativo estão em outra origem, então a API responde com CORS **só**
para origens exatas da lista `ALLOWED_ORIGINS` (`apps/api/wrangler.jsonc`): `https://play.vilanoeldobem.com.br`,
`https://www.vilanoeldobem.com.br` e `https://dash.vilanoeldobem.com.br`. Sem curingas: um host parecido nunca
passa. `Access-Control-Allow-Credentials` só vai para as origens de `ACCOUNT_ORIGINS` (o jogo e o painel); o site lê
dados públicos sem cookie. Em desenvolvimento local as duas listas vêm do script `dev` (`http://localhost:5173` e
`http://localhost:8799` do jogo, `http://localhost:5175` e `http://localhost:8797` do painel).

| Requisição | Resposta |
|---|---|
| `Origin` na lista | `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Credentials: true` (só para origens de `ACCOUNT_ORIGINS`), `Access-Control-Allow-Methods: GET, HEAD, POST, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 86400`, `Vary: Origin` |
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
{ "ok": true, "version": "0.4.0", "environment": "production", "db": true, "mail": false }
```

`version` vem da constante `VERSION` em `apps/api/src/api.ts`. `mail` diz se o segredo `RESEND_API_KEY` existe no
Worker (nunca o valor).

### GET /config

Bandeiras que o cliente precisa saber antes de mostrar interface. `Cache-Control: no-store`.

```json
{ "accounts": false, "quests": false }
```

`accounts` é `true` só quando `ACCOUNTS_ENABLED = "true"`. Com `false`, o jogo esconde toda a interface de conta
(chip "Entrar", candidatura de ONG) e a Vila segue jogável sem conta (OQ-02); o painel administrativo mostra o
aviso "Contas desligadas" e só dados públicos. O painel lista todas as chaves que esta rota devolver.

`quests` é `true` só quando `QUESTS_V1_ENABLED = "true"` (ligada no script local `dev`, desligada em produção e
staging). A missão narrativa `quests-v1` é PROPOSTA (DEC-039..042, PEN-025). O cliente só mostra as quests quando
`quests` é `true` **e** a bandeira dele também está ligada (`VITE_QUESTS_V1_ENABLED=true` no build ou `?quests=1` em
localhost/desenvolvimento). Ver [quests.md](quests.md) e [IMPL-0013](../decisions/0013-quests-v1-runtime.md).

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

Terrenos e, só quando **a ONG e o terreno** estão `published`, identificador, nome e resumo dela.
`ngo_id` é o identificador para consultar `GET /ngos/:id`; nos demais estados ele é `null`.
`Cache-Control: no-store`. Candidaturas em
andamento mudam o `state` do terreno (`application_sent`, `under_review`), mas nunca expõem dados da organização.

```json
{ "lots": [ { "id": "plaza-01", "street": "plaza", "slot": 1, "x": 20.33, "z": 8.42,
              "state": "available", "ngo_id": null, "ngo_name": null, "ngo_summary": null } ] }
```

### GET /ngos/:id

Perfil público da ONG que ocupa uma casa publicada (D09, P03/P04, DEC-028/037). A rota é pública: não exige
sessão e funciona mesmo com `ACCOUNTS_ENABLED = "false"`. Ela não permite criar, editar nem aprovar uma ONG.
O game encontra `ngo_id` em `/lots` e usa esse valor no caminho. As rotas privadas `/ngo/application` e
`/admin/applications` continuam com seus contratos e permissões atuais.

Exemplo sintético do contrato, não um registro de produção:

```json
{
  "ngo": {
    "id": "a0000000-0000-4000-8000-000000000001",
    "name": "Associação Exemplo",
    "summary": "Apresentação curta aprovada.",
    "description": "Descrição institucional aprovada.",
    "city": "Recife",
    "tags": ["education"],
    "projects": [{ "title": "Leitura", "description": "Projeto aprovado." }],
    "lotId": "plaza-01",
    "photos": []
  }
}
```

- Somente retorna a ONG com `ngos.status = 'published'`, ligada por `lots.ngo_id` a um terreno também
  `published`. O terreno retornado é o vínculo real, não `requested_lot_id` da candidatura.
- Identificador inválido, organização inexistente, não publicada ou sem terreno publicado → a mesma resposta
  `404 {"error":"not_found"}`. Sem binding D1 → `503 db_unavailable`.
- `Cache-Control: no-store` em sucesso e erros de leitura: a próxima consulta após despublicação deixa de retornar
  o perfil. CORS segue as origens exatas da API; métodos seguem `GET`/`HEAD`/`OPTIONS`.
- A resposta contém **somente** os campos do exemplo. Não inclui CNPJ, dados de quem se candidatou, declarações,
  comprovação de recursos, notas de revisão ou histórico administrativo. Cada projeto contém somente `title` e
  `description`, mesmo se o JSON armazenado trouxer campos adicionais.
- Registros antigos podem ter `summary`, `description` e `city` nulos. `tags` e `projects` ausentes, JSON inválido
  ou com formato diferente de lista resultam em `[]`. Tags fora do catálogo atual e projetos sem título/descrição
  textuais são omitidos; o catálogo de tags permanece **PROPOSTA**.
- `photos` contém somente fotos aprovadas quando `NGO_PHOTOS_ENABLED="true"`; com a flag desligada, retorna `[]`.
  Fotos seguem o contrato abaixo. Documentos privados e indicadores novos não fazem parte desta entrega.

O perfil textual usa o schema v5; fotos exigem a migration `0006_ngo_photos.sql` e binding privado R2. **Antes de publicar a API com essa rota, o banco de destino precisa
ter as migrations 0004–0005 da `main` aplicadas**, conforme o procedimento autorizado de publicação. Não aplicar
as migrations da antiga linha paralela de contas. A integração visual ao HUD é uma entrega separada do game;
o contrato e os testes de API estão disponíveis neste incremento.

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

`user` = `{id, name, nickname, city, email, role}` (`role`: `player` ou `admin`). Só a própria pessoa recebe esses
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
  (`accept` com outra missão em andamento, objetivo antes do `accept`) → `200`, nada gravado para ele; o mesmo id pode
  ser reenviado depois. Eventos das quatro missões rápidas são sempre gravados (`INSERT OR IGNORE`).
- Ao entrar, o cliente envia o progresso de visitante deste navegador (em lotes de 50), apaga-o do navegador e mostra
  o da conta; depois envia cada evento novo. Eventos que falham ficam numa fila (`vila.pending.v1:<id da conta>`) e
  são reenviados quando a conexão volta. Ao sair, o jogo volta ao progresso de visitante (vazio depois da migração):
  num navegador compartilhado a próxima pessoa não herda nada.
- Confiança (**PROPOSTA**): o servidor confere ids de missão, ids de evento conhecidos, idempotência e, nas quests, a
  ordem das transições; não prova que o presente foi achado nem que o NPC foi visitado na cena. Uma conta consegue
  forjar no máximo o XP do catálogo (575 XP com as quests ligadas). XP não dá nada que dinheiro compre, e doação não
  dá XP.

### Candidatura de ONG (P12, DEC-015, DEC-037)

| Método e rota | Resposta |
|---|---|
| `GET /ngo/application` | `{application}` (a da própria conta) ou `{application: null}` |
| `POST /ngo/application` | `201 {application}` (primeira) ou `200 {application}` (reenvio); corpo com `accountId` e os campos abaixo |

Quatro etapas do wireframe; a lista de campos é **PROPOSTA** (G08, PEN-019). **Não há upload de documentos** nesta
versão: os documentos são declarados e a administração os pede na análise.

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
- Nada fica público antes da aprovação: `/lots` só mostra nome e resumo de ONG `published`.

**Estados da candidatura e do terreno** (nomes **PROPOSTA** do plano; terreno conforme DEC-028):

| Candidatura (`ngos.status`) | Terreno (`lots.state`) |
|---|---|
| `submitted` | `application_sent` |
| `under_review` | `under_review` |
| `changes_requested` | `application_sent` (continua reservado) |
| `published` | `published` |
| `rejected` | `available` (liberado, `ngo_id = NULL`) |

### Análise administrativa (DEC-037)

Só contas com `role = 'admin'` (concedido à mão no D1, ver [deploy.md §7](../guides/deploy.md#7-contas-e-ongs-040));
outras → `403 admin_only`.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /admin/applications[?status=…]` | — | `{applications: [{id, name, city, status, revision, lotId, createdAt, updatedAt}]}` (até 200, mais recentes primeiro) |
| `GET /admin/applications/:id` | — | `{application, applicant: {nickname} \| null, history: [{at, action, detail, actor}]}` |
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

- `note` (até 1000 caracteres) é a mensagem à organização; fica em `ngos.review_note` e aparece para quem enviou.
- `revision` (obrigatório, inteiro) é a versão que o admin está vendo. Se a organização reenviou enquanto a tela
  estava aberta, a decisão é recusada (`409 stale_revision`, nada é gravado) em vez de valer para um conteúdo que
  ninguém analisou.
- `approve` exige `checks: {activeCnpj, oneYear, fundsConfirmable}`, os três `true` (as verificações do DEC-015);
  senão `400 checks_required`.
- Ação desconhecida → `400 bad_action`; sem `revision` → `400 revision_required`; mensagem faltando → `400
  note_required` (com `fields.note`); transição fora da tabela ou corrida com outra decisão → `409 bad_transition`
  (só uma de duas decisões simultâneas vale, com uma linha de auditoria); candidatura inexistente → `404 not_found`.
- Cada decisão grava `audit_events` `ngo.<action>` com o id do admin e `detail`
  `{from, to, lot, revision, hasNote}` (na aprovação, também `checks`) — sem e-mail e sem o texto da mensagem.
- A aprovação publica a casa: `/lots` passa a trazer nome e resumo, e o jogo desenha o chalé gerado pela semente do
  terreno ([IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md)).

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
| API | 503 | `db_unavailable` | `/lots` ou rota de conta sem binding D1 |
| API | 404 | `accounts_disabled` | rota de conta com `ACCOUNTS_ENABLED` desligado |
| API | 403 | `forbidden_origin` | rota de conta com `Origin` ausente ou fora de `ACCOUNT_ORIGINS`; `POST /auth/register` vindo do painel administrativo |
| API | 429 | `too_many_requests` | `/auth/*` acima de 10 requisições/60 s pelo mesmo IP |
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
| API | 403 | `not_verified` | candidatura de conta não verificada |
| API | 409 | `application_active` | já existe candidatura `submitted`, `under_review` ou `published` |
| API | 409 | `lot_unavailable` (+ `fields.lotId`) | terreno ocupado (inclusive por corrida) |
| API | 409 | `cnpj_in_use` (+ `fields.cnpj`) | CNPJ já usado por outra candidatura |
| API | 400 | `bad_action` | `action` desconhecida na decisão |
| API | 400 | `note_required` (+ `fields.note`) | pedir ajustes ou rejeitar sem mensagem de ≥ 10 caracteres |
| API | 409 | `bad_transition` | decisão fora da tabela de transições |
| API | 409 | `account_changed` | escrita com `accountId` diferente da sessão (outra aba trocou de conta) |
| API | 409 | `stale_revision` | decisão sobre versão que já não é a atual |
| API | 400 | `revision_required` | decisão sem `revision` inteiro |
| API | 400 | `checks_required` | aprovação sem as três verificações do DEC-015 |
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


## Fotos das ONGs — backend D09 (PROPOSTA, desativado)

`NGO_PHOTOS_ENABLED="true"` libera estas rotas, com binding privado `NGO_PHOTOS` (R2) e schema v6.
Produção e staging continuam com a flag `false` e sem binding R2. Não foi criado bucket ou aplicado schema remoto.
Os limites abaixo são **PROPOSTA técnica para revisão do Augusto**, não decisão de produto já aprovada.

| Rota | Autorização / entrada | Saída |
|---|---|---|
| `POST /ngo/photos` | Conta verificada e dona da ONG; JSON `{accountId, ngoId, caption, position, contentType, dataBase64}` | `201 {photo}` com estado `pending` |
| `GET /ngo/photos?ngoId=UUID` | Conta dona da ONG | `{photos}` até 10 registros não removidos |
| `GET /ngo/photos/:id/content` | Conta dona da ONG | Bytes para prévia privada |
| `GET /admin/ngos/:ngoId/photos` | Admin | `{photos}` com prévias privadas |
| `GET /admin/ngo-photos/:id/content` | Admin | Bytes para análise |
| `POST /admin/ngo-photos/:id/decision` | Admin; `{accountId, revision, action: "approve" | "reject" | "remove"}` | `{photo}` com revisão incrementada |
| `GET /ngos/:ngoId/photos/:id` | Pública, sem sessão | Bytes somente quando foto aprovada, ONG publicada e terreno real publicado |

Rotas privadas reutilizam `ACCOUNTS_ENABLED`, sessão e Origin exato das contas; escritas exigem JSON e `accountId`
igual à sessão. `HEAD` funciona nas rotas de bytes. Para prévias privadas no navegador, usar `fetch` com
`credentials: "include"` e Origin permitido; não são URLs de bucket público. Respostas usam `no-store`; imagens
usam MIME validado, `nosniff` e CSP restritiva. Conteúdo oculto/inexistente sempre responde `404 not_found`.

`photo` privado contém `id`, `ngoId`, `caption`, `position`, `status`, `revision`, `contentType`, `byteSize` e
`previewUrl` (nulo após remoção). Chave R2 nunca é retornada. O perfil público adiciona apenas
`photos: [{id, url, caption, position}]`, ordenadas por `position,id`, com URL relativa à **origem da API**.
A flag desligada produz `photos: []`; flag ligada sem binding retorna `503 photos_unavailable`.

Limites propostos: 2 MiB de bytes, corpo JSON até 3 MiB (inclusive sem Content-Length), PNG/JPEG/WebP estático,
até 4096 pixels por lado e 16 milhões de pixels, legenda de até 240 caracteres, posição inteira 0–9 e até
10 fotos não removidas por ONG. Base64 deve ser canônico; MIME declarado deve corresponder à estrutura detectada.
SVG/HTML e WebP animado são recusados. Verificação lê assinaturas, comprimentos de blocos, cabeçalhos e dimensões;
**não decodifica pixels, não valida CRC/compressão integral nem remove EXIF/GPS/XMP**. Um arquivo estruturalmente
aceito ainda pode falhar no decodificador do navegador. Análise visual continua necessária.

Uploads e legendas são imutáveis. Para substituir conteúdo, remover a foto anterior e enviar nova foto pendente.
Aprovar/rejeitar é permitido somente de `pending`; remover aceita qualquer estado ainda não removido. Nenhum
admin pode analisar a própria ONG. Aprovação verifica existência do objeto. Cada decisão usa revisão e token
exclusivo na mesma transação D1 da auditoria, evitando dupla decisão/histórico em concorrência.

Erros adicionais: `400 invalid_photo`, `invalid_photo_metadata`, `bad_action`, `revision_required`;
`403 not_verified`, `admin_only`, `self_review`; `409 account_changed`, `stale_revision`, `bad_transition`,
`photo_object_missing`, `photo_limit_or_owner_changed`; `413 photo_too_large`/`too_large`;
`415 json_required`. Erros de infraestrutura inesperados retornam `500 internal`, sem publicar a foto.

**Ativação permanece bloqueada por decisões operacionais:** consentimento/direito de imagem (especialmente
crianças), política para metadados EXIF/GPS, retenção após exclusão da conta e rotina de limpeza de objetos.
Não ativar produção só porque testes passaram. Código/UI não coleta consentimento nesta entrega.

### Validação local D1 + R2 (somente dados sintéticos)

Na raiz do checkout, usando Node 24 e pnpm 10, o ambiente `photos-local` simula ambos os bindings e não usa
recursos remotos. Não executar deploy deste ambiente nem retirar `--local` dos comandos:

```bash
pnpm --filter @vila/api exec wrangler d1 migrations apply DB --env photos-local --local
node apps/api/scripts/verify-photos.mjs --seed > .photo-smoke-seed.sql
pnpm --filter @vila/api exec wrangler d1 execute DB --env photos-local --local --file ../../.photo-smoke-seed.sql
pnpm --filter @vila/api exec wrangler dev --env photos-local --local --port 8796
# Em outro terminal, após o Worker ficar pronto:
node apps/api/scripts/verify-photos.mjs http://127.0.0.1:8796
```

O arquivo de seed contém somente credenciais sintéticas locais; excluir `.photo-smoke-seed.sql` depois da prova.
O smoke cobre envio, prévia, aprovação, leitura pública, revisão repetida e retirada. Não aplica mudanças na nuvem.

## Documentos privados das ONGs — backend D07 (PROPOSTA, desativado)

[IMPL-0019](../decisions/0019-private-ngo-documents.md) implementa o transporte privado de evidências da
candidatura. Não define quais comprovantes são obrigatórios, nem substitui a conferência humana dos critérios
DEC-015. `NGO_DOCUMENTS_ENABLED="true"`, contas habilitadas, migration `0008_ngo_private_documents.sql` e
binding **separado** `NGO_DOCUMENTS` são necessários. Produção/staging continuam desligados, sem binding remoto.

| Rota | Autorização / entrada | Saída |
|---|---|---|
| `POST /ngo/documents` | Dono verificado; `{accountId, ngoId, applicationRevision, label, contentType, dataBase64}` | `201 {applicationRevision, document}` |
| `GET /ngo/documents?ngoId=UUID` | Dono da candidatura | `{applicationRevision, documents}` |
| `GET /ngo/documents/:id/content` | Dono da candidatura | Download privado como anexo |
| `POST /ngo/documents/:id/withdraw` | Dono verificado; `{accountId, applicationRevision}` | `{applicationRevision, withdrawn: documentId}` |
| `GET /admin/ngos/:ngoId/documents` | Admin | `{applicationRevision, documents}` |
| `GET /admin/ngo-documents/:id/content` | Admin | Download privado como anexo |

`document` contém somente `id`, `ngoId`, `label`, `contentType`, `byteSize`, `addedRevision`, `createdAt` e
`contentUrl`. Esta URL é um caminho relativo à **origem da API**, autenticado, nunca URL pública do bucket.
O navegador deve usar `fetch` com `credentials: "include"` a partir do Origin permitido do jogo/dashboard e
baixar o Blob retornado. Navegação direta por link normalmente não envia Origin e é recusada com `403`.
O nome do download pode ser derivado de UUID e MIME; nome original e caminho local do arquivo não são guardados.

Todas as rotas exigem sessão e Origin exato existente; escritas verificam `accountId` igual à sessão.
Downloads também aceitam `HEAD`, usam `Content-Disposition: attachment` com nome gerado
`document-<UUID>.pdf|png|jpg`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e CSP
`default-src 'none'; sandbox`. Dono de outra ONG, documento retirado e documento inexistente recebem o mesmo
`404 not_found`. **Aprovar a ONG não publica documentos**: nenhum campo, link ou byte entra no perfil público,
nas fotos institucionais ou na lista de terrenos. Dono/admin mantêm leitura privada após aprovação.

Propostas técnicas: até **10 anexos ativos** por ONG, **2 MiB por arquivo**, corpo JSON até **3 MiB** inclusive
sem Content-Length, rótulo de 1–120 caracteres, PDF/PNG/JPEG e base64 canônico. PNG/JPEG reutilizam os limites
estruturais das fotos (4096 pixels por lado e 16 milhões de pixels). Para PDF, verificam-se somente assinatura
de versão `%PDF-1.0` a `%PDF-1.7` ou `%PDF-2.0` e marcador final `%%EOF`; isso **não valida o documento inteiro,
não remove scripts/metadados, não sanitiza e não faz varredura de malware**. Imagens também não removem EXIF/GPS.
Validação de cabeçalhos não atesta que o arquivo seja seguro para abrir. OQ-13 bloqueia recebimento real até a
equipe definir política, formatos, retenção e proteção operacional. Não há coleta de consentimento nesta entrega.

Envio/retirada aceitam apenas `submitted`, `changes_requested` e `rejected`; ficam bloqueados durante
`under_review` e `published`. Arquivo e rótulo são imutáveis: para substituir, retirar e enviar novamente.
Toda alteração incrementa a **revisão da candidatura**, com CAS de dono, revisão e estado exato na mesma
transação que metadados e auditoria. Disputas com análise administrativa retornam `409 stale_revision`;
nenhuma revisão antiga pode aprovar um conjunto de evidências alterado. A listagem lê anexos e revisão num
único snapshot. O consumidor administrativo deve comparar `applicationRevision` com `application.revision`
dos detalhes antes de permitir a decisão e recarregar ambos se divergirem; sua interface está fora deste PR.
Anexos ativos de versões anteriores permanecem na candidatura após reenvio, com `addedRevision` original.

Retirada grava primeiro o tombstone e a nova revisão; falha ao apagar R2 não restaura acesso. Não há retirada
por admin, expiração automática ou job de limpeza nesta versão. Auditoria de upload/retirada registra apenas
IDs e revisão, sem rótulo, chave R2 ou conteúdo. Leituras não geram eventos de auditoria nesta entrega.

Erros específicos: `400 invalid_document`, `invalid_document_label`, `revision_required`; `409 documents_locked`,
`document_limit`, `stale_revision`; `413 document_too_large`/`too_large`; `503 documents_unavailable`.
Aplicam-se também os erros de conta, Origin e JSON existentes. Flag desligada retorna `404 not_found`;
falhas inesperadas de armazenamento retornam `500 internal` sem revelar conteúdo ou chaves.

### Prova local de documentos D1 + R2

Somente dados sintéticos, Node 24/pnpm 10, ambiente `documents-local`. Nunca executar deploy deste ambiente,
nem retirar `--local`. A migration 0008 é independente da 0007 reservada ao PR de progresso.

```bash
pnpm --filter @vila/api exec wrangler d1 migrations apply DB --env documents-local --local
node apps/api/scripts/verify-documents.mjs --seed > .document-smoke-seed.sql
pnpm --filter @vila/api exec wrangler d1 execute DB --env documents-local --local --file ../../.document-smoke-seed.sql
pnpm --filter @vila/api exec wrangler dev --env documents-local --local --port 8794 --inspector-port 9244
# Em outro terminal, após o Worker ficar pronto:
node apps/api/scripts/verify-documents.mjs http://127.0.0.1:8794
```

Excluir `.document-smoke-seed.sql` depois da prova. O seed reinicia apenas a ONG sintética e suas sessões;
repeti-lo pode deixar bytes órfãos no simulador R2. Use o ambiente isolado. O smoke cobre dono/admin, negação
de visitante/terceiro, revisão obsoleta, retirada, aprovação e permanência privada após publicação.
