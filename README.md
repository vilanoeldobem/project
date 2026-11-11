# Vila Noel do Bem

Vila natalina virtual em 3D voxel para explorar, jogar, conhecer organizações sociais e fazer o bem.
Este repositório contém o código; a definição do produto vive no repositório de documentação
[`vilanoeldobem_docs`](https://github.com/vilanoeldobem/vilanoeldobem_docs).

> [!WARNING]
> **Em desenvolvimento.** Primeira fatia funcional (praça, terrenos, missões, Jogo da Memória).
> Doações estão **desabilitadas** até a definição e o contrato da instituição parceira (PEN-004)
> e do provedor de pagamento (PEN-006). Visual, paleta e logo são provisórios (DEC-023/024).

**Versão atual: 0.3.0** (2026-11-08) · schema D1 v3 · [changelog](CHANGELOG.md) · [roadmap](ROADMAP.md) ·
prazo oficial **30/11/2026** (DEC-043)

**Site:** <https://www.vilanoeldobem.com.br> · **Jogo:** <https://app.vilanoeldobem.com.br>

## O que já existe

| Tela (doc 20) | O que é | Status |
|---|---|---|
| P01 Praça + doação global | Praça voxel, árvore central, três entradas (Explorar ONGs, Jogar, Doação global) | **Parcial** — doação sem pagamento |
| P02 Indicadores públicos | Indicadores com "—" quando não há fonte verificável | **Parcial** |
| P03 Terrenos | 8 terrenos ao redor da praça, estado lido do D1 | **Parcial** — sem cadastro de ONG |
| P04 HUD da ONG + minijogo | Painel da casa publicada; "Jogar gratuitamente" | **Parcial** |
| P09 Minijogos | Jogo da Memória | **Parcial** (1 jogo) |
| P14 Missões / XP / níveis | Caderno de Missões, 4 missões em 3 trilhas, XP local | **Parcial** — progresso só no navegador |
| Conta opcional | Cadastro, confirmação por link, sessão e saída | **Em revisão / local** — envio real de e-mail e produção desabilitados |
| P05–P08, P10–P13, P15 | Chat, emotes, avatar, skins, expansão, indicação, badges | Planejado ([roadmap](ROADMAP.md)) |

## Stack

| Camada | Tecnologia |
|---|---|
| Cliente | React 19, Three.js 0.187 via `@react-three/fiber` 9 + `@react-three/drei`, zustand, Vite 8 |
| Servidor | Cloudflare Worker (Static Assets + `/api/*`), D1 (SQLite) |
| Testes | Vitest (lógica e API), `playwright-core` com Chrome do sistema (verificação visual) |

Escolha registrada como **proposta a validar** em [IMPL-0001](docs/decisions/0001-stack-react-threejs-cloudflare.md)
(cartão G11 do acompanhamento).

## Layout do repositório

```
apps/web/        jogo: cliente 3D (src/) + Worker (worker/) + config Cloudflare — app.vilanoeldobem.com.br
apps/site/       site público (React + Vite) — www.vilanoeldobem.com.br
migrations/      migrations D1 NNNN_nome.sql (imutáveis depois de aplicadas)
docs/            documentação técnica (Diátaxis) — índice em docs/README.md
scripts/         utilitários de desenvolvimento/operação
tasks/           registro de trabalho dos agentes (todo.md)
.github/         modelo de pull request
```

## Começo rápido

```bash
pnpm install
pnpm --filter @vila/web db:migrate:local   # D1 local com os terrenos
pnpm dev:worker                             # http://localhost:8787 (Worker + D1 + SPA)
# ou só o cliente, sem API:
pnpm dev                                    # http://localhost:5173
pnpm dev:site                               # site público
pnpm check                                  # typecheck + testes + build
```

Passo a passo: [`docs/getting-started.md`](docs/getting-started.md). Publicação: [`docs/guides/deploy.md`](docs/guides/deploy.md).

Cadastro/login local (Node 24+): [`docs/guides/auth-local.md`](docs/guides/auth-local.md). A migration v4 está
disponível para revisão e teste local; esta entrega não aplica migrations remotas nem ativa coleta pública.

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
