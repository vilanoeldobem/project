# IMPL-0017: Fotos de ONGs em R2 privado, publicação autorizada pelo D1

**Status:** Proposta — implementação para revisão; ativação pendente (OQ-12)
**Data:** 2026-11-12
**Fontes:** pedido de Nicolas para implementar fotos em PR para Augusto; DEC-028, DEC-037 e PEN-019 do
[registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md);
[plano de implementação](../implementation/ngo-photos-plan.md).

## Contexto

As casas de ONGs aprovadas devem apresentar fotos (DEC-028). O perfil textual do PR #28 já entrega descrição,
tags e projetos. Formatos, quantidade, direitos de imagem, retenção e atualização editorial seguem pendentes
(PEN-019). A implementação deve permitir revisão sem publicar conteúdo automaticamente.

## Decisão proposta

1. D1 continua sendo a autoridade dos dados e permissões. Uma tabela `ngo_photos` guarda vínculo com a ONG,
   legenda, ordem, tipo, tamanho, chave do objeto, estado e revisão. O R2 privado armazena somente os binários
   das fotos institucionais. Esta é uma exceção delimitada à regra anterior de persistência exclusivamente no D1;
   não muda o armazenamento efêmero do `VillageRoom` nem introduz upload de documentos comprobatórios.
2. A API acessa o bucket pelo binding `NGO_PHOTOS`. Nenhuma chave S3 chega ao navegador, código ou URL.
   `r2.dev`, domínio público do bucket e links assinados que contornem a verificação de publicação ficam desativados.
   Binding, bucket, migration remota e deploy exigem uma etapa operacional autorizada, fora deste PR.
3. `NGO_PHOTOS_ENABLED` permanece `"false"` em produção e homologação. A ativação depende de OQ-12 e do
   armazenamento configurado. Escritas e prévias também respeitam a bandeira de contas e suas regras atuais.
4. Cada upload cria objeto e registro novos, inicialmente `pending`. Legenda e ordem pertencem à mesma versão
   imutável dos bytes; substituir uma imagem exige novo upload e nova decisão. Aprovar uma ONG não aprova suas fotos.
5. Administrador distinto do solicitante aprova, rejeita ou remove a foto. A revisão esperada condiciona a mutação;
   um marcador único da operação condiciona sua auditoria na mesma transação D1. Horário não serve como identidade
   da operação, e uma corrida perdida não pode gerar auditoria de sucesso.
6. A leitura pública exige simultaneamente foto `approved`, ONG `published` e terreno realmente associado por
   `lots.ngo_id`, com estado `published`. A API retorna metadados permitidos e serve os bytes após essa verificação.
   Respostas usam `no-store`; bytes têm MIME conferido e `nosniff`. Retirar a publicação bloqueia novas leituras,
   mas não apaga cópias já baixadas por terceiros.
7. Upload usa JSON limitado com base64, preservando `Origin`, preflight e `accountId` existentes. Limites propostos:
   2 MiB decodificados, 3 MiB de corpo e dez fotos não removidas por ONG, contando pendentes, aprovadas e rejeitadas.
   A inserção verifica o limite no SQL,
   evitando que uploads simultâneos ultrapassem a quantidade. Formatos e validação estrutural estão na referência
   da API; reconhecer cabeçalhos não equivale a decodificar a imagem ou remover metadados.

## Consistência entre D1 e R2

Não existe transação única entre os dois serviços. O upload valida identidade, vínculo e conteúdo antes de gravar
objeto com chave gerada no servidor. A inserção D1 repete as condições mutáveis; se falhar, a API tenta apagar o
objeto. Uma interrupção entre gravações pode deixar objeto órfão privado, nunca uma foto pública sem autorização.

A remoção primeiro torna o registro inacessível no D1 e registra auditoria; depois tenta excluir os bytes.
Falha na exclusão não reabre a leitura: a resposta confirma a retirada lógica, não comprova a exclusão física.
O procedimento de retenção e reconciliação de órfãos precisa ser aceito
antes da ativação. Registros removidos preservam histórico e deixam de contar no limite; nenhuma rotina de
retenção automática ou fila é presumida nesta entrega.

## Alternativas consideradas

- **Binário/base64 no D1:** preservaria um único serviço, mas mistura arquivos com consultas e backups relacionais.
  R2 mantém o banco pequeno ao custo de exigir compensação e reconciliação entre serviços.
- **Bucket público ou URL assinada:** reduz leituras pela API, mas permite acesso que não acompanha a situação
  editorial no D1. A API intermediária adiciona uma consulta e tráfego por leitura, escolhidos para manter a retirada.
- **Multipart ou upload direto ao R2:** economiza o acréscimo de aproximadamente um terço do base64, mas exige outro
  contrato de corpo ou fluxo de autorização/finalização. JSON limitado reaproveita as proteções atuais para o volume
  inicial; reconsiderar se tamanho ou volume real justificar.
- **Transformação automática de imagens:** útil para metadados e variantes, porém não está estabelecida na stack.
  A versão inicial não promete sanitização, antivírus ou prova de consentimento. OQ-12 permanece impedimento à ativação.

## Consequências

O contrato público do perfil recebe uma lista adicional de fotos, sem alterar seus campos textuais. O jogo e o
painel ainda precisam consumir as rotas; este PR entrega o back-end. Banco e bucket devem ser separados por ambiente.
Fotos reais só entram após aprovação operacional das regras de privacidade, direitos e retenção. Testes usam dados
sintéticos locais. Novos custos e o procedimento de recuperação do R2 devem ser conferidos na preparação do deploy.

O ambiente `photos-local` do Wrangler permite verificar D1 e R2 no simulador com ambas as bandeiras ligadas,
bindings `remote: false` e recursos sintéticos. Ele não é um ambiente de deploy. Produção e homologação permanecem
sem binding R2 configurado e com fotos desligadas; o nome local de bucket não comprova recurso criado na Cloudflare.

## Relacionados

[API](../reference/api.md) · [Armazenamento](../reference/storage.md) · [OQ-12](open-questions.md) ·
[IMPL-0011](0011-accounts-magic-link-ngo-review.md) ·
[R2: binding e operações](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) ·
[R2: acesso público](https://developers.cloudflare.com/r2/buckets/public-buckets/) ·
[D1: operações em lote](https://developers.cloudflare.com/d1/worker-api/d1-database/).
