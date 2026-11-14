# Roadmap — Vila Noel do Bem

> **Atualizado em:** 2026-11-14 · **Versão atual:** 0.5.0 · **Prazo oficial:** 30/11/2026 (DEC-043) ·
> **Rota de entrega:** pendente de decisão (A integral ou B núcleo; doc 23, marco M01 em 10/11)
> **Fonte:** `vilanoeldobem/docs/management/plano-de-desenvolvimento.md`,
> `management/acompanhamento/acompanhamento.json`

Este roadmap traduz o plano de desenvolvimento (proposta) em versões do código. Cada marco entrega uma versão
MINOR. O acompanhamento oficial de tarefas continua no Kanban/Gantt do repositório de documentação; os códigos
de cartão (G, D, Q, M) são citados aqui. Mudanças de ordem são registradas aqui e, quando afetam contratos
(API, schema), em um ADR.

## Princípios do roadmap

1. Nada é marcado como entregue sem os gates verdes (`typecheck`, `test`, `build`) e verificação em navegador real.
2. Nenhum fluxo de dinheiro é simulado: doação e compra só existem quando parceira e provedor estiverem contratados.
3. Nenhum número público sem fonte verificável.
4. A rota B (núcleo) vem primeiro; a rota A acrescenta escopo sem quebrar o núcleo.
5. 28–29/11 são reserva: sem escopo novo.

## Visão geral

| Marco | Versão-alvo | Telas | Cartões | Status | Janela |
|---|---|---|---|---|---|
| Fundação + primeira fatia | 0.1.0 | P01, P02, P03, P04, P09, P14 (parciais) | D01, D02, D03, D04, D11 (parcial) | **Entregue** 2026-11-08 | 08–10/11 |
| Padronização de idiomas (IMPL-0004) | 0.2.0 | — | — | **Entregue** 2026-11-08 | 08/11 |
| Site público e domínios (IMPL-0005) | 0.3.0 | — | — | **Entregue** 2026-11-08 | 08/11 |
| Ambiente natalino (IMPL-0006) | Unreleased | — | — | **Entregue** 2026-11-09 (em produção) | 09/11 |
| Decisões e publicação de teste | 0.3.x | — | G11, G12, M01 | **Em andamento** | 09–10/11 |
| Infraestrutura de entrega | 0.3.x | — | D01 (complemento) | **Em andamento** (CI entregue) | 09–10/11 |
| Contas e ONGs | 0.4.0 | P12, P13, P03 completo, P14 (servidor) | D05–D09, D12 | **Implementado** (desligado em produção até revisão LGPD/ECA) | 11–17/11 |
| Moderação, entrada direta, expansão e vida na Vila (IMPL-0021..0025) | 0.5.0 | — | — | **Entregue** 2026-11-14 (propostas desligadas em produção) | 13–14/11 |
| HUD da ONG e segundo jogo | 0.5.x | P04 completo, P09 | D10, D24 | Planejado | 15–19/11 |
| Doação e badges | 0.6.0 | P01 doação, P15 | D13, D14 | **Bloqueado** (G13 contrato, PEN-004/006) | 20–23/11 |
| Rota A: social e personalização | 0.7.0 | P05–P08, P10, P11, P02 completo | D15–D24 | Pendente de decisão (rota A) | 15–23/11 |
| QA e release candidate | 1.0.0-rc | todas entregues | Q01–Q09, M04 | Planejado | 24–27/11 |
| Publicação | 1.0.0 | — | M05 | Planejado | 30/11 |

## Detalhamento por marco

### Fundação + primeira fatia (0.1.0) — entregue

**Objetivo:** repositório com governança, stack funcionando de ponta a ponta (cliente 3D, Worker, D1) e o núcleo
da jornada navegável.
**Entregue (2026-11-08):** praça voxel, avatar, câmera, terrenos do D1, painéis P01/P02/P03/P04, Jogo da Memória,
Caderno de Missões local. Ver [CHANGELOG](CHANGELOG.md#010---2026-11-08).
**Fica para depois:** contas, cadastro de ONG, admin, persistência de XP no servidor.

### Decisões e publicação de teste (0.3.x) — em andamento

**Objetivo:** validar a stack (G11) e a câmera/desempenho em celular real (G12) com a versão publicada na conta
Cloudflare do projeto. **Publicado em 2026-11-08:** jogo em https://app.vilanoeldobem.com.br e site em https://www.vilanoeldobem.com.br; falta o teste em aparelhos reais.
Com a separação em apps ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md), deploy pendente), o jogo
passa a https://play.vilanoeldobem.com.br (`app.*` redireciona), a API a `api.*` e a presença a `server.*`.

### Infraestrutura de entrega (0.3.x) — em andamento

**Objetivo:** tornar cada entrega até 30/11 segura e verificável, sem depender de decisões de produto.

| # | Entrega | Pronto quando |
|---|---|---|
| 1 | **CI no GitHub Actions** — entregue 2026-11-09 (`.github/workflows/ci.yml`, `smoke.yml`); falta proteger a `main` | Todo PR roda `pnpm typecheck`, `pnpm test` e `pnpm build`; após deploy, `scripts/smoke-api.sh` contra produção. PR com gate vermelho não entra na `main`. |
| 2 | **Ambiente de homologação (staging)** | Workers de homologação (`env.staging` no `wrangler.jsonc` de cada app: client, api, server) com D1 próprio; migrations testadas lá antes do remoto de produção; endereço documentado em `docs/guides/deploy.md`. |
| 3 | **Backup e restauração do D1** | Procedimento documentado com D1 Time Travel e export periódico; restauração ensaiada uma vez no staging. |
| 4 | **Redução do chunk Three.js** — entregue 2026-11-10: 317 → 245 kB gzip (React em chunk próprio, bloom sob demanda) | Meta ≤ 250 kB gzip no chunk `three`, medida no build e registrada no CHANGELOG. |

### Contas e ONGs (0.4.0) — implementado, desligado em produção

**Objetivo:** fechar a jornada "ONG se candidata → admin aprova → casa aparece no terreno" e guardar o progresso
do jogador no servidor. **Implementado em 2026-11-11** ([IMPL-0011](docs/decisions/0011-accounts-magic-link-ngo-review.md))
atrás da bandeira `ACCOUNTS_ENABLED`, que fica `"false"` em produção até a revisão LGPD / ECA Digital.

| # | Entrega | Tela / decisão | Entregue | Falta |
|---|---|---|---|---|
| 1 | **Cadastro leve de usuário** | P13, DEC-038 | Exatamente Nome, Nickname, Cidade e E-mail; só o nickname é público; nickname único (sem diferenciar maiúsculas); e-mail verificado por link mágico (15 min, uso único, sem senha); sessão em cookie `HttpOnly`; exclusão da conta pelo próprio usuário. | Revisão LGPD / ECA Digital (idade mínima, consentimentos, retenção); moderação de nicknames; cadastro do domínio no Email Service; regras de formato ainda PROPOSTA. |
| 2 | **Candidatura de ONG em 4 etapas** | P12, DEC-015, DEC-037 | "Dados da organização / Documentos e comprovações / Apresentação e projetos / Revisão e envio"; CNPJ com dígitos verificadores, abertura ≥ 1 ano, três declarações; terreno passa a `application_sent`; reenvio após ajustes ou rejeição. | Upload de documentos (lista PENDENTE, PEN-019); campos da candidatura ainda PROPOSTA; medida de 1 ano (PEN-013). |
| 3 | **Painel admin** | P12, DEC-037, DEC-028 | Análise de ONGs: iniciar análise, aprovar, pedir ajustes, rejeitar (mensagem obrigatória); histórico em `audit_events`; só a aprovação publica a casa; papel de administrador concedido e retirado pelo painel, com auditoria (só o primeiro é criado à mão no D1; [IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md)); "Aprovar" só com os três critérios marcados. Desde a [IMPL-0015](docs/decisions/0015-dash-backoffice-app.md) fica no app `apps/dash` (`dash.*`, fora do jogo), com terrenos, auditoria, contas e estado do sistema. | Publicar o painel (autorização; sem Cloudflare Access, OQ-10); avisos por e-mail das decisões (a organização vê a situação no jogo); sanções (regras não definidas, OQ-11; o bloqueio de conta existe como PROPOSTA, desligado); doações, indicadores e documentos (só avisos no painel). |
| 4 | **Missões e XP no servidor** | P14, DEC-039/040/042 | Eventos idempotentes `(conta, missão, evento)` no D1; progresso local migrado ao entrar; mesmo `applyEvent` de `progress.ts` no cliente e na API. | Ligar em produção (depende da revisão LGPD / ECA Digital). |

**Decidido:** visitante livre, conta opcional (OQ-02, 2026-11-09); login por link mágico no e-mail (OQ-03,
2026-11-09); envio pelo Resend (OQ-08 revista em 2026-11-11, IMPL-0012).
**Para ligar em produção:** revisão LGPD / ECA Digital registrada pelo dono do produto e domínio verificado no
Resend, com a chave `RESEND_API_KEY` no Worker ([deploy §7](docs/guides/deploy.md#7-contas-e-ongs-040)).

### HUD da ONG e segundo jogo (0.5.0)

**Escopo:** casa publicada com conteúdo real (descrição, fotos, projetos, painel de estatísticas — DEC-028/029) e
segundo minijogo (Jogo da Velha, doc 23).

### Doação e badges (0.6.0) — bloqueado

**Escopo:** integração com o provedor da parceira (preferência por página de campanha identificada — PRP-015/016),
estados da doação (iniciada → … → conciliada/devolvida/contestada), badges por doação confirmada (DEC-041).
**Desbloqueia quando:** contrato da instituição parceira (G13) e provedor definido (PEN-006).

## Tarefas de base (independentes de marco)

| Tarefa | Status | Observação |
|---|---|---|
| CI (typecheck, test, build em PR) | **Entregue** (falta proteção da `main`) | Marco "Infraestrutura de entrega", item 1 |
| Ambiente de homologação (staging) | **Próximo** | Marco "Infraestrutura de entrega", item 2 |
| Backup e restauração do D1 | **Próximo** | Marco "Infraestrutura de entrega", item 3 |
| Redução do chunk Three.js | **Entregue** (245 kB gzip) | Marco "Infraestrutura de entrega", item 4 |
| Logs de erro | Parcial | `observability.enabled` em cada Worker |
| Revisão LGPD / ECA Digital | Não iniciado | bloqueia ligar as contas da 0.4.0 em produção |

## Riscos que podem reordenar o roadmap

- Rota de entrega não decidida até 10/11 (doc 23: risco crítico; 44 dias-dev disponíveis).
- Contrato da parceira (09–15/11) atrasar → doação e badges fora de 30/11.
- Desempenho 3D em celulares de entrada (orçamento pendente, G12).

## Como este roadmap é mantido

Atualizado a cada marco ou mudança de ordem, junto com o `CHANGELOG.md`. Datas espelham o plano do doc 23; se o
plano mudar, o plano vence e este arquivo é corrigido.

## Dívidas técnicas conhecidas

| Item | Onde | Efeito | Sugestão |
|---|---|---|---|
| Chunk `three` ainda com 245 kB gzip (three inteiro, r3f importa `* as THREE`) | `apps/client` | Cena demora em 3G (a interface já aparece antes) | Medir em celular (G12) antes de otimizar mais |
| Progresso só em `localStorage` para quem não tem conta | `apps/client/src/game/store.ts` | Perde-se ao trocar de aparelho | Com conta, já persiste no D1 (0.4.0, item 4); depende de ligar as contas |
| Posições dos terrenos duplicadas (TS e SQL) | `packages/shared/src/game/world.ts`, `0002_seed_lots.sql` | Divergência possível | Coberto por teste; gerar SQL a partir do TS |
