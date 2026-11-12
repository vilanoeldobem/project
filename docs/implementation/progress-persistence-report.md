# Registro da persistência de progresso — D12

> **Status:** Implementado no código; validação da revisão final pendente · **Versão do software:** 0.4.0 ·
> **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `apps/api/src/progress.ts`, `tests/progress-account.test.mjs`,
> [PR #30](https://github.com/vilanoeldobem/project/pull/30), [IMPL-0019](../decisions/0019-progress-concurrency-and-acknowledgment.md).

## Entrega

Gravações simultâneas de missões e quests usam revisão e token no D1. Reenvios não movem eventos aceitos,
duplicam XP ou consomem novas vagas. Uma disputa relê o log e recalcula, com tentativas limitadas e jitter.
O contrato completo fica nas referências [API](../reference/api.md) e [armazenamento](../reference/storage.md).

## Correções da revisão técnica

- **Progresso divergente no login:** removido `409 progress_pending`. Eventos inaplicáveis são omitidos e o
  estado autoritativo da conta volta em `200`, preservando o comportamento anterior sem inventar abandono.
- **Regressão integrada:** teste na raiz conecta os módulos reais do cliente e da API com D1 SQLite. Exercita
  conta com 40 XP e `harness-bells` ativa, visitante com `lake-lanterns`, fila antiga e reload; verifica XP,
  proprietário do progresso, estado de sincronização e limpeza da fila. Não simula a resposta do servidor.
- **Contenção:** até três tentativas com espera curta aleatória; `progress_conflict` documentado na tabela de erros.
- **Numeração:** integração após #32 e #35, com migration 0008 e IMPL-0019. Nenhuma reserva fictícia de número
  para branches paralelas; nenhuma migration aplicada remotamente é renomeada.
- **Documentação:** referências descrevem o contrato; este registro substitui o plano de tarefas e entra no índice.

## Evidências

A suíte inclui testes SQL de concorrência, replay, rollback, limite, isolamento e recuperação entre sessões.
`apps/api/scripts/verify-progress.mjs` exercita o Worker e D1 locais com dados sintéticos e dois tokens de sessão.
O novo teste integrado entra na suíte da API via `apps/api/vitest.config.ts`.

**Execuções da revisão atual:** pendentes da coordenação; resultados anteriores não comprovam esta árvore.
Os comandos e resultados finais serão registrados no PR e em `tasks/todo.md` depois da validação.

## Limites

Contas e quests permanecem desligadas em produção. O servidor valida IDs e transições, sem provar ações na
cena 3D. Não há sincronização visual instantânea entre abas, abandono automático ou substituição de quest ativa.
OQ-09/PEN-025 continuam pendentes. Nenhum merge, deploy, migration remota ou recurso Cloudflare é executado.
