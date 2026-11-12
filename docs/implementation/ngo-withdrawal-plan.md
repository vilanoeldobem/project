# Retirada administrativa de ONGs — back-end

> **Status:** Publicado no [PR #33](https://github.com/vilanoeldobem/project/pull/33), sobre o PR #31, para revisão de Augusto; proposta desligada em produção/homologação.
> **Data:** 2026-11-12 · **Decisão técnica:** [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md)

## Dependência de integração descoberta durante a publicação

Esta implementação parte do PR #31 e da sequência #28 → #29 → #31. O [PR #32 do Augusto](https://github.com/vilanoeldobem/project/pull/32) propõe outro pipeline de arquivos, sobreposto aos PRs #29/#31, com colisão de migration 0006 e ADR IMPL-0017. A reconciliação dessas frentes é pré-requisito ao merge desta entrega.

A compatibilidade com #32 não foi implementada nem validada. Os guards de retirada precisam ser portados e testados contra o pipeline escolhido, inclusive logo/arquivos públicos, permissões privadas e efeitos da política de retenção/exclusão da conta. Este PR continua revisável sobre sua base atual, sem escolher nem mesclar as implementações concorrentes.

## Entrega

Um administrador autorizado retira a publicação de uma ONG com motivo e revisão esperada. Depois da confirmação,
a API deixa de entregar seu perfil e fotos publicamente, atualiza os terrenos associados e conserva a candidatura,
os arquivos privados e o histórico administrativo. O responsável consulta a situação como “Retirada da Vila”.
Nicolas confirmou em 2026-11-12 a liberação do terreno para outra ONG: os vínculos reais voltam a `available`,
sem atribuição ou aprovação automática de uma nova organização.

O escopo inclui API, banco, contrato compartilhado e testes. Augusto mantém o painel, o jogo e a atualização visual
de cenas já abertas. Sem merge, deploy ou recursos remotos. Regras operacionais ainda propostas ficam em
[OQ-14](../decisions/open-questions.md); missões dependentes de uma casa publicada seguem OQ-09.

## Tarefas e critérios de conclusão

| Tarefa | Responsabilidade | Critério verificável |
|---|---|---|
| Contrato | AIOX Architect | Retirada difere de rejeição/exclusão; destino do terreno, política de reentrada e limite de atualização visual estão explícitos |
| Persistência | AIOX Dev / banco | Migration 0009 aditiva preserva dados, FKs, índices e arquivos existentes; registra terrenos reais e identidade da operação |
| Retirada | AIOX Dev | Sessão/admin/origem e revisão conferidas; motivo obrigatório; concorrência confirma uma única retirada, revisão e auditoria |
| Visibilidade pública | AIOX Dev | Perfil, galeria, bytes/HEAD, terrenos e indicador deixam de expor ONG retirada; desligar a bandeira não a republica |
| Histórico privado | AIOX Dev | Responsável/admin consultam estado efetivo e motivo; arquivos continuam privados; operações proibidas não restauram publicação |
| Qualidade | AIOX QA / coordenação | Acesso indevido, revisões antigas, corridas e rollback cobertos; evidência com banco/armazenamento locais registrada |
| Publicação | AIOX DevOps | Branch própria e PR para Augusto, com dependências, testes e pendências declarados; sem merge ou deploy |

## Cenários de aceite

1. Admin que não é o solicitante retira ONG publicada na revisão atual com motivo: revision aumenta uma vez,
   motivo privado e auditoria persistem, e os terrenos associados ficam disponíveis e sem vínculo à ONG retirada.
2. Sessão ausente, papel inadequado, origem inválida, autoanálise, motivo inválido, revisão antiga, ONG inexistente
   e candidatura ainda não publicada são recusados sem efeitos parciais.
3. Duas retiradas concorrentes têm somente uma vencedora; repetição posterior não escreve nova auditoria ou
   incrementa revisão novamente. Falha de banco reverte a operação inteira.
4. ONG legada sem `applicant_id` ou `requested_lot_id` continua administrável. Associação atual em `lots.ngo_id`
   prevalece sobre pedido histórico; terreno de outra ONG nunca é alterado. Todos os vínculos reais são tratados.
5. Perfil/galeria/foto pública/HEAD deixam de responder com conteúdo; `/lots` não revela identidade ou resumo
   da ONG retirada e `/indicators` deixa de contá-la. A regra continua válida com bandeira de retirada desligada.
6. Consulta privada mostra `withdrawn` e `withdrawal: {reason, at}` sem apagar a mensagem original de análise;
   listagem e detalhe usam o mesmo contrato. Motivo livre não aparece em respostas públicas nem no log de auditoria.
7. Novas fotos e aprovação/rejeição de fotos da ONG retirada são recusadas, inclusive sob concorrência. Remoção
   administrativa existente e leitura privada autorizada continuam disponíveis. Documentos nunca se tornam públicos.
8. Retirada não altera eventos, XP ou conclusões de missão; não permite reenvio/restauração da ONG pelo fluxo antigo.
9. Migration aplicada sobre dados populados conserva fotos, documentos, terrenos, usuários e auditoria; índices e
   chaves estrangeiras permanecem válidos. A frente de progresso, migration 0007, permanece independente.

## Passagem para integração e operação

A referência da [API](../reference/api.md) define payload, resposta e erros. O painel deve recolher o motivo,
confirmar a intenção do administrador e enviar a revisão lida. Em conflito, recarrega o detalhe antes de nova
decisão. O contrato não acrescenta uma ação à revisão inicial de candidaturas.

Leituras públicas posteriores à confirmação passam a refletir a retirada; o jogo atual carrega a lista de terrenos
na abertura. Atualização automática de uma cena aberta exige trabalho do cliente e não é declarada pronta aqui.

Antes da ativação: aceitar as regras operacionais de retirada/reentrada,
resolver OQ-09 quando quests forem habilitadas e preparar integração/migration em ambiente autorizado. Fotos e
comprovantes conservam seus próprios gates OQ-12/OQ-13. Evidência local e CI serão registrados no PR, sem confundir
implementação revisável com operação já liberada ao público.
