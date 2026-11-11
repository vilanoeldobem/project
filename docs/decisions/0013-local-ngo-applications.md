# IMPL-0013 - Candidatura e análise de ONG para validação local

**Estado:** PROPOSTA implementada somente para revisão local.
**Data:** 2026-11-11. **Fontes:** DEC-015/028/037; PEN-019, PEN-020; IMPL-0011/0012.

## Contexto

A casa procedural de uma ONG publicada já existe no jogo. Faltam a candidatura e a análise autorizada que a
publicam. Campos definitivos de documentos, provas e atribuição de administradores ainda dependem do responsável.
Este protótipo valida o núcleo com os campos existentes, sem declarar concluído o cadastro público de ONGs.

## Decisão de execução provisória

- Reutilizar `ngos` como autoridade de estado e revisão; adicionar somente `ngo_applications` para vínculo privado
  com o proprietário autenticado, terreno solicitado, feedback e marcador de mutação concorrente.
- Dados do formulário local: nome, CNPJ numérico, data de abertura, apresentação e terreno solicitado. Não há
  uploads, R2, coleta de documentos, nomeação de administradores ou consultas automáticas a cadastros externos.
- Proprietário vem da sessão; o corpo não aceita ownerId/role. `X-Account-ID` exige coincidência com a sessão,
  impedindo que uma aba antiga envie uma candidatura sob uma conta aberta por outra aba.
- Candidatura enviada não publica nem reserva terreno. **Não reservar antes da aprovação é uma proposta local**;
  o produto precisa ratificar essa política antes da ativação pública. Mais de uma candidatura pode solicitar o
  mesmo terreno disponível; somente uma pode aprová-lo.
- Estados: submitted → under_review → published/rejected/changes_requested. Só o proprietário pode reenviar
  changes_requested, retornando a submitted com revisão nova; feedback permanece privado ao dono e aos revisores.
- Permissão administrativa vem exclusivamente de `ADMIN_USER_IDS`, lista exata de UUIDs no servidor, vazia por
  padrão. Nenhuma permissão Cloudflare, endereço de e-mail, cadastro ou flag enviada pelo cliente concede esse papel.
- Aprovar exige três atestações manuais: CNPJ ativo, existência mínima e mecanismo de confirmação dos recursos.
  A validação de formato/dígitos verificadores/data não comprova situação cadastral nem diligência documental.
- Uma aprovação vencedora associa o terreno, publica a ONG e registra auditoria na mesma transação D1. A primeira
  atualização condicional ganha um marcador aleatório exclusivo para a revisão/estado/terreno livre. Todas as
  operações dependentes exigem esse marcador; update sem linhas não deve produzir publicação ou auditoria.
- Todas as decisões administrativas incrementam revisão e geram um evento com ator por ID, ação, assunto e
  metadados sem apresentação/CNPJ/feedback. Repetição ou revisão antiga retorna conflito, sem duplicar auditoria.
- Registros de candidatura saem somente ao proprietário ou à lista administrativa autorizada. A API pública de
  terrenos continua expondo nome e resumo apenas de ONG publicada; nunca feedback ou CNPJ.

## Limites e próximo aceite

O fluxo continua protegido pelo adaptador de autenticação local: produção/homologação pública permanecem
bloqueadas. Não existe administrador de produção nomeado nesta entrega. Fixtures sintéticas servem somente para
verificação local e não são permissões oficiais. Não foi escolhido um catálogo definitivo de documentos.

Antes de coletar candidaturas reais: ratificar formulário/documentos, retenção e proteção de provas, política de
terrenos, administradores reais e processo de comprovação; configurar autenticação pública e homologação própria.
O suporte de CNPJ deste estudo é o formato numérico já usado no schema existente, não uma declaração de cobertura
de todos os formatos cadastrais futuros ou vigentes.

## Provas

SQL real com migrations completas: duas aprovações concorrentes para o mesmo terreno, replay da mesma aprovação,
revisão vencida, negação de permissões, isolamento entre proprietários, origem/sessão/asserção de conta,
solicitação de ajustes e reenvio, rejeição sem publicação, validação de entrada e atestações obrigatórias.
A prova integrada do navegador demonstra publicação no lote após revisão autorizada. Resultados executados
ficam no PR e no registro de testes; este documento não presume sua execução ou qualquer deploy.
