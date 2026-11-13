# Vila Noel do Bem

Vila natalina virtual em 3D voxel para explorar, jogar, conhecer organizações sociais e fazer o bem.
Este repositório contém o código; a definição do produto vive no repositório de documentação
[`vilanoeldobem/docs`](https://github.com/vilanoeldobem/docs).

> [!WARNING]
> **Em desenvolvimento.** Primeira fatia funcional (praça, terrenos, missões, Jogo da Memória).
> Contas e cadastro de ONGs (0.4.0) estão implementados, mas **desligados em produção** até a revisão
> LGPD / ECA Digital.
> Doações estão **desabilitadas** até a definição e o contrato da instituição parceira (PEN-004)
> e do provedor de pagamento (PEN-006). Visual, paleta e logo são provisórios (DEC-023/024).

**Versão atual: 0.4.0** (2026-11-12) · schema D1 v6 (produção na v3, contas desligadas) · [changelog](CHANGELOG.md) · [roadmap](ROADMAP.md) ·
prazo oficial **30/11/2026** (DEC-043)

**Site:** <https://www.vilanoeldobem.com.br> · **Jogo:** <https://play.vilanoeldobem.com.br>

## O que já existe

| Tela (doc 20) | O que é | Status |
|---|---|---|
| P01 Praça + doação global | Praça voxel, árvore central, três entradas (Explorar ONGs, Jogar, Doação global) | **Parcial** — doação sem pagamento |
| P02 Indicadores públicos | Indicadores com "—" quando não há fonte verificável | **Parcial** |
| P03 Terrenos | 12 terrenos de ONG na fachada da praça, estado lido do D1; "Candidatar minha ONG" em terreno disponível. Em volta, lojas, placas e 112 terrenos residenciais como PROPOSTA (posse desligada, [IMPL-0023](docs/decisions/0023-village-expansion-and-zoning.md)) | **Parcial** |
| P04 HUD da ONG + minijogo | Painel da casa publicada; "Jogar gratuitamente" | **Parcial** |
| P09 Minijogos | Jogo da Memória | **Parcial** (1 jogo) |
| P12 Cadastro e análise de ONGs | Candidatura em 4 etapas no jogo; análise no painel administrativo (`apps/dash`), decisões auditadas | **Implementado, desligado em produção** ([IMPL-0011](docs/decisions/0011-accounts-magic-link-ngo-review.md)); painel publicado em 2026-11-12 ([IMPL-0015](docs/decisions/0015-dash-backoffice-app.md)) |
| P13 Cadastro de usuário | Nome, Nickname, Cidade e E-mail; entrada por link mágico; só o nickname é público | **Implementado, desligado em produção** (aguarda revisão LGPD / ECA Digital) |
| P14 Missões / XP / níveis | Caderno de Missões, 4 missões em 3 trilhas, XP local e, com conta, no servidor | **Parcial** — sem conta, progresso só no navegador |
| P05–P08, P10, P11, P15 | Chat, emotes, avatar, skins, expansão, indicação, badges | Planejado ([roadmap](ROADMAP.md)) |

## Stack

| Camada | Tecnologia |
|---|---|
| Cliente | React 19, Three.js 0.187 via `@react-three/fiber` 9 + `@react-three/drei`, zustand, Vite 8 |
| Servidor | Cloudflare Workers, um por app ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)): Static Assets (jogo, site e painel administrativo), API HTTP + D1 (SQLite), presença em tempo real (Durable Object) |
| Testes | Vitest (lógica e API), `playwright-core` com Chrome do sistema (verificação visual) |

Escolha registrada como **proposta a validar** em [IMPL-0001](docs/decisions/0001-stack-react-threejs-cloudflare.md)
(cartão G11 do acompanhamento).

## Layout do repositório

```
apps/client/     jogo: cliente 3D (React + Three.js, Static Assets) — play.vilanoeldobem.com.br
apps/api/        API HTTP + D1 (rotas públicas e, atrás de ACCOUNTS_ENABLED, contas e ONGs) — api.vilanoeldobem.com.br
apps/server/     presença em tempo real (Durable Object VillageRoom) — server.vilanoeldobem.com.br
apps/site/       site público (React + Vite) — www.vilanoeldobem.com.br
apps/dash/       painel administrativo (React + Vite, Static Assets) — dash.vilanoeldobem.com.br
packages/shared/ lógica pura usada por mais de um app (@vila/shared/…): mundo, movimento, missões, ambiente, protocolo
migrations/      migrations D1 NNNN_nome.sql (imutáveis depois de aplicadas)
docs/            documentação técnica (Diátaxis) — índice em docs/README.md
scripts/         utilitários de desenvolvimento/operação
tasks/           registro de trabalho dos agentes (todo.md)
.github/         modelo de pull request
```

## Começo rápido

```bash
pnpm install
pnpm db:migrate:local                       # D1 local com os terrenos
pnpm dev                                    # http://localhost:5173 (Vite) + API :8787 + servidor :8788
# ou o jogo servido pelo Worker, como em produção (três terminais):
pnpm --filter @vila/api dev                 # API      → http://localhost:8787 (contas ligadas, devLink)
pnpm --filter @vila/server dev              # servidor → http://localhost:8788
pnpm --filter @vila/client dev:worker       # jogo     → http://localhost:8799
pnpm --filter @vila/dash dev:worker         # painel administrativo → http://localhost:8797 (ou `pnpm dev:dash`, Vite :5175)
pnpm dev:site                               # site público
pnpm check                                  # typecheck + testes + build
node apps/client/scripts/verify-accounts.mjs  # contas e ONGs no navegador: jogo + painel (só local; 60 s entre execuções)
```

Passo a passo: [`docs/getting-started.md`](docs/getting-started.md). Publicação: [`docs/guides/deploy.md`](docs/guides/deploy.md).

## Documentação

| Preciso de… | Comece em |
|---|---|
| Rodar pela primeira vez | [`docs/getting-started.md`](docs/getting-started.md) |
| Desenvolver e abrir PR | [`docs/guides/development.md`](docs/guides/development.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Publicar na Cloudflare | [`docs/guides/deploy.md`](docs/guides/deploy.md) |
| Entender a arquitetura e a API | [`docs/reference/architecture.md`](docs/reference/architecture.md), [`docs/reference/api.md`](docs/reference/api.md) |
| Saber por que algo é assim | [`docs/explanation/`](docs/explanation/), [`docs/decisions/`](docs/decisions/README.md) |
| Regras para agentes de código | [`AGENTS.md`](AGENTS.md) |

## Idiomas

Documentação e interface em português (pt-BR); código e conversa com agentes de código em inglês (en-US) —
[IMPL-0004](docs/decisions/0004-english-code-portuguese-docs.md).

## Equipe

Bernard (gestão), Augusto e Nicolas (desenvolvimento full-stack).

## Licença

[MIT](LICENSE).
