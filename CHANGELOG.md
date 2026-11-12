# Changelog

Todas as mudanças notáveis da Vila Noel do Bem são registradas neste arquivo.

O formato segue [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota
[Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/). A política completa (o que cada número significa,
versão do schema D1, processo de release) está em [`docs/reference/versioning.md`](docs/reference/versioning.md).
Cada versão indica o schema D1 que entrega.

## [Unreleased]

### Changed — e-mail

- O link de acesso passa a sair pelo Resend ([IMPL-0012](docs/decisions/0012-resend-transactional-email.md)) no
  lugar do Cloudflare Email Service: segredo `RESEND_API_KEY` no Worker da API, sem binding `send_email`. Sem a
  chave o envio falha fechado (`503 mail_unavailable`), como antes. `GET /health` ganhou `mail` (se a chave existe).
- Workflow manual `api-secrets` grava `RESEND_API_KEY` no Worker a partir dos segredos do GitHub.

### Added — medição

- Google Tag Manager (`GTM-MQP2RVMB`) no site e no jogo. A inicialização do `dataLayer` fica em `/gtag-init.js`
  (a CSP não aceita script inline). A CSP dos dois apps libera `https://www.googletagmanager.com` como script e
  `*.googletagmanager.com`, `*.google-analytics.com` e `*.analytics.google.com` como imagem e conexão. Tags HTML
  personalizadas do GTM continuam bloqueadas pela CSP.
- No jogo, o token do link mágico (`#login=`) sai da barra de endereço antes de o GTM carregar
  (`/login-fragment.js`, guardado só em memória), para nunca aparecer na URL medida.

### Changed — controles

- Andar é só por clique/toque no chão: WASD e setas foram removidos. O clique mostra um anel dourado que se expande,
  um brilho de gelo e um marcador no destino até o avatar chegar (sem expansão com movimento reduzido).
- Zoom da câmera: roda do mouse, gesto de pinça, botões ＋/－ no canto e teclas `+`/`-`; fica salvo neste navegador
  (`vila.zoom.v1`). Névoa gelada mais leve (0,82 → 0,60).

### Added — 0.4.0 "Contas e ONGs" (desligado em produção)

- Contas ([IMPL-0011](docs/decisions/0011-accounts-magic-link-ngo-review.md)): cadastro com Nome, Nickname, Cidade e
  E-mail (DEC-038; só o nickname é público), entrada por link mágico enviado por e-mail (15 min,
  uso único), sessão em cookie HttpOnly, sair e excluir conta. Atrás da bandeira `ACCOUNTS_ENABLED`, **desligada em
  produção** até a revisão LGPD / ECA Digital e o cadastro do domínio de e-mail.
- Missões e XP no servidor: eventos idempotentes, progresso local migrado ao entrar (DEC-042).
- Candidatura de ONG em 4 etapas (P12, campos PROPOSTA; sem upload de documentos), reserva do terreno, reenvio após
  pedido de ajustes ou rejeição.
- Análise administrativa (DEC-037): iniciar análise, aprovar, pedir ajustes, rejeitar; histórico auditado; a
  aprovação publica a casa gerada no terreno.
- Migration `0004_accounts_ngo_applications.sql` (schema D1 v4). Rotas `/config`, `/auth/*`, `/me`, `/progress`,
  `/ngo/application`, `/admin/applications`. `apps/client/scripts/verify-accounts.mjs` (navegador, só local).

### Security — endurecimento das contas (trazido da linha paralela #9–#12)

- Link de acesso com o token no fragmento (`/#login=`), fora dos logs do Worker do jogo.
- Progresso de cada conta separado do progresso de visitante: num navegador compartilhado, a próxima pessoa não herda
  eventos da anterior; eventos não enviados ficam numa fila e são reenviados quando a conexão volta.
- Escritas com `accountId` (`409 account_changed` se outra aba trocou de conta); decisões da análise presas à versão
  vista (`409 stale_revision`); aprovação exige e registra as três verificações do DEC-015.
- Datas impossíveis recusadas, caracteres de controle removidos, ids de evento conferidos por missão, `no-store`
  imposto nas rotas de conta, sessão anterior encerrada ao entrar, leitura de corpo limitada sem `Content-Length`.

### Added — infraestrutura

- Ambiente `staging` da API (`apps/api/wrangler.jsonc`) com banco D1 próprio (`vilanoeldobem-staging`), sem rotas,
  sem origens e com contas desligadas; guia [staging-database.md](docs/guides/staging-database.md). Preparado pela
  equipe no PR #10 e trazido para o `main` sem as migrations divergentes; banco recriado com as migrations 0001-0005
  do `main` (ensaio da aplicação em produção).

### Changed

- **Monorepo separado em apps e subdomínios** ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)):
  `apps/client` (jogo, `play.vilanoeldobem.com.br`; `app.*` redireciona com 301), `apps/api` (API + D1,
  `api.vilanoeldobem.com.br`), `apps/server` (presença em tempo real, `server.vilanoeldobem.com.br`), `apps/site`
  (sem mudança, links para `play.*`) e `packages/shared` (lógica pura comum). **Incompatível:** rotas da API perdem
  o prefixo `/api` (`/health`, `/indicators`, `/lots`, `/environment`); presença em `wss://server.…/room`. CORS e
  WebSocket só para origens exatas; CSP do jogo gerada por build. `smoke-api.sh` confere os três serviços.

### Added

- Runtime das quests narrativas `quests-v1` (PROPOSTA, DEC-039 a DEC-042; PEN-025) atrás de flags
  (`VITE_QUESTS_V1_ENABLED=true` ou `?quests=1` em localhost/dev no cliente **e** `QUESTS_V1_ENABLED` na API, lida
  pelo cliente em `GET /config`; as duas precisam estar ligadas), com catálogo em
  `packages/shared/src/game/quests.ts`, máquina de estados pura, cinco NPCs (`villager`), coleta por proximidade,
  bolsa derivada, diálogos, Caderno de cadeias, integração com XP idempotente na API, testes em
  `packages/shared/src/game/quests.test.ts`, verificação no navegador (`apps/client/scripts/verify-quests.mjs`) e
  referência em [quests.md](docs/reference/quests.md).
- Painel de doação global físico (`DONATION_PANEL`, gerador `quest-donation-panel`; PROPOSTA `quests-v1`), montado só
  com as quests ligadas: abre o mesmo painel de doação da árvore (DEC-026) e serve à leitura da promessa.
- Regras do runtime de `quests-v1` ([IMPL-0013](docs/decisions/0013-quests-v1-runtime.md)): com as flags desligadas o
  mundo é o de antes (moradores, atril e os obstáculos deles só existem com as quests ligadas); a API grava um evento
  de quest apenas quando ele é uma transição válida (um `accept` de aba desatualizada ou um objetivo antes do
  `accept` não travam mais a missão e podem ser reenviados); com `QUESTS_V1_ENABLED` desligada a API ignora os
  eventos de quest e grava o resto do lote, em vez de recusar tudo com `400`; clicar num morador de longe faz o
  avatar andar até ele em vez de abrir o diálogo; o foco do teclado fica no diálogo quando a próxima missão aparece.
- Itens de quest (PROPOSTA, `quests-v1`): cinco geradores em `apps/client/src/scene/gen/quest-items.ts` —
  `quest-reindeer-bell` (Sino do arreio), `quest-lucky-charm` (Patuá da sorte), `quest-ornament-crate` (Caixa de
  enfeites), `quest-donation-panel` (Painel de doação global) e `quest-story-page` (Página da história) — com
  receitas visuais pesquisadas em `content/proposals/quests-v1/object-references.md`, todos dentro de 80 voxels e
  200 faces (itens) ou 220 e 600 (adereço de mundo).
- Proposta estruturada `content/proposals/quests-v1/` (15 missões em 5 cadeias de NPC, diálogos, bíblia de
  história, catálogo normalizado de 8 objetos em `objects.csv`/`objects.md`, fila de prompts em `object-prompts/`,
  auditoria em `review.md`, plano de piloto em `pilot-plan.md` e validadores `validate-quests.mjs` e
  `validate-objects.mjs`).

- Adereços gerados na Vila (PROPOSTA): mercado com barraca de panetone, lanternas, placa, caixa de correio e trenó,
  fundidos numa só geometria por material (+3 chamadas de desenho para todos).

- Multiplayer mostra o visual de cada visitante (chapéu, cachecol, suéter, cores) e `apps/server/scripts/load.mjs`
  testa uma sala cheia (40 visitantes: ~10 kB/s por visitante, p95 9 ms local).

- Conteúdo procedural por semente ([IMPL-0010](docs/decisions/0010-seeded-procedural-voxel-content.md), PROPOSTA):
  núcleo de geradores determinísticos (PRNG por semente, partes, paleta nomeada, orçamento por categoria testado,
  snapshots) e 9 geradores de adereços (presente, lanterna, cerca, trenó, caixa de correio, placa, guirlanda,
  barraca, barraca de panetone) e de chalés (planta, andares, três telhados, varanda, guirlanda, chaminé), moradores (corpo, casaco, cachecol, chapéu,
  tons de pele) e animais (rena, cachorro, gato, passarinho, coelho, coruja noturna) com respiração em shader;
  decoração com 3 moradores e 6 animais na Vila (PROPOSTA).
- Visual do avatar (PROPOSTA): chapéus, cachecóis, suéteres e paletas como camadas sobre o avatar, liberados só por
  missões e nível (tudo alcançável sem doar; nada se compra ou sorteia). Escolha em "Caderno de Missões". Presentes
  escondidos gerados pelo id; terrenos com ONG publicada ganham um chalé gerado pelo id do terreno. Galeria `?gallery` (só desenvolvimento)
  e `scripts/gallery.mjs`. Ver [content.md](docs/reference/content.md).

- Multiplayer de presença ([IMPL-0008](docs/decisions/0008-multiplayer-presence-durable-objects.md)): quem está na
  mesma praça vê os outros andando em tempo real (Durable Object `VillageRoom` + WebSocket `GET /api/room`, até 40
  por sala, 8 salas). Bonecos anônimos, sem nomes, sem chat, nada gravado. Chip "👥 N" no HUD; opção "Outros
  visitantes" no painel "Ambiente". `verify.mjs` testa dois navegadores se vendo e a coleta dos presentes.

- Motor e jogabilidade ([IMPL-0007](docs/decisions/0007-voxel-mesher-fixed-step-simulation.md), PROPOSTA): malha de
  voxels com remoção de faces escondidas e oclusão de ambiente por vértice; adereços repetidos instanciados.
  Medido no `verify.mjs` (preset Média): 96 → 56 chamadas de desenho e 362 mil → 108 mil triângulos por quadro.
- Avatar com simulação em passo fixo (aceleração, chegada suave, giro suave), colisão com pinheiros, postes, bancos,
  bonecos de neve, trenó e chalés, caminhada articulada, sombra de contato e câmera com antecipação.
- Efeitos: neve levantada pelos passos, brilho dourado ao achar presente; pegadas por passo (não na pedra nem no gelo).
- Som: passos por superfície (neve, neve batida, pedra, gelo), carrilhão do presente e vinheta de missão, além do
  vento e dos sininhos; continua desligado por padrão.
- Resolução adaptativa pelo p95 do tempo de quadro; `?envDebug` mostra chamadas, triângulos, p50/p95 e DPR;
  `verify.mjs` grava `verify-output/stats.json`.

- CI no GitHub Actions: `ci.yml` (typecheck, testes e build em todo PR e push na `main`) e `smoke.yml` (smoke de
  produção diário e manual). `scripts/smoke-api.sh` passa a conferir `/api/environment`.

- Decisões: OQ-02 (visitante livre, conta opcional) e OQ-03 (login por link mágico no e-mail) resolvidas; nova
  pergunta OQ-08 (provedor de envio de e-mail).

- Ambiente natalino ([IMPL-0006](docs/decisions/0006-christmas-environment-real-time-procedural-weather.md),
  PROPOSTA): a Vila segue a hora real de São Paulo (1:1, via fuso IANA) com amanhecer, dia, entardecer e noite;
  clima fictício e determinístico, igual para todos (neve leve a nevasca, névoa, vento), com eventos de Natal e
  Virada do Ano. Rota `GET /api/environment` (autoridade da hora, `no-store`). Sem Durable Object nem recurso novo.
- Vila nevada: chão com neve, pinheiros que balançam com o vento, chalés com janelas acesas e chaminé com fumaça,
  cordões de lâmpadas, bonecos de neve, trenó com renas, lago congelado, floresta e montanhas; céu com estrelas, lua,
  nuvens, aurora e estrelas cadentes; neve por GPU; pegadas; bloom moderado nos presets Alta/Ultra.
- HUD: hora de SP e clima; botão "Olhar o céu"; painel "Ambiente" com qualidade gráfica e conforto (sem partículas,
  luzes fixas, menos movimento, som ambiente procedural desligado por padrão).
- Depuração local: `?envDebug`, `?envTime=`, `?envWeather=` (só localhost/dev); `verify.mjs` fotografa as fases.

### Changed

- Rótulos de missão sobre os cinco NPCs e o atril da doação (`@react-three/drei` `Html`), um botão de ação no HUD
  por alvo (NPC, interação de quest, painel de doação, árvore, terreno) com `E`/`Enter`, diálogo modal
  (`ui/Panel.tsx`) seguindo o padrão APG de foco, copy cardinal corrigida para **ao sul** para o trenó, cabeçalhos
  de CORS aplicados na própria `Response` em `apps/api/src/api.ts`, teste de coordenadas exatas em
  `packages/shared/src/game/motion.test.ts` e atualização de [api.md](docs/reference/api.md),
  [architecture.md](docs/reference/architecture.md) e [content.md](docs/reference/content.md).
- Referências atuais ao repositório de documentação atualizadas para `vilanoeldobem/docs`; nomes anteriores mantidos apenas onde registram contexto histórico.
- Desempenho do primeiro carregamento: o chunk `three` caiu de 317 para 245 kB gzip (meta ≤ 250 kB). React e
  zustand foram para um chunk `react` próprio (69 kB gzip), então a interface não espera mais o Three.js; o bloom
  (`PostFx`, 5 kB gzip) só é baixado nos presets Alta/Ultra.
- Direção de arte: o estudo "Natal brasileiro de verão" (palmeiras, terracota) deu lugar à vila nevada, confirmada
  pelo responsável em 2026-11-09 (OQ-07 resolvida; DEC no repositório de documentação pendente).
  O id de missão `gift-palm` foi mantido.
- ROADMAP: novo marco "Infraestrutura de entrega" (CI, staging, backup do D1, redução do chunk Three.js) e
  marco "Contas e ONGs" (0.4.0) detalhado em quatro entregas com critérios de pronto; missões no servidor
  antecipadas para a 0.4.0.

### Fixed

- Contador "Missões n/4" do HUD restrito às quatro missões rápidas (`MISSIONS`), mantendo as 15 quests narrativas
  em seção própria no Caderno.
- Clicar do outro lado da árvore podia deixar o avatar parado contra ela: a árvore agora é um obstáculo com
  deslizamento.

- Concluída a missão "2 presentes", o terceiro presente ficava visível para sempre e não podia ser pego: agora some.
- A posição do avatar deixou de ser gravada no estado da interface a cada quadro (seletores rodavam 60×/s).

## [0.3.0] - 2026-11-08

**Site público e domínio oficial** ([IMPL-0005](docs/decisions/0005-public-site-and-domains.md)). Schema D1 **v3**
(migration `0003` aplicada em produção junto com este deploy).

### Added

- `apps/site`: site público em <https://www.vilanoeldobem.com.br> — como funciona, doação transparente, critérios
  para ONGs; todos os "Entrar na Vila" levam ao jogo. Página 404 própria; `scripts/verify.mjs` (Chrome real).
- Domínios: jogo em <https://app.vilanoeldobem.com.br>; `vilanoeldobem.com.br` redireciona (301) para `www`.
- Scripts na raiz: `dev:site`, `deploy:site`; `build`/`typecheck`/`test` rodam em todos os apps.

### Changed

- Publicação da 0.2.0 (idiomas) em produção: migration `0003_english_schema` aplicada no D1 remoto.

### Fixed

- CSP bloqueava o beacon do Cloudflare Web Analytics injetado pela zona (erro de console); domínios liberados.

## [0.2.0] - 2026-11-08

**Padronização de idiomas** ([IMPL-0004](docs/decisions/0004-english-code-portuguese-docs.md)): código e conversa com
agentes em inglês, documentação e interface em pt-BR. Mudança incompatível na API e no schema. Schema D1 **v3**.

### Changed

- **BREAKING (API):** `/api/lots` usa `ngo_name`/`ngo_summary`, estados `available`/`application_sent`/
  `under_review`/`published` e ids `plaza-NN`; chaves de `/api/indicators` em inglês (`approved_ngos`,
  `registered_users`, `confirmed_donations`, `confirmed_amount`, `people_impacted`). Textos exibidos não mudaram.
- **BREAKING (schema):** migration `0003_english_schema` recria `ongs` → `ngos` (`ong_id` → `ngo_id`) com estados em
  inglês, preservando dados; `audit_events` passa a usar `ngo.*`.
- Ids de missões em inglês (`explore-gifts`, `play-memory`, `causes-visit-lot`, `causes-global-donation`); o progresso
  local recomeça (chave `vila.progress.v2`).
- Comentários, testes, scripts, tokens CSS e mensagens de `smoke-api.sh`/`verify.mjs` em inglês. Migrations
  `0001`/`0002`: só comentários traduzidos (SQL idêntico).
- `AGENTS.md`/`CLAUDE.md`: agentes respondem em inglês; regra de idiomas em `CONTRIBUTING.md` e no modelo de PR.

### Fixed

- `pnpm deploy` na raiz chamava o comando nativo do pnpm; agora `pnpm run deploy` executa o script.

## [0.1.0] - 2026-11-08

Fundação do repositório e **primeira fatia funcional** (rota de entrega B do doc 23: praça → terreno → jogo →
missão). Stack proposta em [IMPL-0001](docs/decisions/0001-stack-react-threejs-cloudflare.md); doações
desabilitadas por [IMPL-0002](docs/decisions/0002-donations-disabled-until-partner-contract.md).
Schema D1 **v2**.

### Added

- Praça voxel 3D (React + Three.js): árvore central como marcador da doação global, rua circular, postes, palmeiras,
  8 terrenos ao redor (P01, P03; layout provisório, PEN-017).
- Avatar padrão com movimento por teclado (WASD/setas) e por clique/toque; câmera diagonal que acompanha e se
  afasta em telas retrato (estudo, cartão G12).
- Entrada com três caminhos: Explorar ONGs, Jogar, Doação global (DEC-026).
- Painel da doação global com destinatário "Instituição parceira: a definir" e botão desabilitado (DEC-010..013).
- Painel de terreno com os três critérios de elegibilidade (DEC-015) e painel de casa publicada com
  "Jogar gratuitamente" e "Doar para esta ONG" desabilitado (DEC-028/029).
- Jogo da Memória (P09, primeiro jogo do doc 23).
- Caderno de Missões com 4 missões em 3 trilhas (Explorar, Brincar, Conhecer causas), XP e nível; progresso
  idempotente salvo no navegador (DEC-039/040/042; missões e curva são proposta, PEN-025).
- Indicadores públicos lidos da API; valores sem fonte verificável aparecem como "—" (DEC-027).
- Worker Cloudflare com Static Assets e API somente leitura: `GET /api/health`, `/api/indicators`, `/api/lots`.
- D1: migrations `0001_initial` (ongs, lots, audit_events) e `0002_seed_lots` (8 terrenos disponíveis).
- Governança: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, modelo de PR e `docs/` (Diátaxis) com
  ADRs IMPL-0001..0003 e perguntas abertas.
- `apps/web/scripts/verify.mjs`: verificação em Chrome real (desktop e celular) com capturas.
- `scripts/smoke-api.sh`: conferência das rotas da API de qualquer deploy.
- Publicação na conta Cloudflare do projeto: https://vilanoeldobem.vilanoeldobem.workers.dev (Worker `vilanoeldobem`, D1 `vilanoeldobem` em `enam`).

### Security

- Cabeçalhos estritos em `public/_headers` (CSP, `X-Frame-Options: DENY`, `Permissions-Policy` sem pagamento,
  câmera, microfone e localização). API rejeita métodos de escrita (405).

### Known limitations

- Sem contas, cadastro de ONG, painel admin, chat, avatar editável, skins, badges (ver [ROADMAP.md](ROADMAP.md)).
- Progresso de missões existe só no navegador até o cadastro (D06).
- Paleta, tipografia e logo são marcadores provisórios.

<!--
[Unreleased]: <url>/compare/v0.1.0...HEAD
[0.1.0]: <url>/releases/tag/v0.1.0
-->
