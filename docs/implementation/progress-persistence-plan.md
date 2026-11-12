# Persistência de progresso — D12

**Status:** implementação para revisão em PR; sem ativação remota
**Data:** 12/11/2026
**Base:** `main` em `e2fa200`; branch `fix/progress-persistence`
**Fontes:** D12 do plano de acompanhamento; DEC-038/040/042, PEN-025;
[IMPL-0018](../decisions/0018-progress-concurrency-and-acknowledgment.md).

## Entrega

Preservar o progresso salvo da conta quando o jogador retorna, reenvia eventos ou usa mais de uma sessão.
A base de missões, XP e níveis já existe: esta entrega corrige a persistência e a confirmação de recebimento,
sem mudar catálogo, recompensas, condições de conclusão, cenário ou HUD.

| Ordem | Tarefa | Responsável | Aceite |
|---|---|---|---|
| 1 | Definir protocolo de concorrência e reenvio | AIOX Architect | Revisão por conta, identidade única da escrita e limites de compatibilidade explícitos. |
| 2 | Proteger log de eventos no D1 | AIOX Dev | Duas requisições que leram o mesmo estado não gravam decisões incompatíveis; perdedora relê e recalcula. |
| 3 | Corrigir confirmação de eventos pendentes | AIOX Dev | Evento de quest ainda inválido não recebe confirmação de sucesso que apague a fila do cliente. Parte válida pode ser salva e reenviada sem duplicar XP. |
| 4 | Preservar dados e contrato existentes | AIOX Dev | Eventos aceitos não mudam de posição por repetição; linha legada que era ignorada pode ser recuperada quando válida; missões rápidas mantêm seus eventos conhecidos. |
| 5 | Verificar segurança, concorrência e retorno | AIOX QA / Coordenação | Testes SQL determinísticos, suíte obrigatória e jornada local com sessões sintéticas distintas. |
| 6 | Publicar para revisão | AIOX DevOps | PR independente dos PRs de ONG, revisão solicitada ao Augusto, sem merge ou alteração remota. |

## Casos obrigatórios

- Salvar, reler e recuperar com outra sessão da mesma conta; conta diferente não lê nem altera o progresso alheio.
- Reenviar eventos e conclusões, inclusive concorrentemente: XP único, objetivos preservados e histórico estável.
- Duas aceitações diferentes disputando uma conta: no máximo uma quest ativa, conforme o redutor existente.
- Objetivo antes de aceite, lote com eventos fora de ordem e mistura de missões rápidas com quests pendentes:
  nada transitório pode ser descartado por uma resposta `200`; reenvio do lote inteiro é seguro.
- Corrida entre leitura e gravação, com tentativas limitadas; falha no meio do lote reverte a escrita inteira.
- Contagem do limite por eventos únicos: duplicatas e reposicionamento de linha legada não consomem vagas novas.
- Relógio anterior ao último registro não inverte eventos; ordenação histórica continua preservada.
- Bandeiras desligadas, ausência de sessão, `accountId` divergente e origem não permitida mantêm as proteções.

## Limites e passagem para integração

A migration `0007_progress_write_guard.sql` depende somente do esquema de contas existente. O número `0006`
foi reservado pela entrega de fotos em revisão; esta branch não incorpora nem exige esse recurso. Nenhuma
migration aplicada é reescrita. Na integração, o responsável confere a lista real de migrations pendentes.

O cliente existente conserva a fila ao receber erro e tenta novamente ao reconectar, registrar novo evento ou
entrar na conta. Esta entrega não adiciona sincronização visual em tempo real entre abas/dispositivos. Um evento
incompatível com a quest ativa pode continuar pendente até que a regra existente permita sua aplicação. O contrato
exato de respostas e falhas fica na [referência da API](../reference/api.md).

Contas e quests permanecem com suas bandeiras atuais. Aprovação do catálogo, abandono de missão (OQ-09) e revisão
de privacidade continuam pendências próprias. O servidor valida identificadores e transições; não prova ações na
cena 3D. O PR não liga produção, aplica migration remota, cria recurso nem muda o trabalho visual do Augusto.

Os resultados de execução devem ser registrados em `tasks/todo.md` e no PR. Este plano não substitui evidência
dos testes da árvore final.
