# Publicações em produção

> **Status:** Implementado · **Versão do software:** 0.5.0 · **Schema D1:** v12 ·
> **Atualizado em:** 2026-11-14
> **Fonte de verdade:** "Último deploy" em [guides/deploy.md](../guides/deploy.md), `apps/*/wrangler.jsonc` (bandeiras),
> `migrations/`, `CHANGELOG.md`

Uma tabela por publicação em produção, da mais nova para a mais antiga. Cada linha diz de onde vem a informação:
**registro do deploy** (o que quem publicou anotou), **código** (`wrangler.jsonc` do commit publicado) ou
**observado** (requisição pública feita na data indicada). Uma bandeira lida no código é o valor que o deploy
enviou; ela não prova o comportamento. Um binding presente não prova que o recurso funciona.

## 0.5.0 — 2026-11-14

| Item | Valor | Fonte |
|---|---|---|
| Data | 2026-11-14 | registro do deploy |
| Commit | `e4771c4` (`main`, merge do PR #46, `release/0.5.0`) | registro do deploy |
| Ordem | API → servidor → jogo → painel → site, depois das migrations remotas | registro do deploy |
| Workers e hosts | `vilanoeldobem-api`: `api.*` · `vilanoeldobem-server`: `server.*` · `vilanoeldobem` (jogo): `play.*`, `client.*` (302 → `play`), `app.*` (301 → `play`) · `vilanoeldobem-dash`: `dash.*` (sem `workers.dev`) · `vilanoeldobem-site`: `www.*` e o domínio raiz (301 → `www`) | código; hosts observados (abaixo) |
| Versão no ar | `GET api.*/health` → `"version":"0.5.0"`, `"environment":"production"` | observado em 14/11/2026 |
| D1 | `vilanoeldobem`, schema **v12**: migrations `0004` a `0012` aplicadas nesta publicação (antes: v3) | registro do deploy; nenhuma consulta ao D1 remoto foi feita para este registro |
| Indício público do schema | `GET /lots` lista 12 terrenos (`plaza-01`…`plaza-12`), o que a 0012 acrescenta; `GET /health` → `"db":true` | observado em 14/11/2026 |
| R2 | bucket `vilanoeldobem-files` criado nesta data, vazio e privado (sem `r2.dev`, sem domínio próprio); binding `FILES` só na API | registro do deploy; `GET /health` → `"files":true` (binding presente, observado em 14/11/2026) |
| E-mail | segredo `RESEND_API_KEY` ausente: `GET /health` → `"mail":false` | observado em 14/11/2026 |
| Durable Object | `VillageRoom` (binding `ROOMS`): `GET server.*/health` → `"rooms":true` | observado em 14/11/2026 |

### Bandeiras em produção (0.5.0)

Valores de `vars` no `wrangler.jsonc` de cada app, iguais em `e4771c4` e na `main` de 2026-11-14 (nenhuma mudança
nesses arquivos depois do deploy). `GET api.*/config` respondeu, em 14/11/2026:
`{"accounts":false,"quests":false,"files":false,"withdrawal":false,"moderation":{"presence":false,"block":false},"residentialPlots":false,"donations":false}`.

| Worker | Bandeira | Valor |
|---|---|---|
| api | `ENVIRONMENT` | `"production"` |
| api | `ACCOUNTS_ENABLED` | `"false"` |
| api | `QUESTS_V1_ENABLED` | `"false"` |
| api | `NGO_FILES_ENABLED` | `"false"` |
| api | `NGO_PHOTOS_ENABLED` | `"false"` |
| api | `NGO_WITHDRAWAL_ENABLED` | `"false"` |
| api | `ACCOUNT_BLOCK_ENABLED` | `"false"` |
| api | `PRESENCE_MODERATION_ENABLED` | `"false"` |
| api | `RESIDENTIAL_PLOTS_ENABLED` | `"false"` |
| api | `DONATIONS_ENABLED` | `"false"` |
| server | `ENVIRONMENT` | `"production"` |
| server | `PRESENCE_MODERATION_ENABLED` | `"false"` |
| server | `IDLE_TIMEOUT_SECONDS` | `"300"` |
| client (jogo) | `ENVIRONMENT` | `"production"` (sem bandeiras de recurso: o jogo lê `/config`) |
| dash | — | sem `vars` (só arquivos estáticos) |
| site | — | sem `vars` |

### Conferências (0.5.0)

| Conferência | Data | Resultado | Fonte |
|---|---|---|---|
| `scripts/smoke-api.sh` contra produção | 2026-11-14 | passa | registro do deploy |
| `apps/client/scripts/verify-live.mjs` | 2026-11-14 | falha só pelos destinos do Google bloqueados pela CSP do jogo (OQ-13); nada mais falha | registro do deploy |
| `GET` em `api.*/health`, `api.*/config`, `api.*/lots`, `api.*/residential-plots`, `server.*/health` | 2026-11-14, 19h22 (BRT) | 200, com os valores acima; `/residential-plots` lista 112 terrenos com `"enabled":false` | observado |
| Raiz de cada host | 2026-11-14, 19h22 (BRT) | `play.*` 200 · `www.*` 200 · `dash.*` 200 · `client.*` 302 → `play` (caminho e query mantidos) · `app.*` 301 → `play` · domínio raiz 301 → `www` · `api.*/` e `server.*/` 404 (sem rota na raiz, esperado) | observado |

### Não verificado (0.5.0)

- Ensaio de recuperação do D1 de produção (Time Travel ou export): sem registro.
- Homologação: nenhum Worker de homologação publicado; só o banco `vilanoeldobem-staging`
  ([staging-database.md](../guides/staging-database.md)). Esta versão não passou por homologação.
- Aparelhos reais (celular): sem registro de teste; desempenho medido só em computador.
- Gravar e ler no bucket R2 em produção: não exercitado (o envio está desligado).
- Binding de serviço do servidor para a API (moderação de presença): não exercitado em produção (bandeira desligada).
- Estado das tabelas do D1 remoto além do que `/lots` mostra: nenhuma consulta remota feita para este registro.
- Commits na `main` depois de `e4771c4` (por exemplo `9ffe37c`, pranchas P01–P15, IMPL-0026) **não** estão em
  produção.

## Como registrar a próxima publicação

1. Depois do deploy autorizado ([guides/deploy.md](../guides/deploy.md)), copie a seção da última versão para o
   topo e troque o título por `## X.Y.Z — AAAA-MM-DD`.
2. Preencha data, commit publicado, ordem, Workers e hosts, schema D1 (última migration aplicada no remoto) e
   recursos R2 a partir do que foi feito; marque a fonte de cada linha.
3. Releia as bandeiras no `wrangler.jsonc` de cada app **no commit publicado** (`git show <commit>:apps/api/wrangler.jsonc`)
   e confira `GET api.*/config`.
4. Registre `smoke-api.sh` e `verify-live.mjs` com data e resultado, mesmo quando falham, e o motivo.
5. Liste o que não foi verificado. Não escreva nada que não tenha sido feito ou observado.
6. Atualize o parágrafo "Último deploy" de [guides/deploy.md](../guides/deploy.md) e a linha correspondente do
   `CHANGELOG.md`.

## Ver também

[guides/deploy.md](../guides/deploy.md) · [versioning.md](versioning.md) · [storage.md](storage.md) ·
[architecture.md](architecture.md) · [CHANGELOG](../../CHANGELOG.md)
