# Armazenamento (D1)

> **Status:** Implementação para revisão · **Versão do software:** 0.4.0 · **Última migration nesta branch:** 0007 ·
> **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `migrations/`, `apps/api/wrangler.jsonc`, `apps/api/src/{auth,session,ngo,admin}.ts`

Banco D1 `vilanoeldobem`, binding `DB`, ligado só ao Worker da API (`apps/api`,
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)). O histórico de arquivos aplicados identifica o schema
real; o número mais alto não comprova que migrations de branches paralelas já foram instaladas.
Migrations locais: `pnpm db:migrate:local`; remotas: `pnpm --filter @vila/api db:migrate:remote`
(com autorização).

## 1. Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_initial.sql` | tabelas `ongs` (nome antigo), `lots`, `audit_events` e índices |
| `0002_seed_lots.sql` | 8 terrenos `praca-01..08` disponíveis (estrutura do mundo, não dados fictícios) |
| `0003_english_schema.sql` | nomes em inglês: `ongs` → `ngos`, `ong_id` → `ngo_id`, estados e ids (`praca-NN` → `plaza-NN`); dados migrados ([IMPL-0004](../decisions/0004-english-code-portuguese-docs.md)) |
| `0004_accounts_ngo_applications.sql` | contas (`users`), links (`login_tokens`), `sessions`, `progress_events` e colunas da candidatura em `ngos` ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)) |
| `0005_one_active_application.sql` | índice único parcial: no máximo uma candidatura ativa por pessoa (`submitted`, `under_review`, `changes_requested`, `published`) |
| `0007_progress_write_guard.sql` | revisão por conta e token da gravação de progresso; requer somente as tabelas de `0004` ([IMPL-0018](../decisions/0018-progress-concurrency-and-acknowledgment.md)) |

Regras: imutáveis depois de aplicadas no remoto; identificadores únicos e ordenados; nada de `IF NOT EXISTS` sobre
tabela existente. `0006` está reservado à entrega de fotos do PR #29. `0007` é independente dela: esta branch e sua
prova local aplicam `0001`–`0005` + `0007`; não instalam fotos e não executam nenhuma migration remota.

## 2. Tabelas

### ngos

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | |
| `cnpj` | TEXT UNIQUE | só dígitos, com dígitos verificadores conferidos (critério 1, DEC-015) |
| `cnpj_opened_on` | TEXT | `YYYY-MM-DD` (critério 2, ≥ 1 ano; medida PROPOSTA, PEN-013) |
| `summary` | TEXT | aparece na casa publicada |
| `status` | TEXT | `submitted` → `under_review` → (`changes_requested`) → `published` \| `rejected` |
| `revision` | INTEGER > 0 | sobe a cada reenvio da candidatura |
| `created_at`, `updated_at` | TEXT | RFC 3339 UTC com milissegundos |
| `applicant_id` | TEXT FK → users, `ON DELETE SET NULL` | v4; conta que enviou; some se a conta for excluída |
| `city` | TEXT | v4; cidade da sede |
| `description` | TEXT | v4 |
| `funds_confirmation` | TEXT | v4; como os recursos podem ser confirmados (DEC-015, critério 3) |
| `declarations` | TEXT (JSON) | v4; `{activeCnpj, oneYear, fundsConfirmable}` declarados |
| `tags` | TEXT (JSON) | v4; ids das áreas de atuação (DEC-028) |
| `projects` | TEXT (JSON) | v4; `[{title, description}]`, até 3 (DEC-028) |
| `requested_lot_id` | TEXT FK → lots | v4; terreno pedido |
| `review_note` | TEXT | v4; mensagem da administração à organização (ajustes ou rejeição) |

Índice v4: `idx_ngos_applicant (applicant_id)`. Dados de organização, não pessoais.

### lots

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | `<street>-<NN>`, ex.: `plaza-01` |
| `street`, `slot` | TEXT, INTEGER | únicos juntos |
| `x`, `z` | REAL | posição no mundo; espelha `LOTS` em `packages/shared/src/game/world.ts` |
| `state` | TEXT | `available`, `application_sent`, `under_review`, `published` (DEC-028); ver transições em [api.md](api.md#análise-administrativa-dec-037) |
| `ngo_id` | TEXT FK → ngos | candidatura que reserva ou ocupa o terreno |

### users (v4)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | Nome (P13) |
| `nickname` | TEXT | Nickname como digitado; **único dado público** |
| `nickname_key` | TEXT UNIQUE | nickname em minúsculas (unicidade sem diferenciar maiúsculas) |
| `city` | TEXT | Cidade (P13) |
| `email` | TEXT UNIQUE | E-mail em minúsculas; nunca público, nunca em log |
| `role` | TEXT | `player` (padrão) ou `admin` (concedido à mão, DEC-037) |
| `verified_at` | TEXT | preenchido pelo primeiro link confirmado |
| `created_at` | TEXT | RFC 3339 UTC |

### login_tokens (v4)

`token_hash` (PK, SHA-256 hex do token do link), `user_id` (FK → users, `ON DELETE CASCADE`), `expires_at`,
`used_at`, `created_at`. Índice `(user_id, created_at)` para o limite de 3 links por 15 minutos.

### sessions (v4)

`token_hash` (PK, SHA-256 hex do cookie `__Host-vila_session`), `user_id` (FK → users, `ON DELETE CASCADE`), `expires_at`,
`created_at`. Índice `(user_id)`.

### progress_events (v4)

| Coluna | Tipo | Notas |
|---|---|---|
| `user_id` | TEXT FK → users, `ON DELETE CASCADE` | |
| `mission_id` | TEXT | id de `MISSIONS` |
| `event_id` | TEXT | id estável do evento (`/^[A-Za-z0-9:_.-]{1,64}$/`) |
| `created_at` | TEXT | ordem de repetição |

Chave primária `(user_id, mission_id, event_id)`: evento repetido não muda nada (DEC-042). Replay usa
`ORDER BY created_at,rowid`. Novas gravações usam timestamp igual ou maior que o último da conta; empates preservam
a ordem de inserção. Eventos de quest já aceitos não são substituídos; apenas linha legada ignorada pelo replay pode
ser reposicionada após reenvio agora válido. Essa recuperação não concede XP extra nem muda o catálogo.

### progress_writes (0007)

`user_id` (PK e FK → users, `ON DELETE CASCADE`), `revision` (inteiro ≥ 0) e `write_token` (UUID da última gravação).
A linha é criada sob demanda, sem duplicar dados pessoais. Uma consulta única lê revisão e eventos. A transação
D1 só troca a revisão esperada; todos os eventos do lote exigem o token exclusivo da tentativa vencedora. Uma
tentativa que perde a corrida não grava eventos, e uma falha de SQL desfaz tanto a revisão quanto o lote inteiro.

Não há mutex em memória nem estado persistido em Durable Object. Todos os escritores de progresso precisam passar
pelo protocolo; escrita manual em `progress_events` ou execução concorrente do Worker antigo não recebe essa
garantia. Antes de ativar, aplicar a migration autorizada e garantir que não há escritores legados ativos.

Limite de 500 eventos considera novas chaves distintas, sem cobrar reenvios ou reposicionamento de linha legada.
A API tenta novamente até três vezes após conflito de revisão. Eventos válidos podem ser persistidos mesmo quando
outro evento do lote ainda exige `409 progress_pending`; contrato de reenvio em [api.md](api.md).

### audit_events

`id`, `at`, `actor` (id da conta que agiu, nunca e-mail), `action`, `subject`, `detail` (JSON sem dados pessoais).

| `action` | `actor` | `subject` | `detail` |
|---|---|---|---|
| `ngo.submit`, `ngo.resubmit` | quem enviou | `ngo:<id>` | `{lot, revision}` |
| `ngo.start_review`, `ngo.approve`, `ngo.request_changes`, `ngo.reject` | admin | `ngo:<id>` | `{from, to, lot, revision, hasNote}` (sem o texto da mensagem) |
| `user.delete` | a própria conta | `user:<id>` | `NULL` |

Lida pelo painel administrativo em `GET /admin/audit` (o autor aparece pelo nickname; consultar não grava nada
aqui: só mutações são auditadas — [IMPL-0015](../decisions/0015-dash-backoffice-app.md)).

## 3. Dados pessoais e retenção

Dados pessoais guardados (P13, DEC-038): **Nome, Nickname, Cidade e E-mail**, só na tabela `users`. Só o nickname
aparece para outras pessoas (inclusive para o admin, que vê quem enviou a candidatura só pelo nickname). A lista de
contas do painel administrativo (`GET /admin/users`) traz nickname, papel, cidade, data de criação e se a conta foi
verificada — nunca e-mail ou nome. Tokens e
sessões ficam só como hash. IP é usado apenas como chave do limite de requisições (`AUTH_LIMITER`) e não é gravado.
Logs nunca recebem corpo de requisição, e-mail, token ou CNPJ.

| Dado | Retenção (PROPOSTA, a confirmar na revisão LGPD / ECA Digital) |
|---|---|
| Cadastro não confirmado | apagado depois de 24 h (na próxima chamada de cadastro) |
| Link de acesso | válido por 15 min, uso único; a linha fica até a conta ser excluída |
| Sessão | 30 dias; sessões vencidas da conta são apagadas no próximo login; logout apaga a sessão |
| Conta, sessões, links, eventos de missão | apagados em `DELETE /me` |
| Candidatura de ONG e `audit_events` | ficam após a exclusão da conta, sem o vínculo `applicant_id` |

## 4. Dados que **não** ficam no D1 nesta versão

Progresso de visitantes sem conta (só `localStorage` do navegador, chave `vila.progress.v2`; migra para
`progress_events` ao entrar e é apagado do navegador; o progresso de uma conta nunca é gravado nessa chave, e eventos
ainda não enviados ficam em `vila.pending.v1:<id da conta>`, só ids de missão/evento; preferências do navegador: visual `vila.look.v1` e zoom da câmera `vila.zoom.v1`), documentos de ONG (sem upload nesta versão), pagamentos. Logs de pagamento ficarão
separados dos dados de gamificação (dossiê §13).

## Ver também

[api.md](api.md) · [guides/deploy.md](../guides/deploy.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)
