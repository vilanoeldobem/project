# Conciliação de arquivos das ONGs com o PR #32

> **Status:** Em implementação para revisão de Augusto; sem ativação remota.
> **Data:** 2026-11-12 · **Decisão:** [IMPL-0021](../decisions/0021-ngo-files-reconciliation.md)

## Entrega

Usar o fluxo de logo e documentos que o Augusto já implementou, preservando o formulário do jogo e a análise
no painel. Sobre essa base, reaproveitar o perfil público e a galeria institucional dos PRs anteriores, com um
bucket privado, validação de imagens compartilhada e uma única implementação de comprovantes.

O novo PR depende do #32. Ele oferece uma substituição revisável para os trechos sobrepostos de #28/#29/#31;
não faz merge nem fecha os PRs originais. O porte da retirada do #33 é a próxima frente, fora deste incremento.

## Divisão e critérios

| Frente | Responsabilidade | Critério de conclusão |
|---|---|---|
| Contrato | AIOX Architect | Matriz descreve o que fica de cada PR, diferenças de política e numeração sem colisões |
| Logo/documentos | AIOX Dev | Rotas e telas de #32 preservadas; revisão/estado/dono conferidos na escrita e auditoria única por vencedor |
| Snapshot de análise | AIOX Dev | Candidatura, revisão e arquivos coerentes no retorno usado pelo painel e pelo responsável |
| Galeria | AIOX Dev | Fotos separadas de documentos, no `FILES`; upload limitado, aprovação individual e remoção com auditoria |
| Publicação | AIOX Dev | Perfil/logo/fotos dependem da associação publicada real; nenhum comprovante ou dado privado entra no perfil |
| Preservação | AIOX Dev / QA | Upgrade da base #32 mantém arquivos, dados e contratos; exclusão de conta conserva a regra documentada sob concorrência |
| Validação | AIOX QA / coordenação | Regressões SQL/R2, contrato das telas e fluxo local exercitados; evidência real registrada no PR |
| Entrega | AIOX DevOps | Branch própria sobre #32 e PR para Augusto, com pendências e substituições explícitas |

## Aceite técnico

1. O upload e o download de logo/documentos continuam funcionando com o cliente e o painel do #32; não existe
   uma segunda rota de comprovantes ou outro binding para o mesmo propósito.
2. Alterar arquivo incrementa a revisão uma vez. Corridas de upload, remoção, análise ou aprovação não geram
   auditoria duplicada nem confirmam alteração que perdeu a condição de dono/revisão/estado.
3. O painel não recebe arquivos novos associados a uma revisão antiga, nem arquivos antigos apresentados
   como se pertencessem a uma revisão mais nova. O formato público das respostas privadas é preservado.
4. A galeria compartilha o bucket, mas usa prefixo próprio e tabela editorial. Documentos nunca aparecem em
   metadados, galeria ou rota pública por tipo de arquivo, id adivinhado ou estado de publicação da ONG.
5. Foto recém-enviada permanece privada; somente decisão administrativa válida a aprova. O limite continua
   correto sob concorrência. Falha entre R2 e D1 deixa no máximo objeto privado a reconciliar, sem publicação.
6. Perfil, logo e fotos aprovadas exigem terreno publicado realmente associado; um `requested_lot_id` antigo
   não abre acesso. A próxima consulta revalida o estado e não recebe cache público da logo.
7. Imagens passam pelo tratamento compartilhado; limites, formatos recusados e ausência de análise completa
   de PDF são documentados. Nenhum nome original, caminho, credencial ou chave de objeto é exposto no contrato.
8. A migration 0010 parte da base #32 sem reconstruir nem renumerar sua migration 0006. Fixtures anteriores
   preservam `ngo_files`, usuários, candidaturas e histórico; nenhum dado remoto é usado nos testes.
9. Exclusão de conta não mistura decisões tomadas antes/depois de uma aprovação concorrente de modo a deixar
   logo público apontando para bytes apagados. A decisão sobre documentos e fotos fica coerente com as regras
   explicitadas na referência de armazenamento.
10. O jogo e o painel do #32 continuam utilizáveis; a galeria não recebe tela nova neste incremento.

## Passagem para revisão

O PR deve apresentar as verificações efetivamente executadas, a base exata do #32 e a proposta de destino de
#28/#29/#31. Conclusão deste incremento não significa que os PRs antigos podem ser mesclados sem adaptação.
O CI precisa validar esta árvore conciliada; CI verde de cada alternativa isolada não comprova combinação.

O próximo porte do #33 precisa reaplicar seus guardas ao fluxo resultante, incluindo logo, fotos, documentos e
exclusão de conta. Não há declaração de compatibilidade antecipada com aquela branch.

Ativação depende das políticas OQ-12/OQ-15, preparação operacional e autorização explícita. OQ-13 de analytics
do #32 é preservada; não se deve reutilizar seu número para documentos. Missões e progresso não são alterados.
