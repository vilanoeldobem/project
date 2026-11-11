# Armazenamento (D1)

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `migrations/`, `apps/api/wrangler.jsonc`

Banco D1 `vilanoeldobem`, binding `DB`, ligado só ao Worker da API (`apps/api`,
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)). Versão do schema = número da última migration
(**v3**; v4 disponível para teste local, sem aplicação remota nesta entrega). Migrations locais: `pnpm db:migrate:local`; remotas: `pnpm --filter @vila/api db:migrate:remote`
(com autorização).

## 1. Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_initial.sql` | tabelas `ongs` (nome antigo), `lots`, `audit_events` e índices |
| `0002_seed_lots.sql` | 8 terrenos `praca-01..08` disponíveis (estrutura do mundo, não dados fictícios) |
| `0004_accounts.sql` | contas verificadas, links, sessões, limites e caixa exclusivamente local (IMPL-0011) |
| `0003_english_schema.sql` | nomes em inglês: `ongs` → `ngos`, `ong_id` → `ngo_id`, estados e ids (`praca-NN` → `plaza-NN`); dados migrados ([IMPL-0004](../decisions/0004-english-code-portuguese-docs.md)) |

Regras: imutáveis depois de aplicadas no remoto; números sequenciais; nada de `IF NOT EXISTS` sobre tabela existente.

## 2. Tabelas

### ngos

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | |
| `cnpj` | TEXT UNIQUE | só dígitos (critério 1, DEC-015) |
| `cnpj_opened_on` | TEXT | `YYYY-MM-DD` (critério 2, ≥ 1 ano) |
| `summary` | TEXT | |
| `status` | TEXT | `submitted` → `under_review` → (`changes_requested`) → `published` \| `rejected` |
| `revision` | INTEGER > 0 | compare-and-swap em edições de admin |
| `created_at`, `updated_at` | TEXT | RFC 3339 UTC com milissegundos |

### lots

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | `<street>-<NN>`, ex.: `plaza-01` |
| `street`, `slot` | TEXT, INTEGER | únicos juntos |
| `x`, `z` | REAL | posição no mundo; espelha `LOTS` em `packages/shared/src/game/world.ts` |
| `state` | TEXT | `available`, `application_sent`, `under_review`, `published` (DEC-028) |
| `ngo_id` | TEXT FK → ngos | |

### audit_events

`id`, `at`, `actor` (id do admin, nunca e-mail), `action` (ex.: `ong.approve`), `subject`, `detail` (JSON sem dados pessoais).

## 3. Dados que **não** ficam no D1 nesta versão

Progresso de missões/XP (só `localStorage` do navegador, chave `vila.progress.v2`), dados de usuários, pagamentos.
Logs de pagamento ficarão separados dos dados de gamificação (dossiê §13).

## Ver também

[api.md](api.md) · [guides/deploy.md](../guides/deploy.md)

## Contas - migration v4 para revisão

`auth_users`: id, e-mail/nickname únicos (COLLATE NOCASE), nome, cidade e instante de verificação.
`auth_links`: hash do token e vínculo do navegador, dados pendentes e validade. `auth_sessions`: hash, FK do usuário,
validade. `auth_rate_limits`: sujeito derivado por hash, janela e contador atômico. `auth_local_outbox`: link bruto de
somente teste, removido em cascata com o link; nunca exposto por HTTP e nunca usado como entrega pública.

Tempos em segundos Unix. Novos pedidos/confirmações limpam links/sessões/limites vencidos. Hashes de IP/e-mail
não são anonimização. Não há listagem pública de usuários; dados pessoais saem somente na própria sessão.
Aplicação de migration não significa autenticação pública habilitada. Retenção/exclusão e envio real devem ser
revistos antes da produção. O banco continua pertencendo exclusivamente à API, não ao cliente ou presença.
