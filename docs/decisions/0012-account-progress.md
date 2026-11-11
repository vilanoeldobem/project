# IMPL-0012 - Progresso de conta com eventos idempotentes

**Estado:** proposta técnica implementada para revisão local.
**Data:** 2026-11-11. **Fontes:** DEC-038/039/040/042, OQ-02, IMPL-0011.

## Contexto

Missões e XP do visitante já existem no navegador. A conta precisa recuperar progresso em outro navegador,
sem duplicar recompensas e sem misturar dados de contas que compartilham o mesmo aparelho.

## Decisão de execução

- Reutilizar `applyEvent` e o catálogo de missões em `packages/shared`; o servidor calcula contadores, conclusão e XP.
- Migration aditiva `0005_player_progress.sql`: uma linha por usuário, JSON canônico, revisão para concorrência,
  marca de importação de visitante e horários de criação/atualização.
- Identidade vem exclusivamente da sessão válida. `X-Account-ID` é uma precondição: precisa coincidir com a sessão,
  mas nunca escolhe o proprietário. Impede que uma aba antiga escreva na conta aberta por outra aba.
- `GET /progress`, `POST /progress/events` e `POST /progress/import` usam o mesmo isolamento de origem/CORS,
  cookies e bloqueio de produção das contas. JSON limitado a 4 KiB, sem cache ou logs de dados pessoais.
- Evento aceita somente missão conhecida e identificador limitado; presentes exigem os IDs reais do mundo compartilhado.
  A deduplicação ocorre no estado da conta. Conclusão recompensa uma vez; missões têm limite de progresso.
- Importação aceita contadores limitados e IDs conhecidos de presentes, nunca XP, nível, estado livre ou usuário.
  Missões simples usam o maior contador; presentes unem identidades conhecidas, até o alvo. Isso preserva o presente
  já coletado na cena e impede que coletá-lo novamente complete artificialmente a missão.
- Importação marca a conta uma vez. Compare-and-swap por revisão, com até cinco tentativas, serializa importações
  e eventos concorrentes sem sobrescrever progresso. Esgotamento retorna 409 para nova tentativa.
- O cliente mantém fila serial e cache separados por conta; só o progresso de visitante usa `vila.progress.v2`.
  Logout restaura o visitante. Respostas antigas são descartadas após troca de conta. Falhas preservam a fila,
  mostram pendência e permitem tentar novamente ou retomar quando a rede volta.
- Aparência equipada continua local. Desbloqueios são recalculados a partir do progresso exibido e saneados
  quando chega o estado canônico. A fila pode antecipar uma conclusão; a interface informa quando não está salva.

## Limites e consequências

Isto valida e limita recompensas recebidas, mas não prova que o jogador realmente executou cada ação: os eventos
partem do cliente. Não é uma garantia de anti-cheat. XP não é comprado nem recebido por doação.
O teto atual decorre do catálogo finito compartilhado, não de um valor paralelo hardcoded.

A importação de visitante é uma compatibilidade limitada, não um mecanismo recorrente para enviar estado arbitrário.
O cache da conta contém progresso e IDs, sem cookies/tokens. Não há sincronização de cosméticos equipados ou multiplayer.

Autenticação pública continua desabilitada enquanto OQ-08 e a ativação operacional estiverem pendentes. Aplicar a
migration em homologação não habilita o adaptador local na internet. Toda aplicação remota/deploy exige a autorização
correspondente; este ADR não comprova que ocorreu.

## Provas

SQL real com chaves estrangeiras: isolamento, sessão expirada/revogada, concorrência, replay, importação uma vez,
colisão importação/evento, limites e identidade de presente. Cliente: fila offline, retomada, troca de conta,
resposta atrasada e alteração de cookie em outra aba. A verificação de navegador valida a jornada integrada.
Resultados executados são registrados pelo coordenador em `tasks/todo.md` e no PR.
