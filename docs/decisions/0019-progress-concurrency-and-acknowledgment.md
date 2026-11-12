# IMPL-0019: Concorrência e confirmação da persistência de progresso

**Status:** Proposta — implementada, bandeiras de produção inalteradas
**Data:** 2026-11-12
**Fontes:** D12; DEC-038/040/042, PEN-025; [IMPL-0013](0013-quests-v1-runtime.md);
[revisão técnica do PR #30](https://github.com/vilanoeldobem/project/pull/30#pullrequestreview-5877411763);
`apps/api/src/progress.ts` e `apps/client/src/lib/account.ts`.

## Contexto

O progresso é reconstruído pelo redutor compartilhado a partir dos eventos da conta. As quests dependem da ordem
`accept` → objetivos → `turn-in`. Requisições simultâneas podiam validar contra o mesmo log e depois executar
`INSERT OR REPLACE`, movendo uma repetição de aceite para depois de objetivos já salvos. O replay então perdia
progresso reconhecido anteriormente.

Na primeira revisão desta implementação, `409 progress_pending` conservava eventos de quest incompatíveis para
reenvio. Isso impedia o cliente de adotar o estado da conta: um visitante com `lake-lanterns` aceita entrava numa
conta com `harness-bells` ativa e 40 XP, mas continuava vendo progresso de visitante e aviso de conexão. Repetir
o pedido não resolvia essa divergência. A revisão solicitou preservar a correção de concorrência e o comportamento
anterior para eventos inaplicáveis, sem decidir abandono ou substituição de quests.

## Decisão

1. **Revisão e token por conta.** `progress_writes`, na migration `0008_progress_write_guard.sql`, contém revisão
   e token da escrita. A FK acompanha a exclusão da conta. Não duplica XP nem armazena novos dados pessoais.
2. **Snapshot coerente.** Revisão e log são obtidos na mesma consulta, com ordem histórica `created_at,rowid`.
3. **Validação e confirmação atômica.** O redutor calcula eventos válidos. Um `batch` altera a revisão somente
   se ela ainda coincide com a leitura; todas as gravações exigem o token exclusivo dessa tentativa. Uma tentativa
   perdedora não grava eventos e uma falha SQL reverte a revisão e o lote inteiro.
4. **Recalcular após disputa.** Até três tentativas, com espera aleatória de 20–39 ms e 40–59 ms antes das próximas
   leituras. Contenção persistente responde `409 progress_conflict`. Não há mutex em memória entre Workers.
5. **Preservar eventos aceitos.** Duplicatas não reposicionam o log. Uma linha legada que era ignorada no replay
   só pode ser reposicionada quando seu reenvio constitui uma transição agora válida. Missões rápidas conservam
   seus eventos conhecidos; o limite de 500 considera chaves novas distintas, não repetições no pedido.
6. **Preservar a ordem de acréscimo.** Novos timestamps não precedem o maior `created_at` da conta; empates usam
   `rowid`. Não reordenar o histórico antigo nem modificar o redutor para esconder inconsistências.
7. **Devolver o estado autoritativo.** Eventos de quest inaplicáveis são omitidos e os válidos são gravados.
   `200 {progress}` permite ao cliente adotar o estado da conta e limpar os eventos enviados, como no contrato
   anterior de IMPL-0013. `progress_pending` é removido. Não existe fila automática para aceitar outra quest
   futuramente; abandono, substituição e reconciliação detalhada de divergências continuam em OQ-09.
8. **Preservar desligamento explícito.** Com quests desligadas, seus eventos são omitidos sem impedir missões
   rápidas. IDs desconhecidos continuam invalidando o pedido inteiro.

## Alternativas consideradas

- **Mutex no Worker:** não coordena instâncias e se perde com reinício.
- **Só `INSERT OR IGNORE`:** não serializa decisões de transição nem recupera linhas legadas ignoradas.
- **Erro permanente para eventos incompatíveis:** impede adotar o progresso da conta, mesmo com conexão normal.
- **Resposta com confirmações individuais e nova reconciliação no cliente:** possível evolução, mas exige um
  contrato de produto para lidar com divergências. O ajuste atual conserva o comportamento anterior.
- **Permitir várias quests ativas:** muda a regra do jogo e não corrige a persistência da regra existente.

## Consequências

O sucesso continua `{progress}`. Erros de rede, falha de banco e contenção persistente conservam a fila do cliente;
um reenvio é idempotente mesmo se uma conexão cair após o commit. Evento inaplicável não recebe promessa de
reaplicação futura. Não há atualização visual em tempo real entre dispositivos.

A numeração segue a ordem de integração #32 → #35 → #30: arquivos em 0006, galeria em 0007, progresso em 0008.
O número anterior desta proposta não foi aplicado remotamente. Migrations aplicadas continuam imutáveis; antes
de publicar, confirmar o histórico e aplicar o esquema autorizado. Escritores antigos não participam do protocolo:
não operar versões antigas e novas simultaneamente com gravações habilitadas.

Sessão, `accountId`, origem exata e `no-store` permanecem obrigatórios. Nenhuma dependência nova ou presença
persistida é adicionada. Dados legados inconsistentes não são convertidos em conquistas por inferência: somente
um reenvio válido pode recuperar uma linha ignorada. O servidor verifica identificadores e sequência, não prova
ações no mundo 3D. PEN-025 e OQ-09 continuam abertos. A entrega não autoriza deploy ou ativação remota.

## Relacionados

[Registro D12](../implementation/progress-persistence-report.md) · [API](../reference/api.md) ·
[Armazenamento](../reference/storage.md) · [Perguntas abertas](open-questions.md).
