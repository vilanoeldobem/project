# Armazenamento (D1 e R2)

> **Status:** Implementado, contas desligadas em produção · **Versão do software:** 0.4.0 · **Schema D1:** v11 ·
> **Atualizado em:** 2026-11-13
> **Fonte de verdade:** `migrations/`, `apps/api/wrangler.jsonc`, `apps/api/src/{auth,session,progress,ngo,admin,files,ngo-photos,media-storage,ngo-withdrawal,account-moderation,presence-moderation}.ts`

Banco D1 `vilanoeldobem`, binding `DB`, ligado só ao Worker da API (`apps/api`,
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)). Versão do schema = número da última migration
(**v10 no código**; último estado registrado de produção: v3). O histórico aplicado identifica o schema real e
deve corresponder ao código publicado. Migrations locais: `pnpm db:migrate:local`; remotas: `pnpm --filter @vila/api db:migrate:remote`
(com autorização).

Arquivos das candidaturas de ONG (logo e documentos) ficam fora do D1, num bucket R2 privado: ver
[§ 5](#5-arquivos-no-r2-impl-0017).

## 1. Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_initial.sql` | tabelas `ongs` (nome antigo), `lots`, `audit_events` e índices |
| `0002_seed_lots.sql` | 8 terrenos `praca-01..08` disponíveis (estrutura do mundo, não dados fictícios) |
| `0003_english_schema.sql` | nomes em inglês: `ongs` → `ngos`, `ong_id` → `ngo_id`, estados e ids (`praca-NN` → `plaza-NN`); dados migrados ([IMPL-0004](../decisions/0004-english-code-portuguese-docs.md)) |
| `0004_accounts_ngo_applications.sql` | contas (`users`), links (`login_tokens`), `sessions`, `progress_events` e colunas da candidatura em `ngos` ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)) |
| `0005_one_active_application.sql` | índice único parcial: no máximo uma candidatura ativa por pessoa (`submitted`, `under_review`, `changes_requested`, `published`) |
| `0006_ngo_files.sql` | tabela `ngo_files`: metadados dos arquivos das candidaturas guardados no R2 ([IMPL-0017](../decisions/0017-ngo-files-r2.md)) |
| `0007_ngo_media_reconciliation.sql` | galeria `ngo_photos`, registro `media_upload_intents`, token de escrita `ngos.file_write_token` e intenção durável `users.files_deleting` (IMPL-0018) |
| `0008_progress_write_guard.sql` | revisão por conta e token da gravação de progresso; requer as tabelas de `0004` ([IMPL-0019](../decisions/0019-progress-concurrency-and-acknowledgment.md)) |
| `0009_ngo_withdrawals.sql` | tabela `ngo_withdrawals`: registro das retiradas administrativas de ONG publicada (**PROPOSTA**, [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)); aditiva, só requer `ngos` |
| `0010_account_blocks.sql` | colunas `users.blocked` e `users.moderation_token`, registro `account_blocks` e bilhetes `moderation_tickets` ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md); bloqueio e remoção de visitante são **PROPOSTA**); aditiva, requer as tabelas de `0004` |

| `0011_village_expansion.sql` | expansão da Vila ([IMPL-0023](../decisions/0023-village-expansion-and-zoning.md), **PROPOSTA**): move os 8 terrenos de `lots` para a fachada da praça (mesmos ids, estado e ONG), acrescenta `plaza-09`…`plaza-12` e cria `residential_plots` com os 112 terrenos residenciais; aditiva, requer `users` (0004) |

Esta versão contém 0001–0011, sem lacunas. A 0006 mantém o contrato canônico de arquivos; a 0007 acrescenta a
galeria e os guardas de conciliação; a 0008 protege a gravação concorrente de progresso; a 0009 registra as
retiradas. A 0007 chamava-se 0010
enquanto estava em revisão: nunca foi aplicada no remoto e recebeu o próximo número livre antes de integrar.
Simuladores locais com a antiga 0010 são bases alternativas: usar nova base isolada, sem renomear seu histórico
ou apagá-los.
A 0007 é pré-requisito do código conciliado mesmo com flags desligadas (sessão e decisões leem colunas novas).
Os fallbacks públicos do #32 para ausência de `ngo_files` permanecem: `/lots` responde sem logo e a rota de logo
responde 404. Eles não dispensam a migration 0007 para usar as rotas privadas conciliadas.
Operações de conta que encontrem ausência das novas colunas retornam `503 schema_outdated`; isso não substitui
a preparação do esquema nem bloqueia endpoints de autenticação que não consultam essas colunas.
A 0009 é pré-requisito das rotas de candidatura e de análise mesmo com `NGO_WITHDRAWAL_ENABLED` desligada: sem
ela essas rotas respondem `503 schema_outdated`. **Nenhuma rota pública lê `ngo_withdrawals`**: `/lots`,
`/indicators`, `/ngos/:id`, logo e fotos respondem igual nos schemas v3 a v10 (com as contas ligadas, a migration
vem antes da API; ver [deploy §3](../guides/deploy.md#3-aplicar-migrations-remotas)).
A 0010 é pré-requisito de **toda rota que lê a sessão**, com qualquer combinação de bandeiras: a conferência da
sessão lê `users.blocked`. Sem ela, com as contas ligadas, essas rotas e as três rotas de entrada (cadastro, pedido
e confirmação do link) respondem `503 schema_outdated` sem gravar nada. Nenhuma rota pública lê `users.blocked`,
`account_blocks` ou `moderation_tickets`.

Regras: imutáveis depois de aplicadas no remoto; números sequenciais; nada de `IF NOT EXISTS` sobre tabela existente.

## 2. Tabelas

### ngos

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | |
| `cnpj` | TEXT UNIQUE | só dígitos, com dígitos verificadores conferidos (critério 1, DEC-015) |
| `cnpj_opened_on` | TEXT | `YYYY-MM-DD` (critério 2, ≥ 1 ano; medida PROPOSTA, PEN-013) |
| `summary` | TEXT | aparece na casa publicada |
| `status` | TEXT | `submitted` → `under_review` → (`changes_requested`) → `published` \| `rejected`. Uma ONG retirada (PROPOSTA, IMPL-0020) **continua `published` aqui**; o registro em `ngo_withdrawals` é que a marca, e as respostas privadas mostram `withdrawn` |
| `revision` | INTEGER > 0 | sobe a cada reenvio, envio/remoção de arquivo, retirada e exclusão da conta responsável |
| `file_write_token` | TEXT | v7; token exclusivo da escrita/decisão vencedora, usado para condicionar efeitos e auditoria |
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

### ngo_files (v6)

Metadados dos arquivos de uma candidatura ([IMPL-0017](../decisions/0017-ngo-files-r2.md)); os bytes ficam no R2.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID; a chave no R2 é `ngo/<ngo_id>/<id>` |
| `ngo_id` | TEXT FK → ngos | sem `ON DELETE`: uma ONG com arquivos não pode ser apagada |
| `kind` | TEXT | `logo` ou `document` |
| `content_type` | TEXT | `image/png`, `image/jpeg` ou `application/pdf` |
| `size` | INTEGER > 0 | bytes guardados (imagens já sem os metadados conhecidos) |
| `uploaded_by` | TEXT FK → users, `ON DELETE SET NULL` | conta que enviou |
| `created_at` | TEXT | RFC 3339 UTC com milissegundos |

Índices: `idx_ngo_files_ngo (ngo_id, kind, created_at)`; `idx_ngo_files_one_logo`, único parcial em `ngo_id` onde
`kind = 'logo'` (um logo por ONG). **Não há coluna de nome de arquivo.**

### ngo_photos (v7, PROPOSTA)

Galeria institucional no **mesmo bucket `FILES`**, com chave `ngo-photos/<ngo_id>/<photo_id>`; não substitui o
logo em `ngo_files`. Colunas: `id`, `ngo_id` (FK sem cascata, como `ngo_files`), `object_key` único, `content_type` PNG/JPEG,
`byte_size` (1–2097152), `caption` (até 240), `position` (0–9), `status` (`pending|approved|rejected|removed`),
`revision`, `decision_token` único, `upload_pending`, `cleanup_pending`, `created_at`, `updated_at`.
Índice `(ngo_id,status,position,id)`. A intenção de upload existe antes dos bytes; `upload_pending=1` não pode
ser publicado. Remoção/rejeição limpa legenda e revoga acesso antes da limpeza R2; falha mantém
`cleanup_pending=1` para nova tentativa. Limite de 10 pendentes/aprovadas é conferido no INSERT; rejeitadas não
consomem cota. Nenhuma chave contém nome/legenda. A FK impede apagar a ONG enquanto houver metadados
de fotos: remover bytes e registros explicitamente antes de excluir uma ONG evita perder a referência ao R2.

### media_upload_intents (v7)

Registro de upload/limpeza de logo e comprovantes; a galeria usa os marcadores na própria `ngo_photos`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | id gerado para o arquivo; chave R2 derivada `ngo/<ngo_id>/<id>` |
| `ngo_id` | TEXT FK → ngos | impede apagar a ONG enquanto houver intenção pendente |
| `uploaded_by` | TEXT NOT NULL | id interno da conta; sem cascade que apague o rastro antes da limpeza |
| `created_at` | TEXT | RFC 3339 UTC; instante usado para recuperar uploads abandonados |
| `cleanup_pending` | INTEGER 0/1 | 0 durante envio; 1 impede finalização e solicita limpeza |

Índice `idx_media_upload_intents_ngo (ngo_id,cleanup_pending,created_at)`. Sem nomes, chaves redundantes ou
metadados duplicados do arquivo. A intenção precede R2 e é apagada na transação que publica os metadados em
`ngo_files`, ou depois de excluir o objeto. Remoção/substituição cria a intenção na mesma transação que remove
o metadado antigo. `DELETE /me` limpa as chaves e depois apaga as intenções da conta.

### ngo_withdrawals (v9, PROPOSTA)

Registro das retiradas administrativas de ONG publicada ([IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)).
**PROPOSTA**: só recebe linhas com `NGO_WITHDRAWAL_ENABLED = "true"` (desligada em produção e homologação); o
que a retirada significa é PENDENTE ([OQ-14](../decisions/open-questions.md)).

| Coluna | Tipo | Notas |
|---|---|---|
| `ngo_id` | TEXT PK, FK → ngos | uma retirada por ONG; sem cascata (o registro impede apagar a ONG) |
| `operation_token` | TEXT UNIQUE | token exclusivo do pedido: revisão, terrenos e auditoria só valem para quem inseriu a linha |
| `reason` | TEXT, 10–1000 caracteres | **mensagem para a organização**, mostrada ao responsável como foi escrita; não é anotação interna |
| `actor` | TEXT | id do admin (nunca e-mail); sem FK, como `audit_events.actor` |
| `withdrawn_at` | TEXT | RFC 3339 UTC |
| `revision` | INTEGER > 1 | revisão da ONG logo depois da retirada (remoções posteriores de arquivo continuam subindo `ngos.revision`) |
| `lot_ids` | TEXT (JSON) | ids dos terrenos liberados; pode ser `[]` |

Uma transação: a linha só é inserida se a ONG ainda estiver `published`, na revisão lida, sem retirada anterior e
sem exclusão de conta pendente; as instruções seguintes conferem o token e incrementam a revisão, liberam **todas
as associações atuais** em `lots` (`available`, `ngo_id = NULL`) e gravam a auditoria. Quem perde a disputa não
altera nada; falha em qualquer instrução desfaz tudo. `requested_lot_id`, `review_note`, arquivos, fotos e
progresso não são tocados.

O que decorre do desenho, **a ratificar ou mudar na OQ-14**: `ngos.status` continua `published`, então a linha
segura a vaga do índice único da 0005 (a conta do responsável não envia outra candidatura) e o CNPJ continua em
uso; não há rota nem instrução que apague ou desfaça o registro; ele e a mensagem ficam mesmo depois que a conta
do responsável é excluída. Não remova linhas ou a tabela como "rollback": depois de existir uma retirada, uma
versão anterior da API mostraria a organização como publicada nas telas privadas e a contaria de novo no
indicador público.

As leituras públicas não consultam esta tabela (exigem o terreno publicado, que a retirada libera). As rotas de
candidatura e de análise a consultam para projetar `withdrawn` e recusar envios; ver
[api.md](api.md#retirada-administrativa-de-ong-publicada-impl-0020-proposta).

### lots

Só terrenos reservados a ONGs aprovadas (DEC-028): 8 até a v10, 12 a partir da v11 (a 0011 move os oito primeiros
para a fachada da praça sem tocar em `state` nem em `ngo_id`).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | `<street>-<NN>`, ex.: `plaza-01` |
| `street`, `slot` | TEXT, INTEGER | únicos juntos |
| `x`, `z` | REAL | posição no mundo; espelha `LOTS` em `packages/shared/src/game/world.ts` |
| `state` | TEXT | `available`, `application_sent`, `under_review`, `published` (DEC-028); ver transições em [api.md](api.md#análise-administrativa-dec-037) |
| `ngo_id` | TEXT FK → ngos | candidatura que reserva ou ocupa o terreno |

### residential_plots (v11, PROPOSTA)

Terrenos residenciais ([IMPL-0023](../decisions/0023-village-expansion-and-zoning.md)). Estrutura do mundo, como
`lots`: as 112 linhas vêm da migração e espelham `RESIDENTIAL_PLOTS` em `packages/shared/src/game/world.ts`
(testes conferem linha a linha, no texto da migração e no banco migrado). **A posse está desligada**
(`RESIDENTIAL_PLOTS_ENABLED = "false"`, [OQ-16](../decisions/open-questions.md)): nada grava `owner_id` nem
`claimed_at`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | `<faixa>-<NN>`, ex.: `premium-01`, `standard-32`, `economy-64` |
| `tier` | TEXT | `premium`, `standard` ou `economy` |
| `slot` | INTEGER | posição dentro da faixa; único com `tier` |
| `x`, `z` | REAL | centro do terreno |
| `facing` | REAL | rotação (rad) para a rua em frente |
| `owner_id` | TEXT FK → users, `ON DELETE SET NULL` | sempre `NULL` nesta versão; nunca sai pela API |
| `claimed_at` | TEXT | sempre `NULL` nesta versão |

Não há coluna de preço: o que uma faixa exige é um requisito no código (`VILLAGE_PLAN`), nunca um valor. Dado
pessoal: nenhum enquanto `owner_id` for nulo; se a posse for ligada, `owner_id` liga um terreno a uma conta e a
exclusão da conta o libera.

### users (v4)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | Nome (P13) |
| `nickname` | TEXT | Nickname como digitado; **único dado público** |
| `nickname_key` | TEXT UNIQUE | nickname em minúsculas (unicidade sem diferenciar maiúsculas) |
| `city` | TEXT | Cidade (P13) |
| `email` | TEXT UNIQUE | E-mail em minúsculas; nunca público, nunca em log |
| `role` | TEXT | `player` (a interface mostra "Padrão") ou `admin` ("Administrador"). O primeiro administrador é criado à mão; os demais, pelo painel ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md), DEC-037) |
| `verified_at` | TEXT | preenchido pelo primeiro link confirmado |
| `files_deleting` | INTEGER 0/1 | v7; intenção durável de exclusão, impede alterações de evidências durante limpeza R2 |
| `blocked` | INTEGER 0/1 | v10, **PROPOSTA**; `1` enquanto há um bloqueio em vigor em `account_blocks`. Lida em toda conferência de sessão; muda no mesmo batch do registro |
| `moderation_token` | TEXT | v10; UUID da última mudança de papel, bloqueio ou desbloqueio: só a requisição vencedora grava o registro e a auditoria |
| `created_at` | TEXT | RFC 3339 UTC |

### account_blocks (v10, PROPOSTA)

Registro dos bloqueios de conta ([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md)).
**PROPOSTA**: só recebe linhas novas com `ACCOUNT_BLOCK_ENABLED = "true"` (desligada em produção e homologação);
quais sanções existem, quem aplica, duração, recurso e aviso são PENDENTES ([OQ-11](../decisions/open-questions.md)).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | UUID; citado no detalhe da auditoria (`{"block": id}`) |
| `user_id` | TEXT FK → users, `ON DELETE CASCADE` | a conta bloqueada; a exclusão da conta apaga o registro |
| `message` | TEXT, 10 a 1000 caracteres | **mensagem para a pessoa bloqueada**, mostrada a ela como foi escrita (`GET /me`); não é anotação interna. A API guarda o texto sem caracteres de formatação ou de controle invisíveis (a restrição do banco confere só o tamanho) |
| `blocked_by` | TEXT | id do administrador (nunca e-mail); sem FK, como em `audit_events` |
| `blocked_at` | TEXT | RFC 3339 UTC |
| `lifted_at` | TEXT | `NULL` enquanto o bloqueio vale; instante do desbloqueio |
| `lifted_by` | TEXT | id do administrador que desbloqueou |

Índice único parcial `idx_account_blocks_active` em `(user_id) WHERE lifted_at IS NULL`: no máximo um bloqueio em
vigor por conta; bloqueios anteriores ficam como histórico. Nenhuma rota pública lê esta tabela.

### moderation_tickets (v10, PROPOSTA)

Bilhetes de uso único para remover um visitante de uma sala do servidor de tempo real
([IMPL-0021](../decisions/0021-administrator-role-and-moderation.md), **PROPOSTA**, atrás de
`PRESENCE_MODERATION_ENABLED`).

| Coluna | Tipo | Notas |
|---|---|---|
| `ticket_hash` | TEXT PK | SHA-256 (hex) do bilhete; o bilhete em claro nunca é gravado |
| `admin_id` | TEXT FK → users, `ON DELETE CASCADE` | o administrador que pediu |
| `room` | INTEGER ≥ 0 | sala (`0…7`) |
| `target` | INTEGER > 0 | id anônimo da conexão do visitante (IMPL-0008): não é conta nem dado pessoal |
| `created_at`, `expires_at` | TEXT | RFC 3339 UTC; validade de 30 segundos |
| `used_at` | TEXT | preenchido pelo consumo; `NULL` enquanto não usado |
| `consume_token` | TEXT | UUID do consumo vencedor: só ele grava a auditoria |

Índice `(admin_id, created_at)` para o limite de 10 bilhetes por administrador por minuto. Linhas com mais de um
minuto são apagadas quando qualquer bilhete é emitido. O Durable Object da sala nunca guarda o bilhete nem o
resultado.

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

### progress_writes (0008)

`user_id` (PK e FK → users, `ON DELETE CASCADE`), `revision` (inteiro ≥ 0) e `write_token` (UUID da última gravação).
A linha é criada sob demanda, sem duplicar dados pessoais. Uma consulta única lê revisão e eventos. A transação
D1 só troca a revisão esperada; todos os eventos do lote exigem o token exclusivo da tentativa vencedora. Uma
tentativa que perde a corrida não grava eventos, e uma falha de SQL desfaz tanto a revisão quanto o lote inteiro.

Não há mutex em memória nem estado persistido em Durable Object. Todos os escritores de progresso precisam passar
pelo protocolo; escrita manual em `progress_events` ou execução concorrente do Worker antigo não recebe essa
garantia. Antes de ativar, aplicar a migration autorizada e garantir que não há escritores legados ativos.

Limite de 500 eventos considera novas chaves distintas, sem cobrar reenvios ou reposicionamento de linha legada.
A API tenta novamente até três vezes após conflito de revisão, com jitter curto entre tentativas. Eventos de quest
inaplicáveis são omitidos; a resposta `200` devolve o progresso autoritativo para não impedir o login por um
conflito com progresso de visitante. Contenção persistente retorna `409 progress_conflict`; contrato em [api.md](api.md).

### audit_events

`id`, `at`, `actor` (id da conta que agiu, nunca e-mail), `action`, `subject`, `detail` (JSON sem dados pessoais).

| `action` | `actor` | `subject` | `detail` |
|---|---|---|---|
| `ngo.submit`, `ngo.resubmit` | quem enviou | `ngo:<id>` | `{lot, revision}` |
| `ngo.start_review`, `ngo.approve`, `ngo.request_changes`, `ngo.reject` | admin | `ngo:<id>` | `{from, to, lot, revision, hasNote}` (sem o texto da mensagem) |
| `ngo.withdraw` (PROPOSTA, IMPL-0020) | admin | `ngo:<id>` | `{from, to, revision, lots, hasReason}` (ids dos terrenos liberados; sem o texto da mensagem) |
| `ngo.file_add`, `ngo.file_remove` | quem enviou | `ngo:<id>` | `{kind, file, revision}` (ids; sem nome de arquivo) |
| `ngo.file_read` | admin que baixou um **documento** | `ngo:<id>` | `{kind, file}` |
| `ngo.file_cleanup` | admin que iniciou recuperação | `ngo:<id>` | `{requested}`; quantidade selecionada, registrada antes de excluir bytes; não prova sucesso |
| `user.delete` | a própria conta | `user:<id>` | `NULL` |
| `ngo.logo_remove` (IMPL-0021) | admin | `ngo:<id>` | `{file, revision}` |
| `user.role_change` (IMPL-0021) | admin | `user:<id>` | `{from, to}` (`player` / `admin`) |
| `user.block`, `user.unblock` (PROPOSTA, IMPL-0021) | admin | `user:<id>` | `{block}` (id do registro em `account_blocks`; sem o texto da mensagem) |
| `presence.remove` (PROPOSTA, IMPL-0021) | admin que pediu o bilhete | `room:<n>` | `{target}` (id anônimo da conexão; sem o bilhete e sem endereço). Registra que a remoção foi **autorizada** (bilhete consumido), não que uma conexão foi fechada: o alvo pode ter saído antes |

Lida pelo painel administrativo em `GET /admin/audit` (o autor aparece pelo nickname; consultar não grava nada
aqui: só mutações são auditadas — [IMPL-0015](../decisions/0015-dash-backoffice-app.md); a exceção é o download de
um documento de ONG por um admin, `ngo.file_read` — [IMPL-0017](../decisions/0017-ngo-files-r2.md)).

## 3. Dados pessoais e retenção

Dados pessoais guardados (P13, DEC-038): **Nome, Nickname, Cidade e E-mail**, só na tabela `users`. Só o nickname
aparece para outras pessoas (inclusive para o admin, que vê quem enviou a candidatura só pelo nickname). A lista de
contas do painel administrativo (`GET /admin/users`) traz nickname, papel, cidade, data de criação, se a conta foi
verificada e se está bloqueada — nunca e-mail, nome ou a mensagem do bloqueio. Tokens e
sessões ficam só como hash. IP é usado apenas como chave do limite de requisições (`AUTH_LIMITER`) e não é gravado.
Logs nunca recebem corpo de requisição, e-mail, token ou CNPJ.

| Dado | Retenção (PROPOSTA, a confirmar na revisão LGPD / ECA Digital) |
|---|---|
| Cadastro não confirmado | apagado depois de 24 h (na próxima chamada de cadastro); **exceto** se estiver bloqueado: fica até o desbloqueio ou a exclusão da conta (OQ-11) |
| Link de acesso | válido por 15 min, uso único; a linha fica até a conta ser excluída |
| Sessão | 30 dias; sessões vencidas da conta são apagadas no próximo login; logout apaga a sessão |
| Conta, sessões, links, eventos de missão | apagados em `DELETE /me` |
| Candidatura de ONG e `audit_events` | ficam após a exclusão da conta, sem o vínculo `applicant_id` |
| Documentos da candidatura (R2) | até a pessoa removê-los (fora da análise e antes da publicação, ou depois de uma retirada) ou excluir a conta (`DELETE /me` apaga do R2 e do D1); **sem prazo definido**, inclusive depois de uma rejeição (OQ-12) ou de uma retirada (OQ-14) |
| Logo (R2) | de candidatura fora da Vila (não publicada, ou retirada): apagado com a conta; de ONG publicada em terreno publicado: fica, como a ONG |
| Galeria (R2) | todas as fotos são removidas ao excluir a conta, inclusive as aprovadas; falha de limpeza permite repetição |
| Registro de retirada (`ngo_withdrawals`, D1; PROPOSTA) | fica, com a mensagem enviada à organização, inclusive depois da exclusão da conta do responsável; **sem prazo definido** (OQ-14) |
| Registro de bloqueio (`account_blocks`, D1; PROPOSTA) | fica, com a mensagem, enquanto a conta existir (inclusive depois de desbloqueada); **apagado com a conta** em `DELETE /me`. Depois da exclusão nada guarda o e-mail: ele pode ser cadastrado de novo. **Sem prazo definido** (OQ-11) |
| Bilhete de moderação (`moderation_tickets`, D1; PROPOSTA) | 30 segundos de validade; a linha (só o hash) é apagada na emissão seguinte, depois de um minuto, ou com a conta do administrador |
| Intenção de arquivo (D1) | até finalizar o upload ou confirmar a limpeza; cancelamento de envio abandonado pode ser solicitado após 15 min, sem prazo automático de retenção |

## 4. Dados que **não** ficam no D1 nesta versão

Progresso de visitantes sem conta (só `localStorage` do navegador, chave `vila.progress.v2`; migra para
`progress_events` ao entrar e é apagado do navegador; o progresso de uma conta nunca é gravado nessa chave, e eventos
ainda não enviados ficam em `vila.pending.v1:<id da conta>`, só ids de missão/evento; preferências do navegador: visual `vila.look.v1` e zoom da câmera `vila.zoom.v1`), os bytes de logos e documentos de ONG (ficam no R2, [§ 5](#5-arquivos-no-r2-impl-0017)), pagamentos. Logs de pagamento ficarão
separados dos dados de gamificação (dossiê §13).

## 5. Arquivos no R2 (IMPL-0017)

Bucket `vilanoeldobem-files`, binding `FILES`, ligado só ao Worker da API. **PROPOSTA, desligado em produção**
(`NGO_FILES_ENABLED = "false"`); o bucket ainda não foi criado.

| Item | Como é |
|---|---|
| Acesso | privado: sem `r2.dev`, sem domínio próprio; todo byte sai pela API |
| Chave | `ngo/<id da ONG>/<id do arquivo>` (dois UUIDs; nenhum nome) |
| Metadado do objeto | só `contentType` |
| Conteúdo | logo (PNG/JPEG, até 512 KB) e até 5 documentos (PDF/PNG/JPEG, até 5 MB) por candidatura |
| Imagens | guardadas sem EXIF, XMP, IPTC, comentários, miniaturas e blocos de texto (fica só a orientação do JPEG); só recodificar removeria tudo |
| Quem lê | logo: público só com ONG e terreno realmente `published`; documento: quem enviou e admins (leitura de admin auditada). Admins leem sempre que o bucket está ligado, mesmo com o envio desligado |
| Localização | dica `enam`, como o D1 (o R2 não tem região na América do Sul) |
| Homologação | `env.staging` não tem bucket: as rotas respondem `404 files_disabled` |

D1 e R2 não dividem transação: o contrato de arquivos vem da
[IMPL-0017](../decisions/0017-ngo-files-r2.md), com recuperação de falhas na
[IMPL-0018](../decisions/0018-ngo-files-reconciliation.md). Rotas e limites: [api.md](api.md#arquivos-da-candidatura-impl-0017).

## 6. Conciliação e exclusão concorrente (IMPL-0018)

Há um mecanismo de bytes/sanitização (`FILES`, `checkFile`/`cleanImage`), dois propósitos de metadados
(`ngo_files` para logo/evidências; `ngo_photos` para galeria) e nenhuma tabela/rota `ngo_documents` paralela.
`NGO_FILES_ENABLED` e `NGO_PHOTOS_ENABLED` continuam `false` em produção/staging; não houve provisionamento remoto.
O arquivo separado `apps/api/wrangler.reconciliation-local.jsonc` usa D1/R2 sintéticos `ngo-media-review-local`,
com `remote:false`, sem conta remota, limitadores remotos ou envio de e-mail. Use sempre `--local -c`; ele não
integra a configuração de deploy. A base antiga do simulador é preservada.

Logo/comprovantes gravam `media_upload_intents` antes de R2. `media-storage.ts`, compartilhado com a galeria,
cria reserva vazia e condiciona a escrita ao ETag: apagar a reserva impede que uma escrita atrasada recrie
bytes pessoais. O commit canônico exige intenção ativa; confirmação incerta exige reler metadados antes de
compensar. Falha ao remover/substituir um arquivo mantém uma intenção de limpeza privada.

Recuperação explícita: `POST /ngo/application/files/recover` (responsável) ou
`POST /admin/applications/:id/files/recover` (admin), ambos com `X-Vila-Account`. Funciona com envio desligado,
exige sessão/contas e bucket, trata até 50 registros por chamada e responde `{cleaned, remaining}`. Seleciona
`cleanup_pending=1` ou uploads com mais de 15 minutos; não cancela envios recentes. Falha de limpeza responde
`503 file_cleanup_pending` e preserva a intenção para repetição. O prazo é de recuperação de upload, não uma
política de retenção de documentos. Não há cron; operação e testes ainda dependem da validação registrada na
entrega. Uma queda na criação tardia de reserva já cancelada pode deixar um objeto vazio; não contém foto/documento.

Antes de limpar R2, `DELETE /me` marca `files_deleting=1`. Os guards de candidatura, arquivos, fotos e revisão
administrativa recusam novas mutações enquanto essa marca existe. O conjunto a apagar não pode virar conteúdo
publicado durante a limpeza. R2 falhou: mantém conta/sessão/intenção; repetir `DELETE /me` retoma a limpeza.
`GET /me` e o responsável no detalhe administrativo expõem `deletionPending`. As telas explicam a pendência e
o caminho de repetição. Rejeitar uma candidatura ainda aberta é a exceção ao bloqueio administrativo: libera o
terreno, preserva a intenção e não pode publicar evidências. Estado/revisão exatos e auditoria continuam exigidos.
Metadados sem binding `FILES`: `503 files_unavailable`, sem excluir a conta e sem tocar em nenhum objeto; como
nada foi apagado, o próprio pedido desfaz a marca que acabou de pôr e a conta não fica congelada. Fora desse caso
não se deve zerar a marca para "destravar" uma conta: depois de uma falha do R2, ou quando a marca veio de uma
tentativa anterior, alguns bytes já podem ter sido removidos. A transação final remove metadados, incrementa
as revisões das candidaturas, remove as intenções de upload/limpeza da conta, registra uma única auditoria e apaga o usuário. A revisão invalida decisões antigas
mesmo depois que o vínculo e a linha do usuário desaparecerem.

O logo institucional segue a retenção canônica por status da ONG. A galeria é apagada com a conta em qualquer
estado; antes da exclusão, leitura pública exige foto aprovada e terreno publicado. Direitos de imagem e
consentimentos continuam sujeitos à decisão operacional OQ-15. A retirada da ONG (IMPL-0020, PROPOSTA) não
apaga arquivo algum; o logo só continua guardado depois da exclusão da conta enquanto a ONG estiver publicada em
um terreno publicado, e a retirada é recusada (`409 account_deleting`) enquanto uma exclusão estiver pendente.

## Ver também

[api.md](api.md) · [guides/deploy.md](../guides/deploy.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0017](../decisions/0017-ngo-files-r2.md) · [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)
