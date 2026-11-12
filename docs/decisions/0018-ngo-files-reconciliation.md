# IMPL-0018: Conciliação de arquivos e galeria de ONGs sobre o fluxo do PR #32

**Status:** Proposta — implementação para revisão de Augusto; ativação remota permanece desligada
**Data:** 2026-11-12
**Fontes:** pedido de Nicolas para conciliar os PRs de arquivos aproveitando o trabalho do Augusto;
[PR #32](https://github.com/vilanoeldobem/project/pull/32), [PR #28](https://github.com/vilanoeldobem/project/pull/28),
[PR #29](https://github.com/vilanoeldobem/project/pull/29) e [PR #31](https://github.com/vilanoeldobem/project/pull/31);
DEC-028, DEC-037 e PEN-019 do repositório `vilanoeldobem/docs`;
[registro da entrega](../implementation/ngo-files-reconciliation-report.md).

## Contexto

O PR #32 implementou logo e comprovantes com formulário no jogo, análise no painel, upload binário, remoção de
metadados de imagens e armazenamento privado. Os PRs #29/#31 desenvolveram, em paralelo, galeria institucional e
comprovantes com outros contratos, tabelas e buckets. A mesma numeração de migration e ADR foi usada para coisas
diferentes. Integrar as árvores sem conciliação duplicaria comprovantes e produziria políticas incompatíveis.

A base de revisão é o PR #32 em `49db536`, que inclui a versão 0.4.0 e as correções posteriores ao primeiro
levantamento. Seu bloqueio de arquivos durante análise, leitura administrativa com envio desligado, limites
de mutação e tratamento de imagens são preservados nesta conciliação.

Três conceitos têm funções distintas: **logo** identifica a ONG; **documento** comprova a candidatura e permanece
privado; **foto institucional** compõe uma galeria editorial e exige aprovação individual. Uma galeria não pode
ser implementada tornando públicos todos os arquivos da candidatura.

## Decisão

1. **Adotar o PR #32 como base de logo e documentos.** Preservar suas rotas, payloads, upload binário com
   `X-Vila-Account`, respostas com `files`, interface do jogo e interface administrativa. Preservar
   `ngo_files`, a migration `0006_ngo_files.sql` e o IMPL-0017 desta árvore. Não importar a API paralela
   `/ngo/documents`, a tabela `ngo_documents`, o binding `NGO_DOCUMENTS` ou a migration 0008 do PR #31.
2. **Usar um armazenamento de bytes privado.** O binding `FILES` atende logo, documentos e galeria, com
   prefixos de objeto distintos e chaves geradas no servidor. A autorização continua por registro e rota no D1;
   conhecer uma chave não dá acesso. Não criar bucket público, domínio R2 ou URL assinada que contorne a API.
3. **Manter a galeria separada no domínio.** `ngo_photos` guarda revisão, legenda, posição e estado editorial;
   a nova migration 0007 adiciona essa estrutura e os guardas necessários à conciliação. Fotos entram pendentes;
   outro administrador aprova, rejeita ou remove. Aprovar a candidatura não aprova a galeria. Bytes e metadados
   de uma foto são imutáveis; substituir exige novo envio e revisão.
4. **Reutilizar a validação de imagens do PR #32.** Logo/documentos conservam seus limites. A galeria usa
   PNG/JPEG, até 2 MiB, lados até 4096 px, área até 16 milhões de pixels e até dez fotos pendentes/aprovadas, conforme
   proposta herdada de #29. WebP do contrato anterior fica de fora, pois não tem tratamento compartilhado de
   metadados. A API da galeria recebe bytes e metadados limitados fora da URL; o contrato exato fica na
   [referência da API](../reference/api.md). Não manter um segundo parser de imagem/base64 para a galeria.
5. **Preservar as telas prontas.** A integração de logo/documentos continua no jogo e no painel. Este incremento
   entrega a API da galeria e o perfil público textual aproveitado de #28; não cria outra tela de candidatura,
   um editor de galeria ou um novo fluxo visual de aprovação.
6. **Conservar a política de edição do PR #32 atualizado.** Arquivos da candidatura podem ser alterados em
   `submitted`, `changes_requested` e `rejected`; ficam bloqueados durante `under_review` e depois de `published`.
   `start_review` usa a revisão atual lida no servidor, sem exigir que seja a revisão enviada pelo cliente;
   sua escrita ainda confere o estado e a revisão lidos. As demais decisões exigem a revisão vista pelo admin.
   Toda mutação confere dono, revisão e o estado exato observado. Mudar arquivo aumenta a revisão e invalida uma aprovação antiga.
   Uma operação concorrente perdedora não pode confirmar auditoria usando apenas horário, ausência da linha
   removida ou uma revisão que outra operação produziu; usa identidade exclusiva da mutação vencedora.
   Preservar os limites canônicos de 20 envios/remoções por minuto por conta e 60 mudanças por candidatura em 24 horas.
7. **Ler candidatura e arquivos de forma coerente.** Os dados apresentados ao solicitante e à administração
   devem trazer a revisão e o conjunto de arquivos do mesmo snapshot. Preservar o formato já consumido pelas
   telas. Com `FILES` disponível, a administração lê metadados e bytes mesmo com `NGO_FILES_ENABLED` desligado;
   desligar novos envios não esconde evidências de quem decide. Documentos ativos acompanham reenvios da
   candidatura; não duplicar registros por revisão.
8. **Uniformizar a publicação.** Perfil textual, logo e galeria exigem ONG publicada e terreno realmente
   associado por `lots.ngo_id`, também publicado. Galeria exige ainda foto aprovada. Leituras públicas de
   logo/foto/perfil usam `no-store`, incluindo verificações condicionais, para que uma nova consulta confira
   a autorização atual. Isso não remove cópias já baixadas nem atualiza automaticamente uma cena aberta.
9. **Conservar a privacidade do fluxo do Augusto.** Documentos são downloads autenticados, sem nomes originais
   persistidos; leitura administrativa é auditada. A intenção de retenção do PR #32 permanece: excluir a conta
   remove documentos e o logo ainda não publicado, preservando o logo institucional publicado. As proteções de
   concorrência precisam respeitar essa distinção também quando aprovação e exclusão acontecem juntas.
   A galeria é removida integralmente quando a conta é excluída, inclusive as fotos aprovadas. A correção
   atende à revisão de remoção de conteúdo: a preservação canônica do logo não se estende à galeria.
   A implementação não transforma essa proposta técnica em aprovação jurídica de retenção.
10. **Manter a implantação separada da entrega.** `NGO_FILES_ENABLED` e `NGO_PHOTOS_ENABLED` ficam desligadas
    remotamente. Nenhuma migration, bucket, segredo, domínio, merge ou deploy é executado por esta conciliação.
    Dados reais e ativação dependem de OQ-12/OQ-15 e das autorizações operacionais existentes.

### Exclusão da conta concorrente com análise e arquivos

A intenção de excluir arquivos da conta precisa ser persistida em D1 antes de apagar bytes no R2. O marcador
`users.files_deleting`, adicionado em 0007, congela as mutações relevantes da candidatura, arquivos, galeria e
análise administrativa tanto na leitura inicial quanto na condição SQL de escrita. Assim, uma aprovação não
pode trocar o destino do logo enquanto a limpeza usa a decisão observada. Se a aprovação vencer antes da
intenção, o logo já publicado é preservado; se a intenção vencer, a aprovação perde sua condição de escrita.

R2 e D1 continuam sem transação distribuída. Se o R2 falhar, a conta permanece, como no #32, e a intenção fica
registrada para repetir `DELETE /me`. Não remover o marcador após falha parcial: alguns bytes podem já ter sido
apagados. Consultas e sessão continuam disponíveis; gravações relacionadas respondem que a exclusão está em
andamento. Uma repetição conclui a limpeza de forma idempotente. A finalização em D1 remove os registros,
incrementa as revisões das candidaturas, remove a conta e grava uma única auditoria; dois pedidos concorrentes
não devem duplicá-la. O incremento invalida análises/reenvios já lidos mesmo depois de desaparecer a linha do
usuário com a intenção de exclusão. Essa intenção durável substitui a segunda passagem de limpeza do #32 para
que aprovação e envio não mudem o conjunto de evidências enquanto R2 é limpo.

Nesse intervalo pode haver metadado privado cujo objeto já foi apagado; o download falha de forma fechada.
Não afirmar atomicidade entre D1 e R2 nem comprovar exclusão física só pelo início da operação. Não há serviço
novo de fila, rotina de expiração ou cancelamento da intenção neste incremento; recuperação é repetir a
exclusão autorizada. A referência de armazenamento descreve o procedimento; a validação desta rodada está
registrada separadamente no relatório da entrega.

### Recuperação de logo e comprovantes

`media_upload_intents` registra `id`, `ngo_id`, `uploaded_by`, `created_at` e `cleanup_pending` antes de acessar
R2. A chave é derivada de ONG/id; não duplica nome, conteúdo, tamanho ou tipo do arquivo. O índice único de logo
em `ngo_files` impede usar essa tabela como área temporária para uma substituição. O registro separado guarda
somente a intenção de envio/limpeza, sem introduzir outro contrato de documentos.

`media-storage.ts` é compartilhado com a galeria: reserva vazia, releitura da autorização e escrita dos bytes
condicionada ao ETag da reserva. A transação canônica só finaliza com intenção ativa e a remove junto da gravação
dos metadados/auditoria. Remover arquivo ou substituir logo cria uma intenção de limpeza na transação que
desvincula os metadados; a intenção só desaparece após confirmação da exclusão em R2. Se a confirmação do commit
se perder, reler os metadados antes de compensar impede apagar bytes já vinculados.

Responsável e admin podem acionar as rotas autenticadas de recuperação em `files/recover`, mesmo com o envio
desligado. Cada chamada trata até 50 intenções: limpeza já marcada ou upload com mais de 15 minutos. O prazo
identifica envio abandonado para cancelamento; não define retenção de documentos. A recuperação marca a intenção
antes de apagar bytes, impedindo a finalização de um upload atrasado. Admin registra a tentativa antes do I/O
destrutivo; falha mantém o registro para repetição. `DELETE /me` inclui as chaves e intenções da conta.

Não há cron ou serviço de fila neste incremento. Uma queda no intervalo de criação de uma reserva vazia após
cancelamento pode deixar zero bytes sem dados pessoais. Não afirmar atomicidade distribuída ou zero objetos
órfãos; a execução dos testes desta rodada ainda precisa ser registrada.

### Ciclo de vida da galeria após revisão

O responsável pode remover uma foto, inclusive aprovada, e a exclusão da conta apaga toda a galeria.
Rejeitar libera cota e limpa a legenda. A revogação em D1 precede a exclusão dos bytes: falha mantém marcador
`cleanup_pending` e a linha descoberta nas listas/fila para repetição. Envios são permitidos somente em
`submitted`, `changes_requested` e `published`; a galeria tem decisão própria, sem liberar comprovantes.

Uma linha `upload_pending` é criada antes de R2. Uma reserva vazia e escrita condicional pelo ETag impedem que
um upload atrasado recrie bytes pessoais depois de uma remoção concorrente da reserva. O limite de escrita
na mesma chave exige uma tentativa adicional limitada quando R2 responde 429; não há repetição ilimitada.
Confirmação incerta de D1 exige releitura antes de descartar o objeto. A galeria guarda a intenção na própria
linha; logo/comprovantes usam `media_upload_intents`, descrita acima. Ambos reutilizam a mesma primitiva de
reserva/escrita condicional, preservando seus contratos e caminhos próprios de recuperação.

Envio e GET administrativo de foto geram auditoria. Aprovação exige leitura registrada da mesma foto/revisão
pelo mesmo administrador; HEAD só consulta metadados. Isso comprova acesso ao conteúdo, não compreensão nem
validade jurídica da imagem. Declaração de direitos e conferência operacional continuam sob OQ-15.

### Mapa de substituição para revisão

| Origem | Aproveitado | Destino da alternativa |
|---|---|---|
| PR #32 | Logo/documentos, telas, upload binário, sanitizer compartilhado, auditoria de leitura, contratos e `FILES` | Base preservada; correções de concorrência e publicação entram neste PR |
| PR #28 | Perfil textual público e vínculo ao terreno publicado | Portado sobre #32; reconciliar o PR original na integração para não aplicar a mesma entrega duas vezes |
| PR #29 | Galeria, revisão individual, imutabilidade, limites, auditoria e guardas públicos | Adaptado para `FILES`, bytes binários e parser compartilhado; não integrar sua migration 0006 ou ADR 0017 conflitantes |
| PR #31 | Casos de privacidade, concorrência e coerência da revisão dos documentos | Reaplicados ao contrato do #32; API/tabela/bucket paralelos não entram |
| PR #30 | Progresso | Independente; não incorporado por esta conciliação |
| PR #33 | Retirada administrativa | Porta posterior sobre o fluxo conciliado; não incorporada nem declarada compatível nesta entrega |

Esse mapa propõe substituir os trechos sobrepostos dos PRs anteriores. Não fecha, altera a base, aprova ou faz
merge desses PRs automaticamente; Augusto decide a integração após revisão.

### Numeração e bases de dados

O esquema contém migrations sequenciais 0001–0007; a 0006 canônica é preservada. A antiga 0010 desta entrega
não foi aplicada remotamente e foi renomeada antes da integração para 0007. O ADR usa o próximo identificador
após IMPL-0017. Não há reserva de números para PRs ainda abertos: cada integração usa a sequência efetiva.

A 0007 é pré-requisito das rotas de conta conciliadas mesmo com as flags de arquivos desligadas. Os fallbacks
públicos do #32 para ausência de `ngo_files` continuam: `/lots` responde sem logo e a rota de logo responde 404.
Esses fallbacks não tornam um banco antigo compatível com as novas rotas privadas.
Se uma operação de conta encontrar ausência das colunas novas, responde `503 schema_outdated` sem repetir a
escrita com guardas mais fracos. Isso não bloqueia globalmente cadastro, emissão de links ou consultas sem
sessão; a migration continua sendo pré-requisito operacional.

Um banco local criado com a migration 0006 de fotos do PR #29 é uma **linhagem alternativa**, não a base de
upgrade deste PR. Não tentar converter esse banco só aplicando os scripts daqui, renomeando migrations ou
apagando tabelas. Esta entrega usa novo simulador isolado e não migra bytes/metadados de uma alternativa para
outra. Se dados reais tiverem sido carregados numa dessas alternativas, um plano explícito de preservação e
conversão será necessário antes da integração.

## Alternativas consideradas

- **Manter as duas implementações de comprovantes:** evitaria portabilidade imediata, mas deixaria limites,
  retenção, permissões, telas e revisões divergentes. Rejeitada em favor da base que já possui integração visual.
- **Tratar fotos como documentos ou logos:** reduziria tabelas, mas perderia revisão individual e tornaria fácil
  expor comprovantes por engano. Um bucket não exige um único estado editorial para todo tipo de arquivo.
- **Criar outro bucket e parser para a galeria:** isolaria o armazenamento, porém duplicaria infraestrutura e
  validação. Prefixos e rotas privadas explícitas permitem reusar `FILES`; testes devem provar o isolamento.
- **Mesclar os PRs por resolução mecânica de conflitos:** não resolve diferenças de significado, sobretudo
  retenção e revisão. A conciliação parte de #32 e porta capacidades delimitadas, com matriz e testes.
- **Portar a retirada agora:** ampliaria o escopo antes de estabilizar arquivos. Fica para a próxima entrega;
  ela deverá considerar a logo, a galeria, os documentos, exclusão de conta e a nova política de cache juntos.

## Consequências

O Augusto preserva suas interfaces e recebe um único contrato de comprovantes. A galeria compartilha o
armazenamento e a validação, mantendo aprovação própria. O custo é uma adaptação deliberada do contrato de
fotos ainda não integrado e uma etapa de revisão para substituir os PRs sobrepostos.

A remoção de metadados não é antivírus, decodificação integral, prova de direitos de imagem ou validação da
autenticidade de um PDF. Os limites e a retenção continuam propostas. Leitura administrativa de documento é
auditada como já previsto em #32; outras consultas administrativas continuam sob OQ-11.

## Relacionados

[IMPL-0017](0017-ngo-files-r2.md) · [Registro](../implementation/ngo-files-reconciliation-report.md) ·
[API](../reference/api.md) · [Armazenamento](../reference/storage.md) · [Perguntas abertas](open-questions.md).
