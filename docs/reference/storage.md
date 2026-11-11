# Armazenamento (D1)

> **Status:** contas em revisão (Unreleased) · **Schema D1:** v4 local; sem migration remota nesta entrega ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `migrations/`

Banco D1 `vilanoeldobem`, binding `DB`. A última migration disponível é **v4**; existência do arquivo não comprova aplicação no remoto.

## 1. Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_initial.sql` | tabelas `ongs` (nome antigo), `lots`, `audit_events` e índices |
| `0002_seed_lots.sql` | 8 terrenos `praca-01..08` disponíveis (estrutura do mundo, não dados fictícios) |
| `0003_english_schema.sql` | nomes em inglês: `ongs` → `ngos`, `ong_id` → `ngo_id`, estados e ids (`praca-NN` → `plaza-NN`); dados migrados ([IMPL-0004](../decisions/0004-english-code-portuguese-docs.md)) |
| `0004_accounts.sql` | contas verificadas, links pendentes, sessões, limites de abuso e caixa de teste exclusivamente local ([IMPL-0007](../decisions/0007-optional-magic-link-accounts.md)) |

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
| `x`, `z` | REAL | posição no mundo; espelha `LOTS` em `world.ts` |
| `state` | TEXT | `available`, `application_sent`, `under_review`, `published` (DEC-028) |
| `ngo_id` | TEXT FK → ngos | |

### audit_events

`id`, `at`, `actor` (id do admin, nunca e-mail), `action` (ex.: `ong.approve`), `subject`, `detail` (JSON sem dados pessoais).

## 3. Dados que **não** ficam no D1 nesta versão

Progresso de missões/XP (só `localStorage` do navegador, chave `vila.progress.v2`) e pagamentos.
Logs de pagamento ficarão separados dos dados de gamificação (dossiê §13).

## 4. Contas — schema v4, teste local

| Tabela | Conteúdo e integridade |
|---|---|
| `auth_users` | UUID, e-mail e nickname únicos `COLLATE NOCASE`, nome, cidade, `verified_at`; conta só existe após confirmação |
| `auth_links` | `token_hash` SHA-256, `browser_hash` SHA-256, e-mail e campos pendentes de cadastro (nulos em login), `expires_at` |
| `auth_sessions` | hash de token, FK `user_id` com exclusão em cascata, `expires_at` |
| `auth_rate_limits` | chave de sujeito derivada por SHA-256 + janela temporal, contador atômico, `expires_at` |
| `auth_local_outbox` | link bruto de teste, destinatário, criação; FK do link com exclusão em cascata; nunca exposta via HTTP |

Tempos dessas tabelas são segundos Unix. Link e vínculo do navegador duram 15 minutos; sessão, 7 dias.
Pedido de cadastro não reserva nickname: a restrição UNIQUE decide na confirmação e o batch completo é revertido
em colisão. Um cadastro com e-mail já verificado apenas autentica o dono, sem alterar seus campos.

Limites: 3 pedidos/e-mail/15 minutos, 10 pedidos/IP/minuto e 30 confirmações/IP/minuto, em janelas fixas.
A limpeza em pedidos/confirmações remove links, sessões e contadores vencidos; não há tarefa agendada nesta entrega.
Hashes de e-mail/IP para limitação não são anonimização e não devem ser expostos. A retenção definitiva para
produção e o processo de exclusão de conta ainda exigem revisão antes da ativação pública.

Nome, cidade e e-mail só saem na sessão autenticada do próprio usuário. Não há listagem pública de perfis.
Somente o nickname poderá ser público em futuras funcionalidades. Use dados fictícios no D1 local.

## Ver também

[api.md](api.md) · [guides/deploy.md](../guides/deploy.md)
