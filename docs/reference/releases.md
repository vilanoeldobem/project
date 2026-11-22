# Publicações em produção

> **Status:** Implementado · **Versão do software:** 0.9.0 · **Schema D1:** v15 ·
> **Atualizado em:** 2026-11-22
> **Fonte de verdade:** "Último deploy" em [guides/deploy.md](../guides/deploy.md), `apps/*/wrangler.jsonc` (bandeiras),
> `migrations/`, `CHANGELOG.md`

Uma tabela por publicação em produção, da mais nova para a mais antiga. Cada linha diz de onde vem a informação:
**registro do deploy** (o que quem publicou anotou), **código** (`wrangler.jsonc` do commit publicado) ou
**observado** (requisição pública feita na data indicada). Uma bandeira lida no código é o valor que o deploy
enviou; ela não prova o comportamento. Um binding presente não prova que o recurso funciona.

## 0.9.0 — 2026-11-22

| Item | Valor | Fonte |
|---|---|---|
| Data | 2026-11-22, 17h35 a 17h38 (BRT); 20h35 a 20h38 UTC | registro do deploy |
| Commit | `43b8f90` (`main`, merge do PR #108, `release/0.9.0`), tag `v0.9.0` | registro do deploy |
| Autorização | confirmação do responsável técnico nesta data ("yes" ao lançar e publicar a 0.9.0) | registro do deploy |
| Ordem | API → servidor → jogo → painel → site; nenhuma migration | registro do deploy |
| Versões (`wrangler`) | api `a3d85d8e` · server `69036204` · jogo `4819195e` · dash `9e4502ae` · site `01e42eb8` | registro do deploy |
| Versões anteriores (alvo de rollback) | api `351baeac` · server `d168137b` · jogo `07726b7f` · dash `c4a7fa09` · site `d95d444a` | registro da 0.8.0 |
| Versão no ar | `GET api.*/health` → `"version":"0.9.0"`, `"environment":"production"`, `"db":true` | observado em 2026-11-22 20h38 UTC |
| D1 | **v15**, sem mudança | código (`migrations/`) |
| Bandeiras | iguais às da 0.8.0; `/config` respondeu tudo `false` | observado |
| R2, e-mail, Durable Object | sem mudança | código |

### Conferências (0.9.0)

| Conferência | Data | Resultado | Fonte |
|---|---|---|---|
| `sh scripts/smoke-api.sh` | 2026-11-22 | 19/19 | observado |
| `node apps/client/scripts/verify-live.mjs` | 2026-11-22 | 7 falhas, todas dos destinos do Google bloqueados pela CSP (OQ-13), como na 0.8.0 | observado |
| `verify-budget.mjs` local antes do merge | 2026-11-22 | pior vista: 111 chamadas, 202 906 triângulos (orçamento 150 / 250 000) | registro do PR #107 |
| `verify.mjs` local | — | **não rodado**: a porta 8787 seguia ocupada por outro projeto local | registro do deploy |

## 0.8.0 — 2026-11-22

| Item | Valor | Fonte |
|---|---|---|
| Data | 2026-11-22, 16h05 a 16h07 (BRT); 19h05 a 19h07 UTC | registro do deploy |
| Commit | `6d4e4fc` (`main`, merge do PR #97, `release/0.8.0`), tag `v0.8.0` | registro do deploy |
| Autorização | pedido do responsável técnico nesta data ("release nova versão") e confirmação explícita antes do deploy | registro do deploy |
| Ordem | API → servidor → jogo → painel → site; nenhuma migration | registro do deploy |
| Versões (`wrangler`) | api `351baeac` · server `d168137b` · jogo `07726b7f` · dash `c4a7fa09` · site `d95d444a` | registro do deploy |
| Versões anteriores (alvo de rollback) | api `18175b13` · server `34d9553b` · jogo `a898ab26` · dash `c87dd18b` · site `85a2a25f` | `wrangler deployments list` antes do deploy |
| Versão no ar | `GET api.*/health` → `"version":"0.8.0"`, `"environment":"production"`, `"db":true`, `"mail":false`, `"files":true` | observado em 2026-11-22 19h05 UTC |
| Prontidão | `GET api.*/ready` → `{"ok":true,"checks":{"db":"ok","files":"ok"}}`; `GET server.*/ready` → `{"ok":true,"rooms":"ok"}` | observado em 2026-11-22 19h05 UTC |
| D1 | **v15**, sem mudança | código (`migrations/`) |
| Nova variável | `QUESTS_V2_ENABLED = "false"` passa a constar no `wrangler.jsonc` da API (antes ausente, com o mesmo efeito) | código (`git diff v0.7.0 v0.8.0 -- apps/*/wrangler.jsonc`) |
| R2, e-mail, Durable Object | sem mudança | código |

### Bandeiras em produção (0.8.0)

Iguais às da 0.7.0. `GET api.*/config` respondeu, em 2026-11-22 19h07 UTC:
`{"accounts":false,"quests":false,"questsV2":false,"files":false,"withdrawal":false,"moderation":{"presence":false,"block":false},"residentialPlots":false,"donations":false,"ngoLevels":false}`.

### Conferências (0.8.0)

| Conferência | Data | Resultado | Fonte |
|---|---|---|---|
| `sh scripts/smoke-api.sh` | 2026-11-22 19h07 UTC | 19/19 (inclui as duas rotas `/ready`) | observado |
| `node apps/client/scripts/verify-live.mjs` | 2026-11-22 | falha só pelos destinos do Google bloqueados pela CSP (OQ-13), como na 0.7.0 | observado |
| `verify.mjs` local antes do deploy | — | **não rodado**: a porta 8787 estava ocupada por outro projeto local; os gates do CI e os testes locais passaram, e o visual de blocos foi conferido no Chrome local | registro do deploy |

## 0.7.0 — 2026-11-19

| Item | Valor | Fonte |
|---|---|---|
| Data | 2026-11-19, 23h36 a 23h40 (BRT); `wrangler` registra 2026-11-20 02h36 a 02h40 UTC | registro do deploy |
| Commit | `9a80a83` (`main`, merge do PR #70, `release/0.7.0`), tag `v0.7.0` | registro do deploy |
| Autorização | pedido do responsável técnico nesta data, cobrindo os cinco deploys e as migrations remotas | registro do deploy |
| Ordem | API → migrations `0014` e `0015` → servidor → jogo → painel → site ([deploy §4.0](../guides/deploy.md#40-o-que-precisa-ir-junto-na-publicação-da-vila-com-menos-neve-e-quatro-anéis-impl-0030-impl-0031)) | registro do deploy |
| Versões (`wrangler`) | api `18175b13` · server `34d9553b` · jogo `a898ab26` · dash `c87dd18b` · site `85a2a25f` | registro do deploy |
| Versões anteriores (alvo de rollback) | api `86dfa91c` · server `3c0916ac` · jogo `078e54ac` · dash `0c96668f` · site `c40e9282` | `wrangler deployments list` antes do deploy |
| Workers e hosts | os mesmos da 0.5.0 | código |
| Versão no ar | `GET api.*/health` → `"version":"0.7.0"`, `"environment":"production"`, `"db":true`, `"mail":false`, `"files":true` | observado em 2026-11-20 02h36 UTC |
| D1 | de **v13** para **v15**: `0014_pending_event_hold_reason.sql` e `0015_village_growth.sql` aplicadas em 2026-11-20 02h37 UTC, depois da API. Ponto de restauração imediatamente antes: bookmark `000000ac-00000000-00005129-a1911c147386babb9d8f02c202dbb4ef` (`wrangler d1 time-travel restore vilanoeldobem --bookmark=…`) | registro do deploy |
| D1, antes e depois | antes: 12 terrenos, 112 linhas em `residential_plots`, nenhuma ONG, nenhuma conta, nenhum evento de doação em espera. Depois: 97 terrenos (12 da praça, 85 dos anéis), 23 linhas em `residential_plots`; `wrangler d1 migrations list --remote` → "No migrations to apply" | consulta de contagem ao D1 remoto nesta data |
| Clima | `GET api.*/environment` → `"weatherAlgorithmVersion":2`; API e jogo publicados em sequência (IMPL-0030) | observado em 2026-11-20 |
| Raio do mundo | 99 u no servidor de tempo real e no jogo, publicados em sequência (IMPL-0031) | código |
| Nova variável | `NGO_LEVELS_ENABLED = "false"` na API (IMPL-0032); nenhum binding novo em nenhum Worker | código (`git diff v0.6.0 v0.7.0 -- apps/*/wrangler.jsonc`) |
| R2, e-mail, Durable Object | sem mudança desde a 0.5.0 | código |

### Bandeiras em produção (0.7.0)

Iguais às da 0.6.0, mais `NGO_LEVELS_ENABLED = "false"` na API. `GET api.*/config` respondeu, em 2026-11-20 02h36 UTC,
depois do deploy:
`{"accounts":false,"quests":false,"files":false,"withdrawal":false,"moderation":{"presence":false,"block":false},"residentialPlots":false,"donations":false,"ngoLevels":false}`.

### Conferências (0.7.0)

| Conferência | Data | Resultado | Fonte |
|---|---|---|---|
| Gates (`typecheck`, `test` com 1.932 testes, `build`) e CI do PR #70 | 2026-11-19 | passam | registro do deploy |
| Locais, sobre a mesma árvore antes da troca do número da versão: `smoke-api.sh`, `verify` (pior vista com uma casa em cada terreno: 133 chamadas, 207 262 triângulos), `verify-collisions`, `verify-life`, `verify-boards`, `verify-shop`, `verify-accounts`, `verify-fullroom` (40 pessoas: 103 chamadas), `verify-quests`, `verify.mjs` do painel | 2026-11-19 | passam | registro do deploy |
| `scripts/smoke-api.sh` contra produção | 2026-11-20 UTC | passa, 17/17 | observado |
| `apps/client/scripts/verify-live.mjs` | 2026-11-20 UTC | falha só pelos 7 erros de CSP dos destinos do Google (OQ-13), como na 0.6.0; nada mais falha. A captura mostra a praça, o HUD e a presença "👥 1" | observado |
| `apps/site/scripts/verify.mjs` contra `www.*` | 2026-11-20 UTC | falha só pelos mesmos destinos do Google bloqueados pela CSP do site (179 itens, todos desse tipo); nada mais falha | observado |
| `apps/dash/scripts/verify.mjs` contra `dash.*` e `api.*` | 2026-11-20 UTC | passa (contas desligadas: sem tela de entrada para conferir) | observado |
| `GET api.*/lots` e `/residential-plots` | 2026-11-20 UTC | 200; 97 terrenos (`plaza-01` primeiro, `ring4-30` por último), todos com `ngo_level: null`; 23 terrenos residenciais com `"enabled":false` | observado |
| Raiz de cada host | 2026-11-20 UTC | `play.*` 200 · `www.*` 200 · `dash.*` 200 · `client.*` 302 → `play` · `app.*` 301 → `play` · domínio raiz 301 → `www`; `server.*/health` → `"rooms":true` | observado |

### Não verificado (0.7.0)

- Aparelhos reais (celular): nenhum teste. O desempenho da Vila maior foi medido só em computador.
- Em produção só a chegada foi vista (`verify-live.mjs`): ninguém andou pelos anéis, abriu um prédio cívico, um
  parque ou uma placa no jogo publicado. Essas conferências foram feitas localmente.
- Sala cheia em produção: medida só localmente (`verify-fullroom.mjs`).
- Mistura de abas antigas e novas na mesma sala durante a troca de versão: não exercitada.
- `verify-moderation.mjs` e `verify-withdrawal.mjs` do painel: não rodados (fluxos não alterados, atrás de bandeiras
  desligadas).
- Coluna da `0014`: só as rotas de doação (desligadas) a leem; não exercitada em produção.
- Ensaio de recuperação do D1 e homologação: sem registro (como nas versões anteriores).
- A resposta do dono do produto à OQ-19 (plano final dos anéis e quantos abrem no lançamento) não existia quando a
  `0015` foi aplicada: um plano diferente pede uma migration nova.

## 0.6.0 — 2026-11-14

| Item | Valor | Fonte |
|---|---|---|
| Data | 2026-11-14, ~22h (BRT); `wrangler` registra 2026-11-15 01h UTC | registro do deploy |
| Commit | `9d32fbc` (`main`, merge do PR #56, `release/0.6.0`), tag `v0.6.0` | registro do deploy |
| Ordem | API → servidor → jogo → painel → site; **nenhuma migration remota** | registro do deploy |
| Versões (`wrangler`) | api `86dfa91c` · server `3c0916ac` · jogo `078e54ac` · dash `0c96668f` · site `c40e9282` | registro do deploy |
| Versões anteriores (alvo de rollback) | api `a6a19ee6` · server `ea49395d` · jogo `00245bb0` · dash `8690b262` · site `ac9bf1e0` | `wrangler deployments list` antes do deploy |
| Workers e hosts | os mesmos da 0.5.0 | código |
| Versão no ar | `GET api.*/health` → `"version":"0.6.0"`, `"environment":"production"`, `"db":true`, `"mail":false`, `"files":true` | observado em 14/11/2026 |
| D1 | publicado com a produção em **v12**; a `0013_donation_durable_intent.sql` foi aplicada **depois**, em 2026-11-15 01h27 UTC (produção em **v13**), com autorização do responsável. Ponto de restauração do D1 imediatamente antes: bookmark `0000008a-00000000-00005124-550cb3acb20c73e5f35a2a54e191b9b5` (`wrangler d1 time-travel restore vilanoeldobem --bookmark=…`). Só rotas atrás de `DONATIONS_ENABLED` (desligada) leem as tabelas novas; com a bandeira ligada e a v12, respondem `503 schema_outdated` | registro do deploy; código |
| Protocolo de presença | muda nesta versão (visual como código compacto, IMPL-0027): servidor e jogo publicados em sequência; uma aba antiga só tem a mensagem de visual descartada | código |
| Novo binding | `DONATION_LIMITER` (rate limiting, namespace 1104) na API; sem efeito com as doações desligadas | código |
| R2, e-mail, Durable Object | sem mudança desde a 0.5.0 | código |

### Bandeiras em produção (0.6.0)

Iguais às da 0.5.0 (nenhuma mudança de `vars` em `apps/*/wrangler.jsonc` entre `e4771c4` e `9d32fbc`; a API só ganhou
o binding acima). `GET api.*/config` respondeu, em 14/11/2026, depois do deploy:
`{"accounts":false,"quests":false,"files":false,"withdrawal":false,"moderation":{"presence":false,"block":false},"residentialPlots":false,"donations":false}`.
No jogo, as prévias pagas do provador ficam ocultas por código (`SHOW_PAID_PREVIEWS = false`, PEN-022).

### Conferências (0.6.0)

| Conferência | Data | Resultado | Fonte |
|---|---|---|---|
| Gates (`typecheck`, `test` com 1.666 testes, `build`) e CI do PR #56 | 2026-11-14 | passam | registro do deploy |
| Locais sobre `release/0.6.0`: `smoke-api.sh`, `verify`, `verify-fullroom`, `verify-recovery`, `verify-shop`, `verify-collisions`, `verify-life` | 2026-11-14 | passam (collisions e life rodados de novo isolados depois de o Chrome cair por falta de memória da máquina) | registro do deploy |
| `scripts/smoke-api.sh` contra produção | 2026-11-14 | passa, 17/17 | observado |
| `apps/client/scripts/verify-live.mjs` | 2026-11-14 | falha só pelos 7 erros de CSP dos destinos do Google (OQ-13), como na 0.5.0; nada mais falha | observado |
| `GET` em `api.*/lots`, `/indicators`, `/residential-plots`, `/environment` | 2026-11-14 | 200 | observado |
| Raiz de `play.*`, `dash.*`, `www.*`; `server.*/health` | 2026-11-14 | 200; `"rooms":true` | observado |

### Não verificado (0.6.0)

- Migration `0013`: aplicada em 2026-11-15 01h27 UTC; depois dela `wrangler d1 migrations list --remote` diz "No migrations to apply", as duas tabelas existem (`sqlite_master`), `/health`, `/lots`, `/indicators`, `/residential-plots`, `/environment` e `/config` respondem 200 e o `smoke-api.sh` passa. As rotas que usam as tabelas seguem desligadas e não foram exercitadas.
- Ensaio de recuperação do D1, homologação, aparelhos reais: sem registro (como na 0.5.0).
- Sala cheia em produção: medida só localmente (`verify-fullroom.mjs`, 40 pessoas, 97 chamadas).
- Mistura de abas antigas e novas na mesma sala durante a troca de versão: não exercitada.

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
