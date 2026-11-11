# Changelog

Todas as mudanças notáveis da Vila Noel do Bem são registradas neste arquivo.

O formato segue [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota
[Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/). A política completa (o que cada número significa,
versão do schema D1, processo de release) está em [`docs/reference/versioning.md`](docs/reference/versioning.md).
Cada versão indica o schema D1 que entrega.

## [Unreleased]

### Changed

- **Monorepo separado em apps e subdomínios** ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)):
  `apps/client` (jogo, `play.vilanoeldobem.com.br`; `app.*` redireciona com 301), `apps/api` (API + D1,
  `api.vilanoeldobem.com.br`), `apps/server` (presença em tempo real, `server.vilanoeldobem.com.br`), `apps/site`
  (sem mudança, links para `play.*`) e `packages/shared` (lógica pura comum). **Incompatível:** rotas da API perdem
  o prefixo `/api` (`/health`, `/indicators`, `/lots`, `/environment`); presença em `wss://server.…/room`. CORS e
  WebSocket só para origens exatas; CSP do jogo gerada por build. `smoke-api.sh` confere os três serviços.

### Added

- Conteúdo procedural por semente ([IMPL-0010](docs/decisions/0010-seeded-procedural-voxel-content.md), PROPOSTA):
  núcleo de geradores determinísticos (PRNG por semente, partes, paleta nomeada, orçamento por categoria testado,
  snapshots) e 9 geradores de adereços (presente, lanterna, cerca, trenó, caixa de correio, placa, guirlanda,
  barraca, barraca de panetone) e de chalés (planta, andares, três telhados, varanda, guirlanda, chaminé), moradores (corpo, casaco, cachecol, chapéu,
  tons de pele) e animais (rena, cachorro, gato, passarinho, coelho, coruja noturna) com respiração em shader;
  decoração com 3 moradores e 6 animais na Vila (PROPOSTA). Presentes
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
