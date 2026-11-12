# Registro da persistência de progresso — D12

> **Status:** Implementado; contas e quests desligadas em produção · **Versão do software:** 0.4.0 ·
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

**Controle negativo local:** o teste `tests/progress-account.test.mjs`, executado com o `progress.ts` anterior
(`51480aa`), falhou com sincronização `pending` onde exigia `saved`. O arquivo corrigido foi restaurado após
a prova; o controle confirma que a regressão detecta o defeito apontado pelo revisor.

**CI da correção integrada:** [commit `26c9553`](https://github.com/vilanoeldobem/project/actions/runs/43272075449/job/131370948005),
Linux / Node 24.22.2 / pnpm 10.32.1: `pnpm typecheck`, **608 testes** (shared 146, API 197, client 180,
dash 53, server 23, site 9), `pnpm build` e smoke real de mídia passaram. O teste integrado de login/reload
faz parte dos 197 testes da API e passou com o cliente e o handler reais.

**Prova adicional de progresso no Worker:** `node scripts/verify-media-local.mjs --progress` aplica a sequência
0001–0008 num D1 local novo, executa as fixtures sintéticas e `verify-progress.mjs`. A opção ativa quests
somente na configuração temporária do simulador; os arquivos de produção permanecem inalterados. O teste
confere duas sessões concorrentes, replay sem XP duplicado, 100 XP/nível 2, leitura entre sessões e isolamento
de conta. [CI do commit `3e7a82c`](https://github.com/vilanoeldobem/project/actions/runs/43272723857/job/131373129051)
passou novamente typecheck, os **608 testes**, build e ambos os smokes (mídia e progresso).

O mesmo CI também passou `node scripts/verify-media-local.mjs --browser`, com Chromium real, jogo/painel
em modo local e o fluxo de candidatura/arquivos/avisos de publicação. GTM foi substituído: analytics e envio
real de e-mail não fazem parte dessa evidência. `git diff --check` e revisão estática passaram. A execução
remota no CI evitou acrescentar carga ao host local; todos os dados eram sintéticos, em recursos locais do runner.

## Limites

Contas e quests permanecem desligadas em produção. O servidor valida IDs e transições, sem provar ações na
cena 3D. Não há sincronização visual instantânea entre abas, abandono automático ou substituição de quest ativa.
OQ-09/PEN-025 continuam pendentes. Esta entrega não inclui deploy, migration remota nem alteração de recurso Cloudflare.

Comportamentos mantidos de propósito, à espera de OQ-09: (1) ao entrar, eventos de quest de visitante incompatíveis
com a quest ativa da conta são descartados, inclusive objetivos e `turn-in` feitos como visitante; (2) numa aba
desatualizada, um evento omitido pelo servidor sai da fila com `200` e a tela só mostra o progresso da conta na
próxima entrada; (3) falha do servidor na sincronização (`409 progress_conflict`, `5xx`) usa o mesmo aviso de
"sem conexão" e é reenviada em novo evento, ao voltar a conexão ou na próxima entrada. A migration 0008 precisa
estar aplicada antes de ligar as contas: sem `progress_writes`, `POST /progress/events` responde `500`.

**Conferência final antes da integração:** controle negativo repetido (`tests/progress-account.test.mjs` falha com o
`progress.ts` de `51480aa` e passa com o atual); testes novos para a espera aleatória entre tentativas e para a
exclusão da conta com pedido em andamento (nada é gravado, resposta `401`); cabeçalhos de schema atualizados para v8.

A segunda rodada da revisão direta do #35 acrescenta visibilidade/recuperação da exclusão pendente e cache de
mídias, sem mudar o contrato de progresso descrito acima. Foi incorporada neste PR para validar a composição.
Os resultados anteriores são vinculados aos commits citados; os checks da [revisão atual do #30](https://github.com/vilanoeldobem/project/pull/30/checks)
são a fonte dos resultados da árvore combinada, incluindo `--progress` e o navegador com os novos avisos.
