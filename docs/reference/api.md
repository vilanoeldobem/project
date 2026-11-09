# API HTTP

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `apps/web/worker/api.ts`, `apps/web/worker/api.test.ts`

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

## Erros

| Status | Corpo | Quando |
|---|---|---|
| 404 | `{"error":"not_found"}` | rota `/api/*` desconhecida |
| 405 | `{"error":"method_not_allowed"}` | método diferente de GET/HEAD |
| 503 | `{"error":"db_unavailable"}` | `/api/lots` sem binding D1 |
| 500 | `{"error":"internal"}` | exceção; log `api_error <rota> <tipo>` |

## Ver também

[architecture.md](architecture.md) · [storage.md](storage.md)
