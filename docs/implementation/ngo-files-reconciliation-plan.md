# Conciliação de arquivos das ONGs com o PR #32

> **Status:** Em implementação para revisão de Augusto; sem ativação remota.
> **Data:** 2026-11-12 · **Decisão:** [IMPL-0021](../decisions/0021-ngo-files-reconciliation.md)

## Entrega

Usar o fluxo de logo e documentos que o Augusto já implementou, preservando o formulário do jogo e a análise
no painel. Sobre essa base, reaproveitar o perfil público e a galeria institucional dos PRs anteriores, com um
bucket privado, validação de imagens compartilhada e uma única implementação de comprovantes.

O novo PR depende do #32. Ele oferece uma substituição revisável para os trechos sobrepostos de #28/#29/#31;
não faz merge nem fecha os PRs originais. O porte da retirada do #33 é a próxima frente, fora deste incremento.
A base atual é `49db536`, incluindo a versão 0.4.0 e as últimas correções do Augusto; verificações da base anterior
não comprovam esta combinação atualizada.

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
   uma segunda rota de comprovantes ou outro binding para o mesmo propósito. Arquivos ficam bloqueados durante
   `under_review`; `start_review` usa a revisão lida no servidor, e outras decisões a revisão vista pelo admin.
   Admins continuam vendo metadados/bytes com bucket ligado e envio desligado; limites e sanitizer atuais são preservados.
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
   preservam `ngo_files`, usuários, candidaturas e histórico; nenhum dado remoto é usado nos testes. Rotas públicas
   mantêm o fallback sem a tabela 0006; isso não dispensa 0010 nas rotas privadas conciliadas.
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

## Verificação da árvore conciliada — 12/11/2026

Base do #32: `49db536a50c96f66e49c982d920b9624bc014306`. Node 24.22.2, pnpm 10.32.1,
Linux; execução serial, prioridade reduzida e dois workers nos testes.

| Verificação executada | Resultado |
|---|---|
| `pnpm --workspace-concurrency=1 -r run typecheck` | 6 pacotes aprovados |
| `pnpm --workspace-concurrency=1 -r run test --maxWorkers=2` | 569 testes: shared 146, API 159, client 179, dash 53, server 23, site 9 |
| `pnpm --workspace-concurrency=1 -r run build` | Todos os builds aprovados; Workers somente `--dry-run` |
| Migrations 0001–0006 + 0010 | Aplicadas somente no D1 do simulador isolado |
| `verify-files-reconciliation.mjs` | Fluxo conjunto aprovado em workerd/D1/R2 local |
| `smoke-api.sh` com API `:8792`, servidor `:8788`, jogo `:8799` | 14 verificações aprovadas |
| `verify-accounts.mjs` | Chromium aprovado: cadastro/progresso, PNG/JPEG real, documento, pedido de ajustes/reenvio, análise, auditoria e logo publicada |

O teste de integração usa PNGs e contas sintéticas. Exercita logo/documentos/galeria, remoção de metadados,
isolamento de acesso, revisão desatualizada, bloqueio durante análise, remoção concorrente com auditoria única,
perfil público e retenção após excluir a conta. Corridas determinísticas com barreiras ficam nos testes de API;
uma rodada HTTP concorrente isolada não substitui esses testes.

Para reproduzir, use apenas o ambiente `reconciliation-local` de `apps/api/wrangler.jsonc`. Aplique as migrations
com `wrangler d1 migrations apply ngo-files-reconciliation-local --local --env reconciliation-local` e inicie
`wrangler dev --env reconciliation-local --local --port 8792 --inspector-port 9242`. Ambos rodam em `apps/api`.
Na raiz, `node apps/api/scripts/verify-files-reconciliation.mjs --seed` gera o SQL dos fixtures; execute-o nesse
D1 **local** antes de rodar `node apps/api/scripts/verify-files-reconciliation.mjs http://localhost:8792`.
O seed reinicia somente seus identificadores sintéticos; não usar esses comandos em uma base compartilhada.

Para o navegador, faça os builds `build:local` do client e do dash e inicie seus Workers em `:8799` e `:8797`,
além do servidor local em `:8788`. Na raiz:

```bash
VILA_API_ENV=reconciliation-local VILA_API_DB=ngo-files-reconciliation-local \
CHROMIUM_PATH=/usr/bin/chromium VILA_STUB_ANALYTICS=1 \
node apps/client/scripts/verify-accounts.mjs http://localhost:8799 http://localhost:8792 http://localhost:8797
```

GTM fica substituído no teste por causa da OQ-13 já registrada no #32; analytics não é validado. Não foram
exercitados Safari/Firefox, largura de celular ou envio real de e-mail. A galeria ainda não tem interface neste
incremento; sua validação é pela API. Nenhum ambiente remoto foi modificado.

A primeira rodada do navegador terminou por timeout ao abrir a segunda cena 3D. O harness foi ajustado para
suspender a página do solicitante enquanto cria a conta administrativa, preservando o contexto e os cookies;
a rodada completa seguinte passou, sem aumentar timeouts ou retirar asserções. Capturas ficam no diretório
local ignorado `apps/client/verify-output/`. A aplicação não recebeu alteração visual por causa desse ajuste.
