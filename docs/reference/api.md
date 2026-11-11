# API HTTP

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/web/worker/api.ts`, `apps/web/worker/api.test.ts`, `apps/web/worker/room.ts`,
> `apps/web/src/net/protocol.ts`

Base: mesma origem da página. Chaves, valores de estado e códigos de erro em inglês; `label` e `note` são textos
de interface em pt-BR. Todas as respostas são JSON UTF-8. Só `GET`/`HEAD`; outros métodos → `405`.

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
| `registered_users` | — | `null` (cadastro não implementado) |
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

## GET /api/room?i=N (WebSocket)

Presença em tempo real numa praça ([IMPL-0008](../decisions/0008-multiplayer-presence-durable-objects.md)).
Exige `Upgrade: websocket` e `Origin` igual ao host da página (bloqueia sequestro de WebSocket por outros sites).
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

| Status | Corpo | Quando |
|---|---|---|
| 404 | `{"error":"not_found"}` | rota `/api/*` desconhecida |
| 405 | `{"error":"method_not_allowed"}` | método diferente de GET/HEAD |
| 503 | `{"error":"db_unavailable"}` | `/api/lots` sem binding D1 |
| 426 | `{"error":"upgrade_required"}` | `/api/room` sem `Upgrade: websocket` |
| 403 | `{"error":"forbidden_origin"}` | `/api/room` com `Origin` ausente ou de outro host |
| 400 | `{"error":"bad_room"}` | `/api/room` com `i` fora de `0…7` |
| 503 | `{"error":"multiplayer_unavailable"}` | `/api/room` sem o binding `ROOMS` |
| 500 | `{"error":"internal"}` | exceção; log `api_error <rota> <tipo>` |

## Ver também

[architecture.md](architecture.md) · [storage.md](storage.md)
