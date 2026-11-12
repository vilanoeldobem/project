# IMPL-0018: Concorrência e confirmação da persistência de progresso

**Status:** Proposta — implementação para revisão; bandeiras de produção inalteradas  
**Data:** 2026-11-12  
**Fontes:** autorização de Nicolas para D12; DEC-038/040/042, PEN-025;
[IMPL-0013](0013-quests-v1-runtime.md); `apps/api/src/progress.ts` e sincronização existente em
`apps/client/src/lib/account.ts`.

## Contexto

O progresso é reconstruído pelo redutor compartilhado a partir dos eventos da conta. As quests dependem da ordem
`accept` → objetivos → `turn-in`. Antes desta entrega, requisições podiam ler o mesmo log, validar transições
independentemente e depois executar `INSERT OR REPLACE`. Uma repetição de aceite podia ser movida para depois de
objetivos salvos por outra requisição, fazendo o replay perder progresso.

O cliente também considera `200` confirmação do lote enviado e remove os eventos da fila. Por isso, responder
sucesso a uma transição habilitada que ainda não foi aceita perde a oportunidade de reenvio. O comportamento
documentado no item 4 de IMPL-0013 precisa ser substituído; as regras e o catálogo do jogo permanecem iguais.

## Decisão

1. **Uma revisão por conta no D1.** A tabela `progress_writes`, criada pela migration
   `0007_progress_write_guard.sql`, guarda a revisão e o token da última escrita. A FK acompanha a exclusão da
   conta. Não armazena XP, dados pessoais adicionais ou uma segunda cópia do progresso.
2. **Ler uma fotografia consistente.** Revisão e log são obtidos na mesma consulta, mantendo a ordem histórica
   `created_at,rowid`. Ler a revisão e os eventos separadamente não é suficiente: outra escrita poderia ocorrer
   entre as leituras. A API continua usando o banco primário pelo binding D1 existente.
3. **Validar fora da transação, confirmar dentro dela.** O redutor atual calcula quais eventos são válidos.
   Um `batch` primeiro altera a revisão somente se ela ainda coincide com a leitura e grava um token único.
   Todas as escritas de eventos do lote exigem esse mesmo token. A revisão seguinte, sozinha, não identifica o
   vencedor: duas requisições concorrentes esperam o mesmo número. O D1 executa o lote como uma transação;
   falha em uma instrução reverte o conjunto.
4. **Recalcular após disputa.** Se a tentativa não alterar a revisão, ela não grava eventos. A API relê e tenta
   novamente, até três tentativas; persistindo a disputa, responde `409 progress_conflict`. Não existe mutex em
   memória, que seria insuficiente entre instâncias do Worker.
5. **Preservar eventos já aceitos.** Duplicatas não reposicionam o log. Uma linha legada que foi gravada quando
   inválida e continua ignorada no replay pode ser reposicionada somente quando seu reenvio representa uma
   transição agora válida, dentro da mesma proteção de concorrência. Eventos conhecidos das missões rápidas
   continuam armazenados uma vez, inclusive após o alvo. O teto de 500 considera a união de chaves únicas, não
   a quantidade de repetições no pedido.
6. **Manter a ordem ao acrescentar eventos.** O instante usado nas novas escritas não precede o maior
   `created_at` já armazenado. Empates usam `rowid`; a ordem das instruções do lote conserva a ordem válida
   calculada. Não se reordena o histórico antigo nem se modifica o redutor para esconder inconsistências.
7. **Não confirmar o que segue pendente.** Com quests habilitadas, o subconjunto válido pode ser confirmado no
   banco, mas um evento solicitado ainda incompatível produz `409 progress_pending`. O cliente conserva o lote
   e pode reenviá-lo inteiro; os eventos já salvos são idempotentes. Recusar tudo antes da escrita impediria que
   um aceite válido destravasse um objetivo que chegou antes dele no mesmo lote. Repetições já aplicadas ou
   eventos de uma quest concluída não ficam pendentes artificialmente.
8. **Preservar desligamento explícito.** Com a bandeira de quests desligada, eventos de quest continuam omitidos
   conforme IMPL-0013, sem impedir missões rápidas. IDs desconhecidos continuam invalidando o pedido.

## Alternativas consideradas

- **Mutex no Worker:** não coordena requisições em instâncias diferentes e se perde com reinício.
- **Somente `INSERT OR IGNORE`:** evita substituir eventos, mas prende linhas legadas ignoradas e não torna
  válidas decisões calculadas a partir de uma leitura desatualizada.
- **Comparar contagem e maior `rowid`:** compacto para um log estritamente imutável, mas o tratamento das linhas
  legadas e a possível reutilização de `rowid` enfraquecem a identidade da fotografia. Comparar todo o log em JSON
  evitaria esses casos ao custo de SQL menos simples. Revisão e token tornam a prova da escrita vencedora explícita.
- **Rejeitar o lote inteiro por uma transição pendente:** pode impedir indefinidamente um pré-requisito válido
  que chegou depois dela. Salvar o subconjunto válido e responder erro permite progresso sem confirmação falsa.
- **Resposta `200` com eventos ignorados:** o cliente atual apaga a fila. Um contrato de confirmações individuais
  exigiria também mudança coordenada do cliente; esta entrega usa o tratamento de erro já existente.
- **Mudar a regra para várias quests ativas ou ignorar a ordem:** altera conteúdo de produto e não corrige a
  persistência da regra atual.

## Consequências

O formato de sucesso continua `{progress}`. Os dois erros novos são documentados na referência da API. Um erro
pode ocorrer após salvar parte válida, assim como uma conexão pode cair depois de um commit; por isso, o reenvio
precisa ser do mesmo lote e idempotente. Não há promessa de atualização imediata da tela de outra sessão.

A tabela adiciona uma linha por conta que grava progresso e uma pequena escrita de controle por lote. Conta
excluída perde também esse controle. Esta é persistência interna; sessão, `accountId`, origem exata e `no-store`
continuam obrigatórios. Não são adicionados dados de presença ao Durable Object nem novas dependências.

A migration `0007` não depende da `0006` de fotos que estava em revisão ao criar esta branch. O responsável pela
integração confere ambas, sem renumerar migrations já aplicadas. O código novo requer sua migration antes de ser
ativado. Escritores antigos não participam do protocolo de revisão: não operar simultaneamente versões antigas e
novas com gravações habilitadas. A mudança não autoriza deploy, migrations remotas ou ativação das bandeiras.

Dados legados já inconsistentes não são inventados nem automaticamente convertidos em conquistas. Só um reenvio
válido pode recuperar a linha anteriormente ignorada. O servidor continua confiando que a interação declarada
aconteceu; verifica IDs e sequência, não movimentos ou ações no mundo 3D. PEN-025 e OQ-09 permanecem abertos.

## Relacionados

[Plano D12](../implementation/progress-persistence-plan.md) · [API](../reference/api.md) ·
[Armazenamento](../reference/storage.md) · [IMPL-0013](0013-quests-v1-runtime.md) ·
[D1: operações em lote e sessões](https://developers.cloudflare.com/d1/worker-api/d1-database/).
