# Registro da conciliação de arquivos e galeria

> **Status:** Correções em revisão; ativação remota desligada · **Versão do software:** 0.4.0 · **Schema D1:** v7
> **Atualizado em:** 2026-11-12
> **Fonte de verdade:** [PR #35](https://github.com/vilanoeldobem/project/pull/35), código e testes referenciados abaixo;
> contratos em [API](../reference/api.md), [armazenamento](../reference/storage.md) e [IMPL-0018](../decisions/0018-ngo-files-reconciliation.md).

## Entrega e integração

O fluxo de logo/comprovantes do #32 é a base canônica. A entrega reaproveita o perfil público do #28 e a revisão
individual da galeria do #29 no mesmo bucket privado, sem a segunda implementação de documentos do #31.
A interface de candidatura e o painel existentes são preservados; a galeria permanece uma API sem editor visual.

Ordem acordada de integração: **#32 → #35 → #30**. #32 fornece migration 0006 e IMPL-0017; #35 usa a próxima
migration 0007 e IMPL-0018; #30 será atualizado sobre essa base com 0008 e IMPL-0019. Se a ordem mudar, os
identificadores ainda não aplicados devem ser revistos antes do merge. Não se reservam lacunas na sequência.
A antiga 0010 deste PR só foi usada no simulador local: não há afirmação de aplicação remota. A nova validação
usa outro banco/bucket sintético; o simulador antigo permanece intacto. Não renomear seu histórico em uso.

#28/#29/#31 são referências da conciliação, não alterações para aplicar cumulativamente. Encerrá-los ou mesclar
qualquer PR cabe ao revisor. A retirada de ONG do #33 será portada depois, incluindo seus efeitos em mídias.

## Respostas às revisões

As referências apontam para o código/teste da correção; a validação desta rodada está na seção final. A coluna
“encaminhamento” não substitui resultado de teste nem aprovação da operação. Comentários operacionais pendentes
continuam bloqueando ativação, mesmo com o mecanismo técnico pronto.

| Revisão / item | Encaminhamento no #35 | Evidência / limite |
|---|---|---|
| #28.1, #28.3 — schema público v3 | Consulta tolerante com lista explícita de campos; teste usando somente migrations 0001–0003 | `public-ngo.ts`, `public-ngo.test.ts` |
| #28.2 — campos públicos / cidade | Aviso na candidatura sobre descrição, causas e projetos; cidade excluída da resposta pública | `NgoApplication.tsx`, `public-ngo.ts`, API |
| #28.4 — plano / nomes externos | Plano substituído por este registro indexado; papéis neutros | Índice de docs e `tasks/todo.md` |
| #28.5 — referências | Arquitetura inclui rota e módulo; erro D1 ampliado; cabeçalhos alinhados | API, arquitetura, armazenamento, versionamento |
| #29.1, #29.6 — EXIF / JPEG final | Um sanitizador PNG/JPEG compartilhado com #32; nenhuma cópia base64/WebP | `accounts/files.ts`, `accounts/photos.ts` e testes |
| #29.2 — remoção pelo responsável | Retirada autenticada e repetível pelo responsável implementada; validado no CI desta rodada | `ngo-photos.ts` e regressões |
| #29.2 — exclusão da conta | Toda galeria, inclusive aprovada, deve ser apagada; logo canônico conserva regra própria | `auth.ts`, `files.ts`, regressões de exclusão |
| #29.2 — rejeição/cota/repetição/status | Rejeição libera cota, limpeza retomável e estados de envio explícitos implementados; validado no CI desta rodada | `ngo-photos.ts`, migration 0007, testes |
| #29.3 — direitos / consentimentos | Decisão operacional pendente em OQ-15; não registrar uma política como aprovada por inferência | Esquema/mecanismo devem registrar versão, responsável e conferência, sem documentos de crianças |
| #29.4 — colisão com #32 | `FILES`, bytes crus e sanitizador canônicos; `ngo_photos` só para ciclo editorial; sequência sem lacunas | IMPL-0018 e migrations 0006/0007 |
| #29.5 — falha da galeria derruba perfil | Perfil degrada para `photos: []` se binding/tabela indisponíveis | `public-ngo.test.ts`, `ngo-photos.ts` |
| #29.7 — órfãos sem rastreio | Intenção de upload/limpeza durável antes dos bytes, identificador interno auditável implementados; validado no CI desta rodada | migration 0007, `ngo-photos.ts`, testes de falha |
| #29.8 — limite de envio | Reutiliza limitador canônico, bytes limitados durante leitura e sem base64 | `ngo-photos.ts`, `accounts/photos.ts` |
| #29.9 — auditoria e revisão visual | Envio/leitura auditados, aprovação requer leitura registrada e fila administrativa implementados; validado no CI desta rodada | `ngo-photos.ts`, testes; leitura registrada não prova compreensão humana |
| #29.10 — ambiente local no deploy | Configuração local separada, sem conta/recursos de produção, chamada por `-c` | `wrangler.reconciliation-local.jsonc`, guia de desenvolvimento |
| #29.11 — nomes externos | Registro e tarefas usam papéis neutros | Este registro, `tasks/todo.md` |
| #29.12 — HEAD abre corpo | Leitura HEAD usa metadados do bucket | `ngo-photos.ts` e teste |
| #29.13 — lacunas de teste | Casos pedidos incluídos na rodada de correção; resultado registrado abaixo | testes de galeria, perfil e exclusão |
| #31.1 — leitura de comprovante auditada | Preservada no fluxo canônico #32 | `files.ts`, `files.test.ts` |
| #31.2 — apagamento | Documentos removidos na exclusão da conta, inclusive após publicação; limpeza retomável | `files.ts`, `auth.ts`, testes |
| #31.3 — evidências não vistas | Snapshot único com arquivos e UI de análise do #32; bloqueio durante análise | `ngo.ts`, `admin.ts`, painel; não afirma comprovação legal automática |
| #31.4 — duplicação | Pipeline de #31 não importado; sem labels livres, tabela ou bucket paralelo | IMPL-0018 |
| #31.5 — put/commit incerto | Registro durável antes de R2, escrita condicional, releitura após confirmação incerta e recuperação autenticada implementados; validado no CI desta rodada | `media_upload_intents` (0007), `files.ts`, `media-storage.ts`, `files-reconciliation.test.ts` |
| #31.6 — testes frágeis | Regressões no fluxo canônico para revisão, bytes, exclusão e streaming; resultado registrado abaixo | `files.test.ts`, `files-reconciliation.test.ts` |
| #31.7 — churn | Limites do #32: 20 alterações/minuto/conta, 60/dia/candidatura; bloqueio em análise | `files.ts`, testes |
| #31.8 — limites / EXIF | Limites do #32 mantidos: documentos 5 MiB, lados até 8192; sanitizador compartilhado | `accounts/files.ts` |
| #31.9 — docs / seed | Contratos unificados, specs já permitem arquivos; comandos locais em guia; fixtures só no simulador novo | API/storage/specs; scripts locais |
| #30.1 — divergência de progresso | Tratada no próprio #30; recuperar estado autoritativo com teste do cliente, sem inventar abandono | `progress.ts`, `account.test.ts` no #30; OQ-09 preservada |
| #30.2 — numeração | Integração #32→#35→#30; #30 segue com 0008/IMPL-0019 sobre a base atualizada | Merge da base conciliada e validação do #30 pelo responsável |
| #30.3 — referências descrevem branch | Remover reservas/estado de branch no #30, como neste PR | Referências de armazenamento/versionamento |
| #30.4 — erros faltantes | Tabela acompanha o contrato final escolhido no #30 | `api.md` no #30 |
| #30.5 — plano e nomes externos | Registro indexado e papéis neutros no próprio #30 | Registro de progresso e tarefas |
| #30.6 — contenção | Espera curta com variação entre tentativas, no #30 | Testes de repetição/concorrência do #30 |

Revisões originais: [#28](https://github.com/vilanoeldobem/project/pull/28#pullrequestreview-5877411365),
[#29](https://github.com/vilanoeldobem/project/pull/29#pullrequestreview-5877692175),
[#30](https://github.com/vilanoeldobem/project/pull/30#pullrequestreview-5877411763),
[#31](https://github.com/vilanoeldobem/project/pull/31#pullrequestreview-5877692570).

## Revisão direta do #35 — segunda rodada

A [revisão do responsável técnico](https://github.com/vilanoeldobem/project/pull/35#pullrequestreview-5879329638)
foi publicada sobre `0921674` enquanto a primeira rodada de correções já estava em andamento. Conferência
contra a árvore atual, sem tratar a aprovação técnica ou a OQ-15 como resolvidas por inferência:

| Item | Encaminhamento | Evidência / limite |
|---|---|---|
| #35.1 | Perfil compatível com v3, agora exercitado nas 16 combinações de flags/bucket; todas as rotas públicas sempre ligadas conferidas em v3–v6 | `public-ngo.test.ts` |
| #35.2 | Exclusão pendente visível na conta/painel; admin pode rejeitar candidatura aberta e liberar o terreno; pedido recusado sem bucket, antes de apagar qualquer objeto, não congela a conta | contratos de conta/admin, UI e testes; validado localmente nesta rodada |
| #35.3 | Remoção pelo responsável, rejeição individual, cota, retry, bloqueio de upload após rejeição e exclusão da conta corrigidos | Consentimento e retenção após rejeitar a candidatura continuam abertos na OQ-15; galeria desligada |
| #35.4 | Sequência 0007/IMPL-0018; regra original de logo público preservada | Exceção da galeria continua PROPOSTA, exige aceite explícito do responsável técnico |
| #35.5 | Aviso de campos públicos, cidade privada e módulo marcado PROPOSTA | fluxo real de candidatura; `NgoApplication.tsx` e `public-ngo.ts` |
| #35.6 | Guia avisa indisponibilidade autenticada sem 0007, inclui galeria e sua flag | deploy §3/§7/§9 e arquitetura; sem aplicação remota |
| #35.7 | Perfil responde `photos: []` sem recursos; bytes públicos respondem `404` em v3/v5/v6 | regressões de perfil/fotos |
| #35.8 | Logo/fotos públicos usam `no-cache` e ETag; autorização verificada antes de `304` | teste de revalidação sem corpo e `404` após retirada; bytes privados seguem `no-store` |
| #35.9 | Registro indexado e papéis neutros | plano substituído, fontes e limites separados |
| #35.10 | Configuração local separada | `-c`, recursos sintéticos, sem conta/rotas de produção |
| #35.11 | FK de fotos sem cascata | apagar ONG com metadado de foto é recusado; não perde rastreio dos bytes |
| #35.12 | Casos de schema/limiter/retenção individual ampliados; exclusão pendente coberta nesta rodada | execução e limites descritos abaixo |

### Verificação da segunda rodada

- Checagem de tipos dos seis pacotes passou localmente; o client foi conferido novamente após corrigir o teste SSR.
- `pnpm --workspace-concurrency=1 -r run test --maxWorkers=1`: **621 testes aprovados** (shared 146, API 207,
  client 181, dash 55, server 23, site 9), Node 24.22.2 / pnpm 10.32.1, execução serial em dois threads de CPU.
- Revisão estática e `git diff --check` aprovados. Testes de sessão/admin usam o handler real com D1 SQLite;
  o teste SSR usa o componente real e adapta apenas o snapshot do hook ao estado atual.
- O [CI do PR #35](https://github.com/vilanoeldobem/project/pull/35/checks) é a fonte do resultado de build,
  smoke workerd/D1/R2 e Chromium desta rodada. O navegador cobre também os dois avisos de exclusão pendente
  e os controles bloqueados, usando estado sintético sem executar exclusão naquele intervalo. Falhas reais de
  R2 e corrida entre rejeição/exclusão estão nos testes da API.

A ativação segue dependente da OQ-15 (incluindo retenção após rejeição da candidatura) e do aceite técnico da
exceção proposta para publicação da galeria. Os números abaixo documentam apenas a primeira rodada.

## Verificação da primeira rodada

A árvore anterior `0921674` passou typecheck, 569 testes, build, smoke local e navegador Chromium, com analytics
substituído por causa da OQ-13. Esse histórico antecede as correções desta revisão, a nova numeração e o novo
simulador; não comprova a árvore atual. Nenhuma migration ou ativação remota ocorreu.

**Primeira rodada:** [CI no commit `bb1c813`](https://github.com/vilanoeldobem/project/actions/runs/43272168427/job/131371240921), em Linux, Node 24.22.2 e pnpm 10.32.1:

- `pnpm typecheck`, `pnpm test` e `pnpm build`: aprovados. **593 testes** (shared 146, API 183, client 179, dash 53, server 23, site 9).
- `node scripts/verify-media-local.mjs`: aprovado com banco/bucket novos no simulador workerd/D1/R2, migrations 0001–0007 e dados sintéticos. Inclui escrita condicional, remoção pelo responsável, auditoria de leitura/aprovação e exclusão de conta.
- Builds `build:local` do jogo/painel e `node scripts/verify-media-local.mjs --browser`: aprovados. Chromium executa o fluxo real existente de conta/candidatura/arquivos, análise, publicação do logo e os avisos de campos públicos/cidade privada; não é teste só de componentes.
- `git diff --check` e revisão estática: aprovados, sem P1/P2 aberto.

O navegador usa GTM substituído (OQ-13); analytics, e-mail real, outros navegadores e infraestrutura remota não foram validados. A execução foi feita no CI para respeitar a carga do host local. Procedimento e limites em
[desenvolvimento](../guides/development.md#conciliação-local-de-arquivos-e-galeria).

A revisão operacional de direitos de imagem, consentimentos e ativação continua pendente em OQ-15.
O pipeline canônico agora registra a intenção antes de gravar bytes: uploads interrompidos e exclusões físicas
pendentes ficam recuperáveis pelo responsável ou por admin. Os casos de regressão incluem confirmação incerta,
substituição de logo, falha de limpeza e escrita atrasada depois de `DELETE /me` ou recuperação. Os testes dessa rodada passaram no CI acima. D1/R2 não têm transação conjunta:
uma queda logo após recriar uma reserva vazia já cancelada ainda pode deixar um objeto de zero bytes, sem
documento/foto. A correção não promete ausência absoluta de objetos órfãos nem dispensa a recuperação operacional.
