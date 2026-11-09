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
| Contas e ONGs | 0.4.0 | P12, P13, P03 completo | D05–D09 | Planejado | 11–17/11 |
| HUD da ONG e progressão | 0.5.0 | P04, P14 (servidor) | D10, D12 | Planejado | 15–19/11 |
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

### Contas e ONGs (0.4.0)

**Escopo:** cadastro leve (Nome, Nickname, Cidade, E-mail — DEC-038), método de login (pendente), candidatura de
ONG em 4 etapas, aprovação admin com auditoria (DEC-037), estados do terreno (DEC-028).
**Depende de:** método de autenticação e regra visitante × conta (open-questions OQ-02, OQ-03).

### HUD da ONG e progressão (0.5.0)

**Escopo:** casa publicada com conteúdo real, missões e XP no servidor com idempotência (DEC-042), segundo jogo.

### Doação e badges (0.6.0) — bloqueado

**Escopo:** integração com o provedor da parceira (preferência por página de campanha identificada — PRP-015/016),
estados da doação (iniciada → … → conciliada/devolvida/contestada), badges por doação confirmada (DEC-041).
**Desbloqueia quando:** contrato da instituição parceira (G13) e provedor definido (PEN-006).

## Tarefas de base (independentes de marco)

| Tarefa | Status | Observação |
|---|---|---|
| CI (typecheck, test, build em PR) | Não iniciado | GitHub Actions após criação do remoto |
| Ambiente de homologação (staging) | Não iniciado | Worker `vilanoeldobem-staging` + D1 separado |
| Backup e restauração do D1 | Não iniciado | D1 Time Travel + export periódico |
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
| Chunk `three` de ~1,1 MB (310 kB gzip) | `apps/web` | Primeiro carregamento lento em 3G | Importar só módulos usados de `drei`; avaliar compressão de assets |
| Progresso só em `localStorage` | `src/game/store.ts` | Perde-se ao trocar de aparelho | Persistir no D1 com a conta (0.4.0/0.5.0) |
| Posições dos terrenos duplicadas (TS e SQL) | `world.ts`, `0002_seed_lots.sql` | Divergência possível | Coberto por teste; gerar SQL a partir do TS |
