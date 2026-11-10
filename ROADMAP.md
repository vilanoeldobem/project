# Roadmap — Vila Noel do Bem

> **Atualizado em:** 2026-11-08 · **Versão atual:** 0.3.0 · **Prazo oficial:** 30/11/2026 (DEC-043) ·
> **Rota de entrega:** pendente de decisão (A integral ou B núcleo; doc 23, marco M01 em 10/11)
> **Fonte:** `vilanoeldobem_docs/management/plano-de-desenvolvimento.md`,
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
| Decisões e publicação de teste | 0.3.x | — | G11, G12, M01 | **Em andamento** | 09–10/11 |
| Infraestrutura de entrega | 0.3.x | — | D01 (complemento) | **Próximo** (não depende de decisões) | 09–10/11 |
| Contas e ONGs | 0.4.0 | P12, P13, P03 completo, P14 (servidor) | D05–D09, D12 | Planejado — aguarda OQ-08 e revisão LGPD | 11–17/11 |
| HUD da ONG e segundo jogo | 0.5.0 | P04 completo, P09 | D10, D24 | Planejado | 15–19/11 |
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

### Infraestrutura de entrega (0.3.x) — próximo

**Objetivo:** tornar cada entrega até 30/11 segura e verificável, sem depender de decisões de produto.

| # | Entrega | Pronto quando |
|---|---|---|
| 1 | **CI no GitHub Actions** | Todo PR roda `pnpm typecheck`, `pnpm test` e `pnpm build`; após deploy, `scripts/smoke-api.sh` contra produção. PR com gate vermelho não entra na `main`. |
| 2 | **Ambiente de homologação (staging)** | Worker `vilanoeldobem-staging` com D1 próprio (`wrangler.jsonc` → `env.staging`); migrations testadas lá antes do remoto de produção; endereço documentado em `docs/guides/deploy.md`. |
| 3 | **Backup e restauração do D1** | Procedimento documentado com D1 Time Travel e export periódico; restauração ensaiada uma vez no staging. |
| 4 | **Redução do chunk Three.js** | Importar só o necessário de `@react-three/drei`; meta ≤ 250 kB gzip no chunk `three`, medida no build e registrada no CHANGELOG. |

### Contas e ONGs (0.4.0)

**Objetivo:** fechar a jornada "ONG se candidata → admin aprova → casa aparece no terreno" e guardar o progresso
do jogador no servidor.

| # | Entrega | Tela / decisão | Pronto quando |
|---|---|---|---|
| 1 | **Cadastro leve de usuário** | P13, DEC-038 | Exatamente Nome, Nickname, Cidade e E-mail; só o nickname é público; nickname único; e-mail verificado; nada além disso coletado (LGPD/ECA Digital). |
| 2 | **Candidatura de ONG em 4 etapas** | P12, DEC-015, DEC-037 | "Dados da organização / Documentos e comprovações / Apresentação e projetos / Revisão e envio"; terreno passa a `application_sent`; documentos privados fora do repositório e dos logs. |
| 3 | **Painel admin** | P12, DEC-037, DEC-028 | "Aprovar / Pedir ajustes / Rejeitar" com histórico em `audit_events`; só a aprovação publica a casa no terreno; acesso restrito a admins. |
| 4 | **Missões e XP no servidor** | P14, DEC-039/040/042 | Eventos idempotentes por id único no D1; progresso local migrado ao entrar na conta; mesmas regras de `progress.ts` (doação sozinha não dá XP). |

**Decidido (2026-11-09):** visitante livre, conta opcional (OQ-02); login por link mágico no e-mail (OQ-03).
**Depende de:** provedor de envio de e-mail (OQ-08) e revisão LGPD / ECA Digital antes do cadastro.
revisão LGPD / ECA Digital antes do cadastro.

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
| CI (typecheck, test, build em PR) | **Próximo** | Marco "Infraestrutura de entrega", item 1 |
| Ambiente de homologação (staging) | **Próximo** | Marco "Infraestrutura de entrega", item 2 |
| Backup e restauração do D1 | **Próximo** | Marco "Infraestrutura de entrega", item 3 |
| Redução do chunk Three.js | **Próximo** | Marco "Infraestrutura de entrega", item 4 |
| Logs de erro | Parcial | `observability.enabled` no Worker |
| Revisão LGPD / ECA Digital | Não iniciado | antes do cadastro (0.4.0) |

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
| Chunk `three` de ~1,1 MB (310 kB gzip) | `apps/web` | Primeiro carregamento lento em 3G | Infraestrutura de entrega, item 4 |
| Progresso só em `localStorage` | `src/game/store.ts` | Perde-se ao trocar de aparelho | Persistir no D1 com a conta (0.4.0, item 4) |
| Posições dos terrenos duplicadas (TS e SQL) | `world.ts`, `0002_seed_lots.sql` | Divergência possível | Coberto por teste; gerar SQL a partir do TS |
