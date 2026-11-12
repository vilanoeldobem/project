# IMPL-0015: Painel administrativo em app e subdomínio próprios (`apps/dash`, `dash.*`)

**Status:** Aceita pelo responsável técnico (2026-11-11) para o app em si — implementado e testado; **não publicado**
(o Worker `vilanoeldobem-dash` e o domínio `dash.vilanoeldobem.com.br` ainda não existem na Cloudflare). O menu de
seções e as áreas "pendentes" são **PROPOSTA** até o dono do produto validar
**Data:** 2026-11-11
**Fontes:** pedido do responsável técnico em 2026-11-11 ("new worker for adm, ok"; "web rename to dash = backoffice
dashboard as dash.*"; "start and create base with all features we need"); `vilanoeldobem/docs`: DEC-015, DEC-027,
DEC-028, DEC-037, DEC-038, PEN-004, PEN-006, PEN-019; [IMPL-0009](0009-split-client-api-server-shared.md) (um Worker
por app) e [IMPL-0011](0011-accounts-magic-link-ngo-review.md) (contas e análise); código: `apps/dash/`,
`apps/api/src/{auth,backoffice,mail}.ts`, `packages/shared/src/accounts/{contract,errors}.ts`

## Contexto

A análise de ONGs (DEC-037) vivia dentro do jogo: um painel "Análise de ONGs" sobre a cena 3D, visível só para
contas com papel `admin`. Isso misturava duas coisas com públicos e riscos diferentes. O jogo é aberto, provável
público de menores, carrega Google Tag Manager e Cloudflare Web Analytics e tem uma CSP que libera esses terceiros;
a administração lida com CNPJ, evidências de candidaturas e decisões auditadas. Todo visitante baixava o código da
tela administrativa, e qualquer tela nova de administração (auditoria, contas, estado do sistema) engordaria o jogo.

Não há wireframe de backoffice no repositório de documentação além do P12 "Análise administrativa". O que o dono
confirmou: só um admin autorizado publica ou remove ONGs e aplica sanções, e toda mutação de admin é auditada
(DEC-037). As regras de sanção não estão definidas.

## Decisão

1. **App novo `apps/dash`** (`@vila/dash`), Worker `vilanoeldobem-dash`, endereço `dash.vilanoeldobem.com.br`.
   React 19 + Vite, só Static Assets: **sem script de Worker e sem bindings** (nada de D1, segredos ou service
   binding). Tudo o que ele mostra vem da API (`api.*`) com a sessão do admin. Sem three.js, sem roteador externo
   (um roteador de hash de ~40 linhas), sem biblioteca de componentes. `workers_dev: false` e `preview_urls: false`:
   o painel só responde no domínio próprio.
2. **Mesma conta, mesmo link mágico, mesmo cookie.** O painel não tem autenticação própria. A sessão é o cookie
   `__Host-vila_session` do host da API (IMPL-0011); `dash.*` e `api.*` são o mesmo site, então
   `credentials: "include"` funciona depois de a origem `https://dash.vilanoeldobem.com.br` entrar em
   `ALLOWED_ORIGINS` e `ACCOUNT_ORIGINS` da API. Quem já entrou no jogo abre o painel já autenticado. **O painel não
   cria contas** e nenhuma rota concede papel: `admin` continua sendo dado à mão no D1.
3. **Destino do link de acesso por origem exata.** Nova variável `DASH_ORIGIN` na API. `POST /auth/link` monta o
   link com `DASH_ORIGIN` quando — e só quando — o cabeçalho `Origin` da requisição é exatamente igual a
   `DASH_ORIGIN`; em qualquer outro caso vale a regra anterior (`GAME_ORIGIN`, o jogo). A comparação é de texto, sem
   curinga, prefixo ou normalização; nada no corpo, na query ou em outros cabeçalhos escolhe o destino.
   `POST /auth/register` vindo do painel é recusado (`403 forbidden_origin`): cadastro só no jogo. O e-mail diz que
   o link abre o painel administrativo. O token continua no fragmento (`/#login=`), e o painel o tira da barra de
   endereço antes de qualquer outro código rodar (`public/login-fragment.js`).
4. **O que saiu do jogo.** `apps/client/src/ui/Admin.tsx`, o painel `admin` do estado do jogo e as chamadas
   `adminList` / `adminGet` / `adminDecide` do cliente. No lugar, no painel da conta, um link simples "Abrir painel
   administrativo" (nova aba, `rel="noopener"`), visível só para admins. O jogo nunca chama `dash.*`: a origem do
   painel não entra no `connect-src` do jogo. A análise foi movida com as mesmas chamadas, as mesmas regras
   (verificações do DEC-015, mensagem obrigatória, versão analisada) e os mesmos textos de erro.
5. **Tipos e textos comuns em `packages/shared`:** `accounts/contract.ts` (formas das respostas de conta e de
   análise, rótulos de situação) e `accounts/errors.ts` (`ApiError`, frase em pt-BR por código). Usados pelo jogo e
   pelo painel; os apps continuam sem importar um do outro.
6. **Duas rotas novas, só de leitura** (`apps/api/src/backoffice.ts`): `GET /admin/audit` e `GET /admin/users`,
   com `requireAdmin`, `no-store` e paginação por `before` (instante ISO) e `limit` (1 a 100, padrão 50). Linhas que
   dividem o mesmo instante da última linha da página vêm junto (a página pode passar um pouco de `limit`), para a
   página seguinte não pular nenhuma. Sem migration: as tabelas e colunas já existiam.
7. **Minimização de dados.** A lista de contas traz `id`, `nickname`, `role`, `city`, `createdAt` e `verified` —
   **sem e-mail e sem nome**: só o nickname é público (DEC-038, AGENTS.md), menores são um público provável (LGPD,
   ECA Digital) e a tela não precisa de mais do que isso. A auditoria mostra o autor pelo nickname, nunca por id ou
   e-mail. O painel não guarda nada no navegador (nem `localStorage`).
8. **Ler não gera auditoria.** Consultar as listas não grava `audit_events`: a regra do projeto é auditar
   **mutações** de admin (DEC-037, AGENTS.md), e as únicas mutações do painel são as decisões de análise, que já
   eram auditadas. Se o dono quiser registrar também leituras (quem viu o quê), é decisão dele (OQ-11).
9. **Cabeçalhos gerados por build** (`apps/dash/security-headers.ts`, como no jogo): CSP `default-src 'self'`, sem
   script ou estilo inline, sem nenhum terceiro, `connect-src 'self'` + exatamente a origem da API da build,
   `frame-ancestors 'none'`; `X-Robots-Tag: noindex, nofollow` (e `<meta name="robots">`), `Referrer-Policy:
   no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, HTML com `Cache-Control: no-store, no-transform`. Sem
   analytics, sem Google Tag Manager, sem fontes externas.
10. **Seções da base** (menu **PROPOSTA**):

    | Seção | O que faz | Fonte dos dados | Status |
    |---|---|---|---|
    | Entrar | Pede o link de acesso; conta sem papel `admin` vê só "Apenas administradores" e "Sair" | `/auth/link`, `/auth/verify`, `/me` | Implementado |
    | Candidaturas | Análise de ONGs movida do jogo | `/admin/applications*` | Implementado (regras do IMPL-0011) |
    | ONGs e terrenos | Situação de cada terreno e a organização que o ocupa; só leitura | `/lots` + `/admin/applications` | Implementado |
    | Auditoria | `audit_events` paginado; só leitura | `/admin/audit` | Implementado |
    | Usuários | Contas pelo nickname; só leitura; aviso "Sanções: pendente de definição" | `/admin/users` | Implementado, sem ações |
    | Sistema | `/health` e bandeiras de `/config` da API; link para o `/health` do servidor de tempo real | `/health`, `/config` | Implementado |
    | Pendentes | Doações, Indicadores, Documentos e logos das ONGs: um parágrafo honesto cada, sem botão | — | **Só aviso** (PEN-004, PEN-006, DEC-027, PEN-019) |

11. **Contas desligadas.** Com `ACCOUNTS_ENABLED = "false"` (produção hoje), ninguém entra. O painel mostra o aviso
    "Contas desligadas", não chama nenhuma rota de conta e exibe só o que já é público (`/lots`, `/health`,
    `/config`); as seções que dependem de sessão dizem por que estão vazias. Nada de dado de exemplo.
12. **Servidor de tempo real: link, não CORS.** `server.*` não envia CORS, então o navegador não deixa o painel ler
    o `/health` dele. Em vez de abrir CORS no servidor só para esta tela, a seção "Sistema" traz um link para o
    endereço.

## Alternativas consideradas

- **Manter a análise no jogo:** recusada pelo responsável. Todo visitante baixa código administrativo, a tela
  convive com scripts de medição e cada função nova de backoffice pesa no jogo.
- **Rota `/admin` no mesmo host do jogo:** mesma CSP e os mesmos terceiros do jogo; um erro de XSS no jogo alcançaria
  a tela administrativa na mesma origem.
- **Worker com script (BFF) e service binding para a API:** permitiria um cookie só do painel e esconder a API
  administrativa da internet, mas duplica autenticação e autorização. Hoje a API já impõe papel, origem e auditoria
  em cada rota; um app estático não acrescenta superfície.
- **Cloudflare Access como única autenticação:** a API continuaria exposta em `api.*` e precisaria validar o JWT do
  Access em cada rota, além de mapear a identidade do Access para a conta que assina a auditoria. Fica como camada
  **adicional** recomendada (ver Consequências), não como substituta.
- **Destino do link informado pelo cliente** (campo `redirect` no corpo): recusada. Qualquer origem permitida
  poderia mandar um link legítimo que abre outro site com o token no fragmento.
- **E-mail e nome na lista de contas:** recusada (minimização). Se um dia a moderação precisar contatar alguém, isso
  pede regra do dono e uma tela própria, auditada.
- **Paginação por deslocamento (`offset`):** pula ou repete linhas quando entram eventos novos entre duas páginas.
- **Abrir CORS no servidor de tempo real para o painel:** amplia a superfície do servidor por um dado que um link
  resolve.

## Consequências

- **Nada foi publicado.** Criar o Worker `vilanoeldobem-dash` e o Custom Domain `dash.*` exige autorização humana
  explícita (AGENTS.md). Ordem: API primeiro (ela precisa conhecer a origem do painel), depois `pnpm deploy:dash`
  ([deploy.md §8](../guides/deploy.md#8-painel-administrativo-appsdash)).
- **Mais lugares para mudar ao trocar um host:** a origem do painel aparece em `ALLOWED_ORIGINS`, `ACCOUNT_ORIGINS`
  e `DASH_ORIGIN` da API, em `apps/client/src/lib/endpoints.ts` (link do jogo) e a origem da API em
  `apps/dash/src/lib/endpoints.ts` ([architecture.md §7](../reference/architecture.md#7-limites-entre-apps)).
- **O painel é público na rede** (como qualquer site estático): o que protege os dados é a API (sessão + papel
  `admin` + origem exata + auditoria). O HTML e o JavaScript do painel não contêm dado nenhum.
- **Sem Cloudflare Access na frente de `dash.*` (OQ-10, respondida pelo responsável técnico em 2026-11-11).** O
  painel usa só o login próprio; a API continua sendo a única barreira (sessão, papel `admin`, origem exata,
  auditoria). Uma política de Zero Trust com a lista de e-mails dos administradores seria uma segunda barreira na
  borda e pode ser ligada depois sem mudar o código. O Zero Trust foi reservado ao site interno `docs.*`.
- **Outros pontos a decidir antes de ligar as contas com o painel no ar:** sessão de admin com a mesma duração da de
  jogador (30 dias; uma duração menor ou reautenticação para decidir é PROPOSTA em aberto); regras de sanção
  (OQ-11); se leituras devem ser auditadas (OQ-11).
- **Web Analytics da zona:** a zona injeta o script do Cloudflare Web Analytics nas páginas. A CSP do painel o
  bloqueia, e o `no-transform` do HTML pede que a borda não altere a página (**HIPÓTESE** a confirmar no primeiro
  deploy: se o script ainda for injetado, aparece um erro de CSP no console e o `verify.mjs` do painel falha). O
  certo é excluir `dash.*` da injeção automática nas configurações do Web Analytics.
- **Sem índice novo:** `audit_events.at` e `users.created_at` não têm índice; as listas ordenam a tabela inteira.
  Aceito com o volume atual; quando crescer, uma migration nova cria os índices. Pelo mesmo motivo uma página não
  tem teto rígido: muitas linhas gravadas no mesmo instante (uma carga em lote) vêm todas numa resposta. Um cursor
  composto (`at`, `id`) resolve isso e entra junto com os índices.
- **`GAME_ORIGIN` vazio:** a regra anterior (`GAME_ORIGIN ?? origem do pedido`) foi mantida como estava; um valor
  `""` (homologação) geraria link relativo. Não acontece hoje (homologação tem as contas desligadas e nenhuma
  origem), mas é um ponto a corrigir antes de ligar contas lá.
- **Configuração conferida por teste:** `DASH_ORIGIN` precisa ser igual, caractere por caractere, à entrada do
  painel em `ACCOUNT_ORIGINS` (em `wrangler.jsonc` e no script `dev`); um teste da API falha se divergirem.
- **Limite de `/auth/*` compartilhado:** pedir link pelo painel conta no mesmo `AUTH_LIMITER` (10/min por IP) e nos
  mesmos limites por conta (3 a cada 15 minutos, 10 por dia).
- **Testes:** API de ponta a ponta sobre SQLite real (destino do link, origens estranhas, cadastro recusado, listas,
  paginação, ausência de e-mail e nome); lógica pura do painel (cliente da API, sessão, rotas, fragmento do link,
  cabeçalhos); navegador: `apps/dash/scripts/verify.mjs` (tela de entrada e estados com contas desligadas) e
  `apps/client/scripts/verify-accounts.mjs` (cadastro no jogo, entrada e análise no painel).

## Relacionados

[architecture.md](../reference/architecture.md) · [api.md](../reference/api.md) · [deploy.md](../guides/deploy.md) ·
[open-questions.md](open-questions.md) (OQ-10, OQ-11) · [IMPL-0002](0002-donations-disabled-until-partner-contract.md) ·
[IMPL-0009](0009-split-client-api-server-shared.md) · [IMPL-0011](0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0012](0012-resend-transactional-email.md) · DEC-015 · DEC-027 · DEC-028 · DEC-037 · DEC-038
