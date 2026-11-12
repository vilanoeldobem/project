# IMPL-0020: Retirada administrativa da publicação de ONG

**Status:** Proposta — implementação para revisão; ativação pendente (OQ-14)
**Data:** 2026-11-12
**Fontes:** pedido de Nicolas para implementar a retirada por PR, com revisão de Augusto; DEC-028, DEC-037
e PEN-019 do [registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md). Nicolas confirmou expressamente em
2026-11-12 que o terreno deve ser liberado para outra ONG após a retirada.

## Contexto

A aprovação já publica a casa, mas o fluxo administrativo não permite retirar uma ONG publicada. Retirada
significa encerrar sua publicação na Vila, preservando a candidatura e seu histórico. Não equivale a excluir a
organização, rejeitar retrospectivamente a candidatura, apagar comprovantes ou banir a conta do responsável.
PEN-019 mantém as regras operacionais de atualização e retirada pendentes; o pedido atual autoriza construir uma
proposta revisável, sem ativá-la remotamente.

O esquema existente restringe `ngos.status` aos estados da candidatura. Reconstruir essa tabela para acrescentar
um estado afeta as referências de terrenos, fotos e documentos, incluindo relações com exclusão em cascata.
Os registros legados podem não ter solicitante nem `requested_lot_id`; a associação atual de uma casa está em
`lots.ngo_id`, e esse pedido antigo não pode ser usado como autoridade para liberar um terreno.

## Decisão

1. Criar a migration aditiva `0009_ngo_withdrawals.sql`, preservando `ngos` e suas relações. A tabela
   `ngo_withdrawals` registra uma única retirada por ONG, com identificador exclusivo da operação, administrador,
   motivo privado, instante, revisão resultante e terrenos efetivamente associados no momento da retirada.
2. Oferecer `POST /admin/ngos/:id/withdraw` com revisão esperada e motivo obrigatório. Reutilizar sessão,
   origem autorizada e papel administrativo; recusar autoanálise, versão antiga e organização ainda não publicada.
   A nova bandeira `NGO_WITHDRAWAL_ENABLED` permanece desligada em produção e homologação. Ela controla somente
   novas retiradas: desligá-la depois de uma retirada nunca restaura a publicação.
3. Confirmar retirada, incremento de revisão, atualização dos terrenos e auditoria em um único batch D1,
   com condição de revisão, publicação vigente e ausência de retirada anterior. Cada operação usa identidade
   própria; uma concorrente perdedora não libera terrenos nem duplica auditoria. A auditoria contém identificadores
   e revisão, sem copiar o motivo livre. O registro privado conserva o motivo para consulta autorizada.
4. Manter o estado de candidatura armazenado e projetar `status: "withdrawn"` nas respostas privadas quando
   existir retirada. O objeto `withdrawal: {reason, at}` informa o encerramento sem sobrescrever `reviewNote`.
   Listagem e detalhe administrativo e consulta do próprio solicitante usam a mesma regra; o estado e seus dados
   vêm de um snapshot SQL coerente. O rótulo compartilhado é “Retirada da Vila”.
5. As consultas públicas de perfil, logo, fotos e terrenos exigem o terreno publicado, que a retirada libera:
   deixam de mostrar organizações retiradas independentemente da bandeira. Após a confirmação, novas leituras da API deixam de disponibilizar perfil e imagens públicas.
   O cliente atual carrega terrenos ao abrir: uma cena já aberta pode precisar recarregar; este PR não implementa
   atualização em tempo real nem revoga imagens que já foram baixadas.
6. Preservar os registros e bytes existentes. Solicitante e administradores mantêm suas consultas privadas
   autorizadas de fotos e documentos. Novos uploads e aprovação/rejeição de fotos ficam congelados para a ONG
   retirada; a remoção administrativa de foto já existente continua disponível. Documentos continuam privados
   e sem mutação, conforme IMPL-0017/IMPL-0018. Nenhum expurgo ou serviço novo de armazenamento faz parte desta entrega.
7. Não oferecer restauração, nova candidatura pela mesma organização ou reentrada automática. O histórico de
   aprovação não é permissão para republicar. A revisão incrementada invalida operações baseadas na versão antiga.
   A política de reentrada e eventual revisão documental continua em OQ-14.

### Destino do terreno

**CONFIRMADO por Nicolas em 2026-11-12:** liberar o terreno para outra ONG após retirar a publicação.
No mesmo batch, os terrenos efetivamente associados à ONG passam a `available` com `ngo_id = NULL`, permitindo
nova candidatura pelo fluxo existente. O registro de retirada conserva os IDs anteriores; `requested_lot_id`
continua como referência histórica e não determina quais terrenos liberar. Terrenos vinculados a outra ONG não
são alterados. Nenhuma nova ONG é atribuída ou aprovada automaticamente.

### Missões e progresso

A retirada não modifica `progress_events`, XP ou missões concluídas. A missão `newest-house-visit` depende de
alguma casa publicada; se a última sair após o aceite, o jogador pode ficar com uma missão ativa sem objetivo
disponível. OQ-09 já registra esse caso. Não são criadas regras de abandono, conclusão automática ou compensação
de XP neste incremento. A ativação conjunta exige resolver essa política; as bandeiras de quests continuam desligadas.

## Alternativas consideradas

- **Adicionar `withdrawn` diretamente ao CHECK de `ngos.status`:** tornaria o estado persistido mais direto,
  porém exigiria reconstruir uma tabela referenciada por fotos/documentos com cascata. O registro aditivo evita
  essa migração e preserva o significado da decisão original, ao custo de exigir projeção uniforme em toda leitura.
- **Reutilizar `rejected`:** permitiria reaproveitar transições, mas confundiria retirada posterior com uma
  candidatura não aprovada e abriria reenvio sem política de reentrada. Rejeitada e retirada têm sentidos distintos.
- **Apagar ONG e mídias:** removeria o histórico e poderia eliminar comprovações. Retirada de publicação não
  autoriza exclusão de dados; retenção permanece vinculada às regras operacionais de fotos e documentos.
- **Apenas desligar o terreno:** esconderia parte da casa, mas o indicador e outros consumidores ainda poderiam
  considerar a ONG publicada. Um registro permanente consultado por todas as projeções evita esse descompasso.

## Consequências

O fluxo de aprovação existente permanece separado da nova rota de retirada. A ampliação de estado no contrato
compartilhado permite mostrar a situação corretamente nas interfaces existentes; o botão e a jornada de retirada
no painel ficam para a integração de Augusto. Novos consumidores devem usar a projeção efetiva, nunca apenas
`ngos.status = 'published'`. A aplicação da migration precede a implantação do código que a consulta.

O PR depende das entregas de perfil, fotos e documentos para comprovar a retirada em todos os caminhos públicos.
Validação usa dados sintéticos e D1/R2 locais. Nenhum merge, deploy, migration remota, mudança de segredo ou
ativação é autorizado por este ADR.

## Relacionados

[API](../reference/api.md) · [Armazenamento](../reference/storage.md) · [OQ-09 e OQ-14](open-questions.md) ·
[Arquivos](0017-ngo-files-r2.md) · [Conciliação e galeria](0018-ngo-files-reconciliation.md).
