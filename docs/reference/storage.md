# Armazenamento (D1)

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 em produção / v6 em homologação ·
> **Atualizado em:** 2026-11-11
> **Fonte de verdade:** `migrations/`, `apps/api/wrangler.jsonc`

Banco D1 `vilanoeldobem`, binding `DB`, ligado só ao Worker da API (`apps/api`,
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)). Versão do schema = número da última migration
(**v3** em produção; **v6** aplicada somente em homologação isolada). Migrations locais: `pnpm db:migrate:local`; remotas: `pnpm --filter @vila/api db:migrate:remote`
(com autorização).

## 1. Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_initial.sql` | tabelas `ongs` (nome antigo), `lots`, `audit_events` e índices |
| `0002_seed_lots.sql` | 8 terrenos `praca-01..08` disponíveis (estrutura do mundo, não dados fictícios) |
| `0003_english_schema.sql` | nomes em inglês: `ongs` → `ngos`, `ong_id` → `ngo_id`, estados e ids (`praca-NN` → `plaza-NN`); dados migrados ([IMPL-0004](../decisions/0004-english-code-portuguese-docs.md)) |
| `0004_accounts.sql` | contas verificadas, links, sessões, limites e caixa exclusivamente local (IMPL-0011) |
| `0005_player_progress.sql` | progresso por usuário, JSON, revisão CAS e marca de importação (IMPL-0012) |
| `0006_ngo_applications.sql` | candidatura privada por ONG, dono, terreno solicitado e marcador de revisão (IMPL-0013) |

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

Progresso de visitante (`localStorage`, chave `vila.progress.v2`) e pagamentos. Contas e progresso de conta possuem migrations aditivas em revisão, descritas abaixo.
Logs de pagamento ficarão separados dos dados de gamificação (dossiê §13).

## Ver também

[Banco de homologação](../guides/staging-database.md) - D1 isolado com migrations 0001-0006 verificadas; produção continua em v3 nesta entrega.

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

## Progresso por conta - v5 em homologação

`0005_player_progress.sql` adiciona `player_progress`: `user_id` PK/FK de auth_users com exclusão em cascata,
`state_json` JSON válido, `revision` não negativa, `guest_imported_at` e created_at/updated_at em segundos Unix.
Progresso é calculado pelo servidor. Importação e atualização de revisão ocorrem na mesma escrita condicional;
requisições concorrentes releem o estado antes de tentar novamente. Não há tabelas de progresso em Durable Objects.

Aplicação v5 e integridade foram conferidas no D1 de homologação; produção continua em v3, sem autenticação pública. O visitante continua no localStorage; a conta usa D1,
com cache/fila local isolados por ID para retomada offline. Cookies não são persistidos nesse cache.

## Candidatura de ONG - v6 em homologação

`0006_ngo_applications.sql` adiciona `ngo_applications`: id, ngo_id único/FK de ngos, owner_id/FK da conta,
requested_lot_id/FK do terreno, feedback privado e mutation_id. Status/revisão/dados permanecem em ngos.
Índice por proprietário permite listar somente suas candidaturas. O terreno solicitado não é reservado
antes da aprovação, uma PROPOSTA local que precisa de ratificação.

O marcador exclusivo da mutação só é escrito se estado/revisão e, ao aprovar, terreno livre coincidirem.
Todas as escritas dependentes de terreno, publicação e auditoria exigem o marcador daquela tentativa.
Isso evita efeitos parciais por comandos D1 que atualizam zero linhas sem lançar exceção. Erros SQL reais
revertem o batch inteiro. Ator e atestações podem entrar na auditoria, mas feedback/CNPJ/apresentação não.
Nenhuma tabela de documentos, upload ou storage externo faz parte desta migration.
V6 aplicada e conferida somente no D1 isolado de homologação, com dados sintéticos removidos após os testes. Produção permanece em v3; não existe API pública de homologação nem administrador real configurado. Migrations anteriores foram preservadas.
