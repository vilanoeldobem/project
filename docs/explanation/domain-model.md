# Modelo de domínio

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `apps/web/src/game/`, `migrations/`, doc 19 do repositório de documentação

## Entidades

| Entidade | O que é | Onde |
|---|---|---|
| **Vila** | O mundo; cresce por ruas conforme ocupação aprovada (DEC-035) | `world.ts` |
| **Praça** | Centro; doação global, indicadores, três entradas (DEC-026) | cena |
| **Terreno (lot)** | Espaço que uma ONG aprovada ocupa | `lots` |
| **Casa da ONG** | Terreno publicado; descrição, projetos, minijogo, doação para a ONG (DEC-028/029) | `ngos` + `lots` |
| **ONG** | Organização com CNPJ ativo, ≥ 1 ano, meio confiável de confirmar valores (DEC-015) | `ngos` |
| **Instituição parceira** | Única destinatária da doação global; decide a destinação (DEC-010..013). *A definir* (PEN-004) | — |
| **Missão** | Objetivo em uma trilha; concede XP uma vez (DEC-039/042) | `progress.ts` |
| **Evento de missão** | Ocorrência com id único (`missão:evento`) | `Progress.seen` |
| **Badge / Título** | Reconhecimento por doação confirmada (DEC-041). Não implementado | — |

## Invariantes

1. Doação global → uma instituição; nunca rateada entre ONGs da Vila.
2. Só aprovação de admin publica uma casa; toda decisão de admin é auditada.
3. Um evento de missão conta uma vez; missão concluída concede XP uma vez.
4. Doação sozinha não concede XP; doação confirmada soma ao Badge uma vez; estorno reduz.
5. Níveis alcançáveis sem doar.
6. Clique em Pix/QR nunca é doação confirmada.

## Estados do terreno (DEC-028)

`available` → `application_sent` → `under_review` → `published` (ou volta a `available` se rejeitado).

## Estados da ONG

`submitted` → `under_review` → (`changes_requested` → `under_review`) → `published` | `rejected`.

## Estados da doação (proposta, dossiê §9.4 — não implementado)

iniciada → pendente → confirmada → liquidada → destinada/transferida → conciliada | devolvida | contestada.

## Glossário

- **Rota A / Rota B (entrega)**: escopo integral × núcleo do doc 23. Não confundir com **Rota A "Vila Acesa"** (visual, DEC-023).
- **CONFIRMADO / PROPOSTA / HIPÓTESE / PENDENTE**: estados das afirmações do produto.

## Ver também

[design-principles.md](design-principles.md) · [reference/storage.md](../reference/storage.md)
