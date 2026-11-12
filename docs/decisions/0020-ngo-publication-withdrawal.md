# IMPL-0020: Retirada administrativa da publicação de ONG

**Status:** Proposta — implementada, desligada em produção e homologação (`NGO_WITHDRAWAL_ENABLED`); a política da
retirada é PENDENTE ([OQ-14](open-questions.md))
**Data:** 2026-11-12
**Fontes:** pedido da equipe de desenvolvimento para implementar a retirada por PR (PR #33), com revisão do
responsável técnico; DEC-028, DEC-037 e PEN-019 do
[registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md);
revisão do PR #33 (2026-11-12).

## Contexto

A aprovação publica a casa da ONG, mas o fluxo administrativo não permitia tirar da Vila uma ONG publicada.
PEN-019 mantém pendentes as regras operacionais de atualização e retirada: este ADR registra uma **proposta
técnica revisável**, sem ativá-la. **Nada aqui decide a política**: o que a retirada significa para a conta do
responsável, para o CNPJ, para um eventual retorno e para a guarda dos dados é pergunta ao dono do produto (OQ-14).

O esquema restringe `ngos.status` aos estados da candidatura. Reconstruir a tabela para acrescentar um estado
afeta as referências de terrenos, arquivos e fotos. Registros antigos podem não ter solicitante nem
`requested_lot_id`; a associação atual de uma casa está em `lots.ngo_id`, e é ela, não o terreno pedido na
candidatura, que diz o que liberar.

A API pode ser publicada com todas as bandeiras desligadas sobre um banco atrás do código (produção está no
schema v3). As rotas públicas sempre ligadas não podem depender de tabela nova.

## Decisão

1. **Registro aditivo.** A migration `0009_ngo_withdrawals.sql` cria `ngo_withdrawals`: uma retirada por ONG, com
   identificador exclusivo da operação, id do administrador, mensagem enviada à organização, instante, revisão
   resultante e terrenos efetivamente associados naquele momento. `ngos` e suas relações não são reconstruídas.
2. **Rota e bandeira.** `POST /admin/ngos/:id/withdraw {accountId, revision, reason}`, só com
   `NGO_WITHDRAWAL_ENABLED = "true"` (`"false"` em produção e homologação; `/config` informa `withdrawal`).
   Reutiliza sessão, origem autorizada e papel administrativo; recusa autoanálise, revisão antiga, ONG que não
   está publicada e ONG cujo responsável tem exclusão de conta pendente. A bandeira controla só **novas**
   retiradas: desligá-la nunca republica uma organização retirada.
3. **Uma transação, um vencedor.** Registro, incremento de revisão, liberação dos terrenos e auditoria vão no
   mesmo batch D1, condicionados à revisão lida, ao estado publicado, à ausência de retirada anterior e ao token
   exclusivo da operação. Uma concorrente que perde não libera terreno nem grava auditoria. A auditoria
   (`ngo.withdraw`) guarda ids e revisão, **nunca o texto**.
4. **O texto é uma mensagem para a organização.** O `reason` que o administrador escreve é entregue como foi
   escrito ao responsável (`withdrawal.reason` em `GET /ngo/application`). A validação da API, a documentação e
   o painel dizem isso; não existe anotação interna separada.
5. **Estado efetivo nas leituras privadas.** A linha em `ngos` conserva `status = 'published'`; as respostas ao
   responsável e aos administradores mostram `status: "withdrawn"` e `withdrawal: {reason, at}` quando existe
   registro, sem sobrescrever `reviewNote`. Lista, detalhe e candidatura própria usam a mesma regra, no mesmo
   snapshot SQL.
6. **Leituras públicas pelo terreno, nunca pelo registro.** Toda projeção pública de uma ONG (`/lots`,
   `/indicators`, `/ngos/:id`, logo, lista e bytes de fotos) exige a associação a um terreno publicado. A
   retirada libera o terreno, então a ONG some de todas elas na próxima leitura, e **nenhuma rota pública lê
   `ngo_withdrawals`**: elas respondem igual nos schemas v3 a v9. O indicador `approved_ngos` passou a contar
   ONGs publicadas **em terreno publicado** por esse motivo.
7. **Rotas privadas e schema.** As rotas de candidatura e de análise leem o registro. Num banco sem a 0009
   respondem `503 schema_outdated` (nunca `500`); com as contas ligadas, a migration vem antes da API
   ([deploy](../guides/deploy.md#3-aplicar-migrations-remotas)).
8. **Arquivos e fotos depois da retirada.** Nada é apagado pela retirada. O logo e as fotos deixam de ser
   públicos (item 6). Envio de logo, documento e foto, reenvio da candidatura e aprovação/rejeição de foto são
   recusados (`409 application_withdrawn`). **O responsável ainda pode remover os próprios arquivos e fotos**, e
   um administrador ainda pode remover uma foto. Na exclusão da conta do responsável, documentos e galeria são
   apagados como sempre, e o logo de uma ONG retirada também (o logo só permanece enquanto a ONG ocupa um
   terreno publicado).

### O que o código faz hoje (efeitos a ratificar ou mudar na OQ-14)

Estes efeitos decorrem da implementação, **não de uma decisão de produto**:

- **A conta do responsável não consegue se candidatar de novo.** A linha retirada continua `published` e ocupa a
  vaga do índice único da migration 0005 ("uma candidatura ativa por pessoa"); além disso a API responde
  `409 application_withdrawn` a qualquer novo envio dessa conta, mesmo para outra organização e outro CNPJ.
- **O CNPJ continua em uso.** Qualquer outra conta que informe o mesmo CNPJ recebe `409 cnpj_in_use`.
- **Não há rota para desfazer.** Nenhuma decisão administrativa se aplica a uma ONG retirada e não existe
  restauração: uma retirada feita por engano só é corrigida por intervenção manual no banco.
- **O bloqueio da conta é contornável.** Excluir a conta (`DELETE /me`) e criar outra permite candidatar-se de
  novo com outro CNPJ. O bloqueio, portanto, não equivale a uma sanção.
- **Permitir retorno depois exige mudança de schema ou de código**, porque o estado guardado segura a vaga do
  índice da 0005.
- **Retenção por omissão.** Candidatura, registro da retirada (com a mensagem), arquivos e fotos ficam guardados
  sem prazo; o registro e a mensagem ficam mesmo depois da exclusão da conta do responsável.

### Destino do terreno

Os terrenos efetivamente associados à ONG passam a `available` com `ngo_id = NULL` no mesmo batch, e outra
organização pode pedi-los pelo fluxo existente. O registro guarda os ids liberados; `requested_lot_id` continua
como referência histórica. Terrenos de outra ONG não são alterados e nenhuma ONG é atribuída automaticamente.
**Registro pendente:** a equipe informou em 2026-11-12 que o terreno deve ser liberado para outra ONG, mas não
há DEC no repositório de documentação. Até a DEC existir, a liberação do terreno é PROPOSTA (OQ-14).

### Missões e progresso

A retirada não altera `progress_events`, XP ou missões concluídas. A missão `newest-house-visit` depende de
existir uma casa publicada; se a última sair depois do aceite, o jogador pode ficar com uma missão ativa sem
objetivo. OQ-09 já registra o caso; nenhuma regra de abandono, conclusão automática ou compensação é criada aqui.

## Alternativas consideradas

- **Coluna `ngos.withdrawn_at` em vez do registro separado** (sugerida na revisão): o índice da 0005 e as
  leituras por estado poderiam usar `AND withdrawn_at IS NULL`, e o retorno ficaria mais simples. Não adotada
  nesta entrega porque muda o índice da 0005 e, com ele, a política de retorno, que é a pergunta aberta. Fica
  como caminho provável quando a OQ-14 for respondida.
- **Acrescentar `withdrawn` ao CHECK de `ngos.status`:** estado guardado mais direto, mas exige reconstruir uma
  tabela referenciada por terrenos, arquivos e fotos.
- **Reutilizar `rejected`:** confundiria uma retirada posterior com uma candidatura não aprovada e abriria o
  reenvio sem política de retorno.
- **Consultar o registro em toda leitura pública** (primeira versão do PR #33): as rotas públicas passariam a
  depender da migration 0009 e responderiam `500` em produção (schema v3) com todas as bandeiras desligadas.
  Rejeitada: a liberação do terreno já remove a ONG de todas as projeções públicas.
- **Apagar ONG e mídias:** removeria histórico e comprovações; retirar da Vila não autoriza descarte.

## Consequências

- Novo código que mostre uma ONG ao público deve exigir a associação a um terreno publicado; nas telas privadas,
  usar o estado efetivo, nunca só `ngos.status = 'published'`.
- Se alguém voltar a associar manualmente um terreno publicado a uma ONG retirada, ela reaparece nas rotas
  públicas: o registro não é consultado nelas. Não há caminho na API que faça isso.
- Depois de existir alguma retirada, reverter a API para uma versão anterior não é seguro: ela mostraria a
  organização como publicada nas telas privadas e voltaria a contá-la em `approved_ngos`.
- O painel oferece a ação só com a bandeira ligada; o jogo mostra ao responsável a situação "Retirada da Vila" e
  a mensagem da administração. O jogo carrega os terrenos ao abrir: uma cena já aberta só deixa de mostrar a
  casa ao recarregar, e conteúdo já baixado não é revogado.
- Validação com dados sintéticos em D1/R2 locais. Nenhum deploy, migration remota, mudança de segredo ou
  ativação é autorizado por este ADR.

## Relacionados

[API](../reference/api.md#retirada-administrativa-de-ong-publicada-impl-0020-proposta) ·
[Armazenamento](../reference/storage.md#ngo_withdrawals-v9-proposta) · [OQ-09 e OQ-14](open-questions.md) ·
[Arquivos](0017-ngo-files-r2.md) · [Conciliação e galeria](0018-ngo-files-reconciliation.md) ·
[Registro de entrega](../implementation/ngo-withdrawal-report.md).
