# API HTTP

> **Status:** API pública implementada; contas em revisão (Unreleased) · **Schema D1:** v4 local ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/web/worker/api.ts`, `apps/web/worker/auth.ts` e respectivos testes

Base: mesma origem da página. Chaves, valores de estado e códigos de erro em inglês; `label` e `note` são textos
de interface em pt-BR. Todas as respostas são JSON UTF-8. Rotas públicas aceitam `GET`/`HEAD`;
as rotas de conta abaixo têm métodos próprios. Métodos diferentes → `405`.

## GET /api/health

`Cache-Control: no-store`.

```json
{ "ok": true, "version": "0.2.0", "environment": "production", "db": true }
```

## GET /api/indicators

Indicadores públicos (P02, DEC-027). `value: null` quando não há fonte verificável; a interface mostra "—" e `note`.
Cache 30 s.

| key | Fonte | Valor na 0.2.0 |
|---|---|---|
| `approved_ngos` | `COUNT(*) FROM ngos WHERE status='published'` | número (ou `null` sem D1) |
| `registered_users` | — | `null` (cadastro público não habilitado) |
| `confirmed_donations` | — | `null` (PEN-004, PEN-006) |
| `confirmed_amount` | — | `null` |
| `people_impacted` | — | `null` (exige metodologia) |

```json
{ "updatedAt": "2026-11-08T21:00:00.000Z", "indicators": [ { "key": "approved_ngos", "label": "ONGs aprovadas", "value": 0 } ] }
```

## GET /api/lots

Terrenos e, só quando a ONG está `published`, nome e resumo dela. Cache 30 s.

```json
{ "lots": [ { "id": "plaza-01", "street": "plaza", "slot": 1, "x": 20.33, "z": 8.42,
              "state": "available", "ngo_name": null, "ngo_summary": null } ] }
```

## GET /api/environment

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

## Conta opcional — `/api/auth/*`

Todas as respostas são `Cache-Control: no-store`, sem tokens e sem CORS. Nesta entrega, autenticação só fica
disponível com D1 + `ENVIRONMENT=development` + `AUTH_MODE=local` + `AUTH_ORIGIN` exatamente igual à origem
loopback da requisição. Produção fica desabilitada, aguardando integração de e-mail e revisão operacional.

| Rota | Corpo / resposta |
|---|---|
| `GET /api/auth/session` | `{ available, user }`; no ambiente local habilitado inclui `local: true`. `user` é `null` sem sessão válida ou contém apenas `id`, `name`, `nickname`, `city`, `email` do dono |
| `POST /api/auth/request` | `{ mode: "signup", name, nickname, city, email }` ou `{ mode: "login", email }`; `202 { accepted: true }` independentemente da existência do e-mail; cookie HttpOnly vincula navegador |
| `POST /api/auth/confirm` | `{ token }`; exige vínculo do navegador; `200 { ok: true }` com novo cookie de sessão |
| `POST /api/auth/logout` | sem campos necessários; `200 { ok: true }`, invalida sessão no D1 e expira cookie |

POST exige `Origin` exata e rejeita `Sec-Fetch-Site: cross-site`. Request/confirm exigem JSON com até 4 KiB.
Nome/cidade têm 2–80 caracteres, e-mail até 254; nickname usa 3–24 letras ASCII, números ou sublinhado.
O link dura 15 minutos, chega como `/#login=TOKEN` e requer clique explícito em confirmar. O cliente remove
o fragmento imediatamente; previews/GET não consomem a credencial. Só o navegador que iniciou o pedido aceita o link.
Sessão dura 7 dias, sem renovação silenciosa; cookie host-only HttpOnly, SameSite=Lax, Path=/, Secure em HTTPS.
HTTP é exceção restrita a loopback local. Nenhum token é gravado em localStorage/sessionStorage;
sessão e vínculo ficam apenas em cookies HttpOnly.

Criação da conta, sessão e consumo do link são atômicos. Repetição/expiração retornam `invalid_link`.
E-mail/nickname têm unicidade case-insensitive; cadastro repetido nunca altera um perfil já verificado.
Limites: 3 pedidos/e-mail/15 min, 10 pedidos/IP/min e 30 confirmações/IP/min. Resposta 429 inclui `Retry-After`.

Erros específicos: `400 invalid_fields|invalid_body|invalid_link`, `403 origin_forbidden`,
`409 nickname_unavailable` (só após posse do link válido), `429 rate_limited`, `503 auth_unavailable`.
Erros inesperados retornam `500 internal`; log fixo `auth_error`, sem parâmetros ou mensagens do banco.
Não há endpoint de caixa de e-mail ou listagem pública de usuários. [Como testar](../guides/auth-local.md).

## Erros das rotas públicas

| Status | Corpo | Quando |
|---|---|---|
| 404 | `{"error":"not_found"}` | rota `/api/*` desconhecida |
| 405 | `{"error":"method_not_allowed"}` | método diferente de GET/HEAD |
| 503 | `{"error":"db_unavailable"}` | `/api/lots` sem binding D1 |
| 500 | `{"error":"internal"}` | exceção; log `api_error <rota> <tipo>` |

## Ver também

[architecture.md](architecture.md) · [storage.md](storage.md)
