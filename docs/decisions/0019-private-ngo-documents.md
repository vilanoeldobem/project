# IMPL-0019: Documentos privados da candidatura de ONG

**Status:** Proposta — implementação para revisão; ativação pendente (OQ-13)
**Data:** 2026-11-12
**Fontes:** pedido de Nicolas para implementar D07 por PR, para revisão de Augusto; DEC-015, DEC-016,
DEC-037 e PEN-019 do [registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md);
[plano de implementação](../implementation/ngo-private-documents-plan.md).

## Contexto

D07 prevê candidatura com dados, documentos e estado, sem abrir a casa antes da análise. A base já grava os dados
textuais e oferece decisões administrativas. A lista de comprovantes, critérios adicionais, acesso e retenção dos
arquivos ainda dependem de definição de produto. Os anexos devem apoiar a análise sem se tornarem conteúdo da casa.

Fotos institucionais têm fluxo editorial próprio (IMPL-0017). Misturar comprovantes com fotos criaria o risco de
publicar arquivos privados ao aprovar a ONG. Além disso, a decisão administrativa precisa corresponder ao conjunto
de dados e documentos que o administrador realmente consultou.

## Decisão

A implementação abaixo é uma **proposta técnica**, mantida desligada até o aceite de OQ-13.

1. Usar D1 para metadados e autorização e um bucket R2 privado **separado**, binding `NGO_DOCUMENTS`, para os bytes.
   `NGO_DOCUMENTS_ENABLED` permanece `"false"` em produção e homologação. Aprovar a ONG jamais publica documentos.
   Nenhuma rota pública, domínio público do bucket ou URL assinada dispensa a autenticação na API.
2. O solicitante autenticado consulta seus próprios anexos; administradores consultam por rotas administrativas.
   Upload e retirada exigem solicitante com e-mail verificado, `accountId` correspondente à sessão, origem exata
   autorizada e revisão esperada da candidatura. Metadados e bytes são autorizados antes da leitura no R2.
3. Propor PDF, PNG e JPEG de até 2 MiB, corpo JSON de até 3 MiB e dez anexos ativos por ONG. O rótulo é livre,
   limitado e privado; não representa categoria obrigatória. Nome original não é armazenado. A API valida base64,
   tamanho e estrutura mínima do tipo declarado. Essa validação **não** sanitiza conteúdo, remove metadados, faz
   antivírus ou comprova autenticidade de um documento; PDF pode conter conteúdo ativo.
4. Permitir upload e retirada somente em `submitted`, `changes_requested` ou `rejected`. Congelar essas mutações
   em `under_review` e `published`; o administrador usa o fluxo existente de pedido de ajustes antes de nova edição.
   Não introduzir remoção administrativa nem retirada de comprovante de ONG publicada sem política aprovada.
5. Cada upload ou retirada incrementa `ngos.revision` e grava um identificador único da operação em
   `ngos.document_write_token`. A condição SQL verifica solicitante, revisão esperada e **estado exato lido**;
   upload também verifica o limite de anexos. A atualização da ONG, o registro ou retirada do anexo e a auditoria
   pertencem ao mesmo lote D1, condicionado ao identificador da operação. Corrida perdida não altera metadados
   nem gera auditoria de sucesso. O estado exato importa porque decisões administrativas podem mudar o estado
   sem incrementar a revisão.
6. `added_revision` e `removed_revision` registram proveniência. O conjunto ativo contém registros sem retirada,
   incluindo uploads de revisões anteriores; o reenvio da candidatura preserva esses anexos. Bytes e rótulo são
   imutáveis: substituir significa retirar e enviar outro arquivo. A revisão da ONG passa a representar também
   mudanças do conjunto documental, mantendo a proteção existente contra aprovação de revisão antiga.
7. A listagem devolve `applicationRevision` e documentos no mesmo snapshot SQL. O futuro consumidor administrativo
   deve comparar essa revisão com a revisão do detalhe textual antes de decidir; se divergirem, recarrega ambos.
   As duas consultas HTTP isoladas não garantem uma visão conjunta. A decisão continua exigindo a revisão esperada.
8. Downloads usam sessão e origem autorizadas, `Content-Disposition: attachment` com nome gerado pelo servidor,
   `Cache-Control: no-store`, `nosniff` e CSP restritiva. Até imagens são anexos, sem prévia pública. Logs e auditoria
   registram somente identificadores técnicos, ação e revisão; não incluem rótulos, nomes originais ou conteúdo.

## Consistência entre D1 e R2

Upload grava uma chave imutável e única no R2 antes de tentar o lote D1. Se a confirmação falhar, tenta excluir
somente essa chave. Uma interrupção ou falha de limpeza pode deixar objeto órfão privado. Nenhum objeto é acessível
pela API sem registro ativo e autorização correspondente.

A retirada torna o registro inacessível no D1 e registra a auditoria antes de tentar apagar o objeto. Sucesso da
retirada lógica não comprova exclusão física se o R2 falhar. Não se presume prazo de retenção, fila ou rotina
automática de expurgo. Reconciliação de órfãos, recuperação e exclusão física fazem parte do aceite operacional.
A exclusão de conta continua removendo o vínculo de solicitante conforme o modelo existente; acesso e retenção
administrativos dos documentos remanescentes precisam de política antes de receber arquivos reais.

## Alternativas consideradas

- **Reaproveitar o bucket das fotos:** pouparia configuração, mas misturaria comprovantes com material destinado
  à publicação. Um bucket separado limita essa confusão e permite política própria ao custo de mais um recurso.
- **Guardar base64 no D1:** teria transação única para bytes e metadados, mas aumentaria o banco e seus backups.
  R2 preserva o banco relacional pequeno, com a compensação e a recuperação explicitadas acima.
- **Upload direto ou multipart:** reduz o custo do base64, porém amplia o contrato de autorização e finalização.
  JSON limitado reaproveita o fluxo existente para os arquivos pequenos propostos.
- **Editar documentos durante a análise:** exigiria snapshots históricos completos ou uma segunda revisão que
  todas as decisões consultassem. Congelar a edição e incrementar a revisão existente reduz a superfície de corrida,
  ao custo de o administrador precisar solicitar ajustes para permitir novas alterações.
- **Exigir tipos de comprovante ou antivírus nesta entrega:** não há lista de produto nem serviço contratado.
  A implementação conserva o rótulo genérico e explicita a proteção limitada. OQ-13 bloqueia ativação até que o
  procedimento de recebimento e análise de arquivos seja aceito.

## Consequências

A API ganha uma capacidade de back-end sem alterar jogo, painel ou critérios de elegibilidade. Os três critérios
existentes de DEC-015 continuam sendo verificados pelo fluxo atual; anexar um arquivo não marca nenhum critério
como cumprido. DEC-016 continua suspensa: esta entrega não reinicia a pesquisa de seleção de ONGs.

A migration nova `0008_ngo_private_documents.sql` adiciona tabela e marcador da operação; a numeração 0007 e o ADR
0018 pertencem à frente independente de progresso. A integração das branches deve preservar esses identificadores.
O contrato de rotas e erros fica na [referência da API](../reference/api.md), sem exigir migração de clientes existentes.

Validação usa somente documentos sintéticos e D1/R2 locais. Produção e homologação permanecem sem binding remoto
para documentos. Nenhum recurso remoto, migration remota, segredo ou deploy é autorizado por este ADR.

## Relacionados

[Plano D07](../implementation/ngo-private-documents-plan.md) · [Armazenamento](../reference/storage.md) ·
[OQ-13](open-questions.md) · [Contas e revisão de ONGs](0011-accounts-magic-link-ngo-review.md) ·
[Fotos institucionais](0017-private-ngo-photos.md).
