# D07 — Documentos privados da candidatura de ONG

> **Status:** Em implementação para revisão de Augusto; regras PROPOSTA, ativação desligada.
> **Data:** 2026-11-12 · **Decisão técnica:** [IMPL-0019](../decisions/0019-private-ngo-documents.md)

## Entrega e limite da frente

O responsável pela candidatura poderá enviar comprovantes privados, consultar o conjunto anexado, baixar os
arquivos e retirar anexos enquanto a candidatura estiver editável. O administrador poderá listar e baixar os
comprovantes durante sua análise. Somente uma decisão administrativa sobre a revisão vigente pode publicar a ONG;
os documentos continuam privados depois dela.

Esta entrega cobre API, banco, armazenamento e contrato de integração. Augusto mantém a implementação do jogo e do
painel. O fluxo ainda precisa de interface para ser usado por pessoas; rotas prontas não significam jornada liberada.

D07 e PEN-019 justificam a capacidade de anexos. DEC-015 e DEC-037 conservam os critérios e a aprovação existentes.
A lista de documentos obrigatórios, prazos de retenção e procedimentos de análise continuam em
[OQ-13](../decisions/open-questions.md), sem criar critérios de elegibilidade ou retomar DEC-016.

## Tarefas e critérios de conclusão

| Tarefa | Responsabilidade | Critério verificável |
|---|---|---|
| Contrato e limites | AIOX Architect | ADR e OQ-13 descrevem proposta, privacidade, estados editáveis e concorrência; regras não aparecem como aprovação de produto |
| Persistência | AIOX Dev / banco | Migration 0008 cria metadados privados e marcador da operação, preservando migrations anteriores e a numeração reservada à frente de progresso |
| Upload e retirada | AIOX Dev | Solicitante verificado altera somente sua candidatura e revisão atual; alteração incrementa revisão e audita uma única operação confirmada |
| Lista e download | AIOX Dev | Solicitante e admin recebem apenas arquivos autorizados; desconhecido, alheio ou retirado não revela conteúdo; lista e revisão vêm do mesmo snapshot |
| Proteções de arquivos | AIOX Dev | Tamanho, quantidade, tipo e base64 limitados; nome gerado no download; arquivos sempre attachment; nenhum endpoint público |
| Validação | AIOX QA / coordenação | Casos de acesso indevido, concorrência, retirada e falha R2 cobertos; verificação com D1/R2 locais e arquivos sintéticos registrada no PR |
| Entrega | Coordenação / AIOX DevOps | Branch própria e PR para Augusto, sem merge, deploy ou ativação; dependência do PR de fotos e verificações declaradas |

## Contrato para quem integrar

A [referência da API](../reference/api.md) concentra rotas, payloads e erros. O consumidor envia a revisão atual
em upload e retirada e guarda a nova `applicationRevision` devolvida. Conflito de revisão exige recarregar os dados;
não deve haver repetição automática de uma decisão administrativa antiga.

A listagem contém documentos ativos e a revisão da candidatura no mesmo snapshot. Na futura tela de análise,
compare essa revisão com a revisão do detalhe textual. Se diferentes, recarregue ambos antes de habilitar a decisão.
`addedRevision` informa quando o anexo entrou: não filtre os anexos pela igualdade com a revisão atual.
Reenvio preserva os arquivos ativos; substituição exige retirada e novo upload.

Uploads e retiradas ficam bloqueados durante análise ou depois da publicação. Ações de administrador sobre anexos
são somente consulta e download nesta entrega. Fotos públicas da casa permanecem no contrato separado de fotos.

## Cenários de aceite

1. Solicitante verificado envia documento válido na revisão atual: revisão aumenta, documento aparece para ele e
   para admin, e surge uma auditoria sem rótulo ou conteúdo privado. Outro solicitante não consegue listar nem baixar.
2. Revisão antiga, origem inválida, sessão ausente, `accountId` de outra conta e candidatura alheia são recusados.
   Bandeira desligada oculta as rotas; recurso de armazenamento ausente não permite escrita parcial anunciada como sucesso.
3. Dois uploads com a mesma revisão têm no máximo um vencedor. O perdedor não gera auditoria de sucesso e tenta
   remover seu próprio objeto. O limite de anexos é respeitado também no SQL.
4. Upload ou retirada após início da análise ou publicação perde a condição de estado. Se a alteração documental
   vencer primeiro, uma aprovação com a revisão anterior é recusada. Mudança administrativa de estado sem aumento
   de revisão também invalida a operação documental que leu o estado anterior.
5. Lista e `applicationRevision` permanecem coerentes no mesmo snapshot; conjunto ativo inclui anexos de revisões
   anteriores e sobrevive ao reenvio da candidatura. Retirada incrementa revisão e impede novos downloads.
6. Download autorizado usa attachment com nome gerado, tipo permitido, `no-store`, `nosniff` e CSP restritiva.
   Publicar a ONG nunca inclui documentos no perfil público nem torna bytes acessíveis a visitantes.
7. Falhas entre D1 e R2 não abrem acesso ao objeto sem registro ativo. Falha ao apagar bytes depois da retirada
   mantém acesso bloqueado e não é descrita como exclusão física comprovada.
8. Arquivos acima do limite, tipo divergente, estrutura inválida e formatos fora da proposta são rejeitados.
   A documentação diferencia validação estrutural de antivírus, sanitização e prova de autenticidade.

## Preparação de ativação — fora do PR

O aceite de OQ-13 deve registrar documentos solicitados, quem pode consultá-los, limites, segurança do conteúdo,
retenção, atendimento a retirada após publicação e tratamento após exclusão da conta. Depois disso, a operação
precisa configurar bucket privado separado por ambiente, aplicar migration no ambiente autorizado e validar a
jornada completa com a interface. A configuração local não cria recursos na Cloudflare nem concede essa autorização.

As bandeiras de produção e homologação ficam desligadas. O PR entrega código revisável e evidências de testes;
ativação e integração de interface continuam etapas identificadas, sem serem apresentadas como concluídas.
