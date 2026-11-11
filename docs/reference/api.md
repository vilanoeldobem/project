# API HTTP e servidor de tempo real

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/api/src/api.ts`, `apps/api/src/api.test.ts`, `apps/server/src/handler.ts`,
> `apps/server/src/room.ts`, `packages/shared/src/net/protocol.ts`

Dois Workers ([IMPL-0009](../decisions/0009-split-client-api-server-shared.md)):

| Serviço | Base em produção | Base local |
|---|---|---|
| API HTTP (`apps/api`) | `https://api.vilanoeldobem.com.br` | `http://localhost:8787` |
| Tempo real (`apps/server`) | `https://server.vilanoeldobem.com.br` (WebSocket `wss://`) | `http://localhost:8788` |

Rotas sem prefixo (o host já diz qual é o serviço; até a IMPL-0009 eram `/api/*` no mesmo host do jogo). Chaves,
valores de estado e códigos de erro em inglês; `label` e `note` são textos de interface em pt-BR. Todas as respostas
são JSON UTF-8.

## API (`api.vilanoeldobem.com.br`)

Só `GET`/`HEAD`/`OPTIONS`; outros métodos → `405` com `Allow: GET, HEAD, OPTIONS`.

### CORS

A página do jogo e a do site estão em outra origem, então a API responde com CORS **só** para origens exatas da lista
`ALLOWED_ORIGINS` (`apps/api/wrangler.jsonc`): `https://play.vilanoeldobem.com.br` e
`https://www.vilanoeldobem.com.br`. Sem curingas: um host parecido nunca passa. Em desenvolvimento local a lista vem
do script `dev` (`http://localhost:5173`, `http://localhost:8799`).

| Requisição | Resposta |
|---|---|
| `Origin` na lista | `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`, `Access-Control-Max-Age: 86400`, `Vary: Origin` |
| `Origin` ausente ou fora da lista | só `Vary: Origin` (o navegador bloqueia a leitura; `curl` e servidores continuam lendo) |
| `OPTIONS` (preflight) | `204` sem corpo, com os cabeçalhos acima quando a origem é permitida |

### GET /health

`Cache-Control: no-store`.

```json
{ "ok": true, "version": "0.3.0", "environment": "production", "db": true }
```

### GET /indicators

Indicadores públicos (P02, DEC-027). `value: null` quando não há fonte verificável; a interface mostra "—" e `note`.
Cache 30 s.

| key | Fonte | Valor na 0.2.0 |
|---|---|---|
| `approved_ngos` | `COUNT(*) FROM ngos WHERE status='published'` | número (ou `null` sem D1) |
| `registered_users` | — | `null` (cadastro não implementado) |
| `confirmed_donations` | — | `null` (PEN-004, PEN-006) |
| `confirmed_amount` | — | `null` |
| `people_impacted` | — | `null` (exige metodologia) |

```json
{ "updatedAt": "2026-11-08T21:00:00.000Z", "indicators": [ { "key": "approved_ngos", "label": "ONGs aprovadas", "value": 0 } ] }
```

### GET /lots

Terrenos e, só quando a ONG está `published`, nome e resumo dela. Cache 30 s.

```json
{ "lots": [ { "id": "plaza-01", "street": "plaza", "slot": 1, "x": 20.33, "z": 8.42,
              "state": "available", "ngo_name": null, "ngo_summary": null } ] }
```

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
| cliente → sala | `"ping"` | mantém a conexão; resposta `"pong"` sem acordar a sala |
| sala → cliente | `["w", id, sala]` | boas-vindas com o id anônimo |
| sala → cliente | `["s", tickMs, [[id, x, z, yaw, speed, idadeMs], …]]` | poses que mudaram (10 Hz); na entrada, a lista toda |
| sala → cliente | `["l", id]` | alguém saiu |

A sala corrige a pose recebida: dentro do mundo, velocidade até a máxima do avatar, sem teletransporte (o passo é
limitado ao que daria para andar desde a última pose; a primeira pose é livre). Limite de 20 mensagens/s por
conexão (rajada de 40); mais de 200 descartadas → fecha com `1008`. Sala cheia → fecha com `4001` e o cliente tenta
a próxima.

## Erros

| Serviço | Status | Corpo | Quando |
|---|---|---|---|
| ambos | 404 | `{"error":"not_found"}` | rota desconhecida |
| API | 405 | `{"error":"method_not_allowed"}` | método diferente de GET/HEAD/OPTIONS |
| servidor | 405 | `{"error":"method_not_allowed"}` | método diferente de GET |
| API | 503 | `{"error":"db_unavailable"}` | `/lots` sem binding D1 |
| servidor | 426 | `{"error":"upgrade_required"}` | `/room` sem `Upgrade: websocket` |
| servidor | 403 | `{"error":"forbidden_origin"}` | `/room` com `Origin` ausente ou fora de `ALLOWED_ORIGINS` |
| servidor | 400 | `{"error":"bad_room"}` | `/room` com `i` fora de `0…7` |
| servidor | 503 | `{"error":"multiplayer_unavailable"}` | `/room` sem o binding `ROOMS` |
| API | 500 | `{"error":"internal"}` | exceção; log `api_error <rota> <tipo>` |

## Ver também

[architecture.md](architecture.md) · [storage.md](storage.md) · [IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md) ·
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)

## Contas opcionais - `/auth/*` (Unreleased, teste local)

[IMPL-0011](../decisions/0011-optional-magic-link-accounts.md). `GET /auth/session` retorna `{ available, user }`;
`user` é nulo ou contém somente `id`, `name`, `nickname`, `city`, `email` da sessão apresentada.
`POST /auth/request` aceita `{ mode: "signup", name, nickname, city, email }` ou `{ mode: "login", email }` e retorna
`202 { accepted: true }` sem revelar existência de conta. `POST /auth/confirm` aceita `{ token }`; `POST /auth/logout`
revoga a sessão. Links de 15 minutos, sessão de 7 dias, conta só após confirmação; unicidade de nickname/e-mail
case-insensitive, consumo transacional e vínculo ao navegador. O link aponta ao jogo; só o fragmento contém a credencial.

O cliente usa a API configurada em `SERVICES.api` com cookies (`credentials: include`). A API mantém cookies host-only,
HttpOnly, SameSite=Lax, Secure em HTTPS. Não compartilha cookies com o servidor de presença.
Respostas sempre `no-store`. CORS de contas inclui credenciais, GET/POST/OPTIONS e cabeçalho Content-Type somente para
`AUTH_PAGE_ORIGIN` presente em `ALLOWED_ORIGINS`; preflight de origem/método/cabeçalho não autorizado retorna 403.
O CORS das rotas públicas continua de leitura e sem credenciais.

Disponibilidade exige D1, `ENVIRONMENT=development`, `AUTH_MODE=local`, `AUTH_API_ORIGIN` igual à origem da requisição,
`AUTH_PAGE_ORIGIN` canônica autorizada, ambas loopback. Sem isso sessão retorna `{ available: false, user: null }`
e escritas retornam `503 auth_unavailable`. Não existe endpoint que revele a caixa local.

Escritas exigem Origin exata do jogo e rejeitam Sec-Fetch-Site cross-site. JSON até 4 KiB; nome/cidade 2-80 caracteres,
e-mail até 254; nickname 3-24 letras ASCII/números/sublinhado. Tokens só em cookies/memória, nunca localStorage.
Erros: 400 invalid_fields/invalid_body/invalid_link, 403 origin_forbidden, 409 nickname_unavailable, 429 rate_limited,
503 auth_unavailable. Limites por janela: 3 pedidos/e-mail/15 minutos, 10 pedidos/IP/minuto, 30 confirmações/IP/minuto.
Nickname indisponível só é revelado após posse de link válido. Logs inesperados de conta usam apenas `auth_error`.

[Guia local](../guides/auth-local.md). Provedor real, homologação pública e sincronização de progresso permanecem pendentes.

## Progresso da conta - `/progress` (Unreleased, teste local)

Rotas privadas usam sessão válida e `X-Account-ID` igual ao usuário da sessão; ausente/divergente retorna
`409 account_changed` antes de qualquer criação ou alteração. O cabeçalho é uma precondição contra troca de conta
em outra aba, não uma autorização. Sem sessão, `401 unauthorized`; ambiente público desabilitado, `503 auth_unavailable`.

- `GET /progress`: `{ progress, revision, guestImported }` canônico, somente da própria conta.
- `POST /progress/events`: `{ missionId, eventId }`. Missão conhecida; ID de 1-128 letras ASCII, números, dois-pontos,
  hífen ou sublinhado; prefixo interno `guest-import:` reservado. Presentes exigem IDs de `GIFTS` compartilhado.
- `POST /progress/import`: `{ counters, giftIds? }`. Contadores inteiros entre zero e o alvo de cada missão conhecida.
  `giftIds` deve conter exatamente a quantidade de presentes declarada, sem duplicatas, todos conhecidos, até o alvo.
  Na primeira importação, unir presentes por identidade e demais missões pelo maior contador; calcular recompensas
  pelo código compartilhado. Importações seguintes retornam o estado atual sem reaplicar o visitante.

Não aceita `userId`, `xp`, nível, estado livre ou outros campos. Corpos até 4 KiB. POST exige Origin exata do jogo e
rejeita Sec-Fetch-Site cross-site. CORS credenciado das rotas de progresso permite somente GET/POST/OPTIONS,
Content-Type e X-Account-ID, para a origem exata configurada. As rotas públicas não recebem essas permissões.
Todas as respostas são no-store. Revisão usa compare-and-swap com cinco tentativas; conflito persistente retorna
`409 progress_conflict`, Retry-After 1. Payload inválido retorna 400 invalid_event/invalid_import/invalid_body.

Provas e limites: [IMPL-0012](../decisions/0012-account-progress.md). Ações continuam relatadas pelo cliente;
validação/idempotência limitam recompensas, sem atestar uma execução real da ação.

## Candidaturas de ONG (PROPOSTA local, IMPL-0013)

Mesmas condições locais da autenticação e asserção `X-Account-ID` da sessão, com CORS credenciado exato.
Fora do modo local: 503 auth_unavailable; sem sessão: 401 unauthorized; conta divergente: 409 account_changed.
Respostas no-store. Listas retornam até 100 candidaturas; paginação e operação pública estão fora deste protótipo.

`Application` contém: id, ngoId, lotId, name, cnpj, openedOn, summary, status, revision, feedback, createdAt, updatedAt.
Proprietário não é aceito nem enviado ao cliente. Feedback só aparece ao dono e aos administradores autorizados.

| Rota | Contrato |
|---|---|
| GET /ngo-applications | `{ applications, canReview }` somente do proprietário |
| POST /ngo-applications | `{ name, cnpj, openedOn, summary, lotId }`; 201 `{ application, canReview }` |
| GET /ngo-applications/:id | `{ application, canReview }` do dono; outra conta recebe404 |
| PUT /ngo-applications/:id | Mesmos campos + expectedRevision, somente changes_requested; reenvio→submitted |
| GET /admin/ngo-applications | `{ applications, canReview }`, exige allowlist administrativa |
| POST /admin/ngo-applications/:id/review | `{ expectedRevision, action, feedback?, eligibility? }`; retorna `{ application, canReview }` |

Revisão exige inteiro positivo exato. Ações: start_review (submitted→under_review), request_changes/reject/approve
(somente under_review). Feedback obrigatório em request_changes/reject, até 2000 caracteres; summary tem 10-2000,
ambos aceitam parágrafos e tabs mas rejeitam controles inseguros. Nome tem 2-120 caracteres, sem quebras de linha.
CNPJ tem 14 dígitos e checksum válido; openedOn é data ISO real com pelo menos um ano; lotId indica terreno disponível.
Essas verificações não provam CNPJ ativo. Para approve, eligibility deve ser exatamente as três booleanas true:
`{ activeCnpj: true, minimumAge: true, fundsVerification: true }`, atestadas manualmente por administrador autorizado.

Permissão administrativa: `ADMIN_USER_IDS` de UUIDs exatos no ambiente do servidor, padrão vazio. Nenhum administrador
real é configurado pelo protótipo. CORS adiciona PUT apenas à família de rotas de candidaturas e mantém X-Account-ID
restrito às rotas privadas que exigem a asserção. POST/PUT exigem Origin exata, JSON até 8 KiB (para comportar parágrafos acentuados) e recusam campos extras. As rotas de autenticação e progresso preservam o limite de 4 KiB.

Erros de domínio: 400 invalid_fields/invalid_body/invalid_eligibility; 403 forbidden/origin_forbidden;
404 not_found; 409 revision_conflict/invalid_transition/cnpj_exists/lot_unavailable. Mutação concorrente perdedora
retorna conflito e não publica casa nem gera auditoria. Envio de candidatura não publica ou reserva o terreno
(política provisória para teste). A aprovação faz associação+publicação+auditoria transacionalmente.

Sem upload de documentos, consulta cadastral automática, integração financeira ou configuração de administradores reais.
[Decisão e pendências](../decisions/0013-local-ngo-applications.md).
