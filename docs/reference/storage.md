# Armazenamento (D1 e R2)

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v7 ·
> **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `migrations/`, `apps/api/wrangler.jsonc`, `apps/api/src/{auth,session,ngo,admin,files,ngo-photos,media-storage}.ts`

Banco D1 `vilanoeldobem`, binding `DB`, ligado só ao Worker da API (`apps/api`,
[IMPL-0009](../decisions/0009-split-client-api-server-shared.md)). Versão do schema = número da última migration
(**v7 no código**; último estado registrado de produção: v3). Migrations locais: `pnpm db:migrate:local`; remotas: `pnpm --filter @vila/api db:migrate:remote`
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

As migrations são sequenciais: esta versão contém 0001–0007. A 0006 mantém o contrato canônico de arquivos;
0007 acrescenta a galeria e os guardas de conciliação. Migrations não aplicadas podem ser ajustadas antes de
integrar; uma migration já aplicada não muda de nome nem significado. Simuladores com a antiga 0010 são bases
alternativas: usar nova base isolada, sem renomear seu histórico ou apagá-los.
A 0007 é pré-requisito do código conciliado mesmo com flags desligadas (sessão e decisões leem colunas novas).
Os fallbacks públicos do #32 para ausência de `ngo_files` permanecem: `/lots` responde sem logo e a rota de logo
responde 404. Eles não dispensam a migration 0007 para usar as rotas privadas conciliadas.
Operações de conta que encontrem ausência das novas colunas retornam `503 schema_outdated`; isso não substitui
a preparação do esquema nem bloqueia endpoints de autenticação que não consultam essas colunas.

Regras: números sequenciais; migrations aplicadas são imutáveis; nada de `IF NOT EXISTS` para esconder schema divergente.

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
| `revision` | INTEGER > 0 | sobe a cada reenvio, envio/remoção de arquivo e exclusão da conta responsável |
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
logo em `ngo_files`. Colunas: `id`, `ngo_id` (FK com cascata), `object_key` único, `content_type` PNG/JPEG,
`byte_size` (1–2097152), `caption` (até 240), `position` (0–9), `status` (`pending|approved|rejected|removed`),
`revision`, `decision_token` único, `upload_pending`, `cleanup_pending`, `created_at`, `updated_at`.
Índice `(ngo_id,status,position,id)`. A intenção de upload existe antes dos bytes; `upload_pending=1` não pode
ser publicado. Remoção/rejeição limpa legenda e revoga acesso antes da limpeza R2; falha mantém
`cleanup_pending=1` para nova tentativa. Limite de 10 pendentes/aprovadas é conferido no INSERT; rejeitadas não
consomem cota. Nenhuma chave contém nome/legenda.

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
| `files_deleting` | INTEGER 0/1 | v7; intenção durável de exclusão, impede alterações de evidências durante limpeza R2 |
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

Chave primária `(user_id, mission_id, event_id)`: evento repetido não muda nada (DEC-042).

### audit_events

`id`, `at`, `actor` (id da conta que agiu, nunca e-mail), `action`, `subject`, `detail` (JSON sem dados pessoais).

| `action` | `actor` | `subject` | `detail` |
|---|---|---|---|
| `ngo.submit`, `ngo.resubmit` | quem enviou | `ngo:<id>` | `{lot, revision}` |
| `ngo.start_review`, `ngo.approve`, `ngo.request_changes`, `ngo.reject` | admin | `ngo:<id>` | `{from, to, lot, revision, hasNote}` (sem o texto da mensagem) |
| `ngo.file_add`, `ngo.file_remove` | quem enviou | `ngo:<id>` | `{kind, file, revision}` (ids; sem nome de arquivo) |
| `ngo.file_read` | admin que baixou um **documento** | `ngo:<id>` | `{kind, file}` |
| `ngo.file_cleanup` | admin que iniciou recuperação | `ngo:<id>` | `{requested}`; quantidade selecionada, registrada antes de excluir bytes; não prova sucesso |
| `user.delete` | a própria conta | `user:<id>` | `NULL` |

Lida pelo painel administrativo em `GET /admin/audit` (o autor aparece pelo nickname; consultar não grava nada
aqui: só mutações são auditadas — [IMPL-0015](../decisions/0015-dash-backoffice-app.md); a exceção é o download de
um documento de ONG por um admin, `ngo.file_read` — [IMPL-0017](../decisions/0017-ngo-files-r2.md)).

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
| Documentos da candidatura (R2) | até a pessoa removê-los (fora da análise e antes da publicação) ou excluir a conta (`DELETE /me` apaga do R2 e do D1); **sem prazo definido**, inclusive depois de uma rejeição (OQ-12) |
| Logo (R2) | de candidatura não publicada: apagado com a conta; de ONG publicada: fica, como a ONG |
| Galeria (R2) | todas as fotos são removidas ao excluir a conta, inclusive as aprovadas; falha de limpeza permite repetição |
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
Metadados sem binding `FILES`: `503 files_unavailable`, sem excluir a conta. Não se deve zerar a marca para
"destravar" uma conta: alguns bytes já podem ter sido removidos. A transação final remove metadados, incrementa
as revisões das candidaturas, remove as intenções de upload/limpeza da conta, registra uma única auditoria e apaga o usuário. A revisão invalida decisões antigas
mesmo depois que o vínculo e a linha do usuário desaparecerem.

O logo institucional segue a retenção canônica por status da ONG. A galeria é apagada com a conta em qualquer
estado; antes da exclusão, leitura pública exige foto aprovada e terreno publicado. Direitos de imagem e
consentimentos continuam sujeitos à decisão operacional OQ-15. A retirada da ONG é uma entrega separada.

## Ver também

[api.md](api.md) · [guides/deploy.md](../guides/deploy.md) · [IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0017](../decisions/0017-ngo-files-r2.md)
