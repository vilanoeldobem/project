# Fotos de ONGs — segundo incremento de D09

**Status:** implementação para revisão em PR, sem ativação remota
**Data:** 12/11/2026 · **Base:** PR #28 (`feat/public-ngo-profile`)
**Fontes:** DEC-028/037, PEN-019 e D09 do repositório `vilanoeldobem/docs`;
[IMPL-0017](../decisions/0017-private-ngo-photos.md).

## Entrega

A ONG envia uma foto; a equipe analisa; somente a foto aprovada de uma ONG com casa publicada fica disponível
pela API. Nicolas assume armazenamento, contrato e autorização. Augusto mantém a integração visual no jogo e a
revisão do PR. A aprovação do perfil textual e a aprovação de cada foto são independentes.

O código será entregue em `feat/ngo-photos`, inicialmente baseado no PR #28, que ainda aguardava revisão ao iniciar
esta etapa. A dependência deve aparecer no PR, com a base atualizada após a integração do perfil. Nenhuma mudança
é aplicada diretamente à `main` ou à infraestrutura remota.

## Tarefas e aceite

| Ordem | Entrega | Responsável | Evidência necessária |
|---|---|---|---|
| 1 | Modelo D1 e contrato R2 privado, com limites e decisões como proposta | AIOX Architect / Dev | Migration aditiva, ADR e referência da API coerentes; documentos comprobatórios fora do fluxo. |
| 2 | Upload, listagem e prévia autenticada | AIOX Dev | Somente solicitante verificado da ONG pode enviar; outra conta não lê nem escreve; arquivo limitado antes de alocação irrestrita. |
| 3 | Decisão administrativa e retirada | AIOX Dev | Papel admin, impedimento de autoaprovação, revisão esperada e auditoria só da mutação vencedora; retirada bloqueia novas leituras. |
| 4 | Metadados e bytes públicos | AIOX Dev | Foto aprovada + ONG publicada + terreno publicado realmente associado; estados privados respondem sem expor conteúdo. |
| 5 | Falhas e concorrência | AIOX Dev / QA | Limite de quantidade atômico; falha de R2/D1 não publica parcialmente; compensação e limitações documentadas. |
| 6 | Verificação e PR | Coordenação / AIOX QA / DevOps | Typecheck, testes e build da árvore final; revisão estática; PR solicitado a Augusto, sem merge/deploy. |

## Contrato e decisões em aberto

O [contrato da API](../reference/api.md) é a referência única de rotas, campos, limites e erros implementados.
Metadados públicos limitam-se a identificador, URL da API, legenda e ordem; chave R2, solicitante e histórico
administrativo permanecem privados. URLs relativas devem ser resolvidas pelo consumidor contra a origem da API.
Prévias privadas devem ser obtidas com `fetch` autenticado e `Origin` permitido; uma tag de imagem direta não
substitui esse fluxo. A apresentação no HUD e a interface de revisão não fazem parte desta mudança.

Formatos, tamanhos, quantidade, atualização, direitos de imagem e retenção são **PROPOSTAS**, detalhadas em
[OQ-12](../decisions/open-questions.md). A bandeira de fotos permanece desligada. Validação de cabeçalho e dimensões
não prova que uma imagem é segura, não remove EXIF/GPS e não substitui consentimento. A ativação depende da decisão
da equipe sobre esses pontos, além das pendências existentes das contas.

## Verificação

- Testar sessão ausente, conta diferente, solicitante não verificado, `accountId` divergente, origem proibida e admin
  tentando decidir sobre a própria ONG; nenhum desses casos pode gravar objeto.
- Testar corpo acima do limite inclusive sem `Content-Length`, base64 inválido, MIME divergente, SVG/HTML,
  cabeçalho truncado, dimensão inválida, legenda/ordem inválidas e limite de quantidade sob disputa.
- Testar os estados de foto, ONG e terreno separadamente; associação solicitada não basta. Prévias privadas,
  metadados e bytes precisam respeitar a mesma autoria/publicação e `no-store`.
- Testar decisão com revisão antiga e decisões concorrentes: somente uma mudança e uma auditoria correspondente.
  Editar/substituir bytes aprovados no mesmo identificador não é operação disponível.
- Testar upload que falha no R2, inserção D1 que falha após R2 e exclusão de bytes que falha após retirada lógica.
  Falha de upload não vira sucesso. Falha de exclusão física mantém a retirada lógica confirmada e os bytes
  inacessíveis; registrar essa distinção para operação.
- Executar os comandos obrigatórios do repositório serialmente, respeitando o teto local de dois workers.
  Registrar resultado e revisão real no PR; este plano não declara que os testes passaram.

## Passagem para operação

Após revisão, confirmar as decisões de OQ-12; preparar bucket privado separado por ambiente, binding e migration
com autorização; validar uma jornada sintética completa em homologação. O PR não cria bucket, altera segredos,
aplica migration remota, liga contas/fotos, altera o jogo nem envia arquivos reais. D09 só estará completo quando
o HUD consumir o perfil e as fotos aprovadas e a jornada operacional for aceita.

Para a verificação local, usar o ambiente `photos-local` e o roteiro `apps/api/scripts/verify-photos.mjs`, conforme
a referência da API. Os bindings desse ambiente apontam ao simulador (`remote: false`); nunca publicar esse
ambiente nem reutilizar suas contas sintéticas em banco remoto.
