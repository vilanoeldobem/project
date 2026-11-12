# Registro da retirada de ONG publicada

> **Status:** Implementado como PROPOSTA; desligado em produção e homologação · **Versão do software:** 0.4.0 ·
> **Schema D1:** v9 · **Atualizado em:** 2026-11-12
> **Fonte de verdade:** `apps/api/src/ngo-withdrawal.ts` e `apps/api/src/ngo-withdrawal.test.ts`,
> [PR #33](https://github.com/vilanoeldobem/project/pull/33) e sua revisão,
> [IMPL-0020](../decisions/0020-ngo-publication-withdrawal.md); contratos em [API](../reference/api.md) e
> [armazenamento](../reference/storage.md).

## Entrega

A retirada administrativa do PR #33 foi portada para o fluxo canônico de arquivos e galeria (bucket privado
`FILES`, `ngo_files`, `ngo_photos`, exclusão de conta com `users.files_deleting`). O módulo de documentos, os
bindings e o ambiente de teste do fluxo antigo não foram trazidos. A funcionalidade continua **desligada**
(`NGO_WITHDRAWAL_ENABLED = "false"` em produção e homologação) e é **PROPOSTA**: a política da retirada está na
[OQ-14](../decisions/open-questions.md).

## Respostas à revisão do PR #33

| Item da revisão | Encaminhamento | Evidência |
|---|---|---|
| 1. Rotas públicas dependiam de `ngo_withdrawals` | Nenhuma rota pública lê a tabela. Todas as projeções públicas exigem o terreno publicado, que a retirada libera; `/indicators` passou a contar ONGs publicadas em terreno publicado | `public-ngo.test.ts`: rotas públicas nos schemas v3 a v9, 32 combinações de bandeiras e bucket; `ngo-withdrawal.test.ts`: lots, indicador, perfil, logo, lista e bytes de fotos antes e depois da retirada |
| 2. Bloqueio permanente decidido pelo código | Comportamento mantido e **descrito como é**, sem apresentá-lo como decisão: ADR corrigido e efeitos listados na OQ-14. Sem coluna `withdrawn_at` nesta entrega (mudaria o índice da 0005, que é a pergunta aberta) | IMPL-0020 "O que o código faz hoje"; teste "blocks the owner's account and the CNPJ" |
| 3. Ordem de merge com o fluxo de arquivos | Porte feito sobre a base já conciliada; logo público e contagem conferidos no mesmo teste das demais projeções | idem item 1 |
| 4. Rótulos PROPOSTA e "CONFIRMADO" sem DEC | PROPOSTA no módulo, na migration, no comentário da bandeira, no changelog e nos documentos; a liberação do terreno consta como **registro pendente** (sem DEC) | `ngo-withdrawal.ts`, `0009_ngo_withdrawals.sql`, `api.ts`, `wrangler.jsonc` |
| 5. Motivo entregue ao responsável | O texto é nomeado como **mensagem para a organização** na validação da API, no contrato, na documentação e no painel | `reason_required`; `render.test.tsx` |
| 6. Retenção e remoção dos próprios dados | Depois da retirada o responsável remove os próprios arquivos e fotos; não envia nem troca. Exclusão da conta apaga também o logo da ONG retirada. Prazos continuam pendentes (OQ-12, OQ-14, OQ-15) | testes "files, gallery and account deletion after a withdrawal" |
| 7. Telas | Jogo: situação "Retirada da Vila" e mensagem da administração, sem "aguardando aprovação". Painel: situação, mensagem, rótulo de auditoria e a ação "Retirar da Vila" | `apps/client/src/ui/NgoApplication.test.tsx`, `apps/dash/src/ui/render.test.tsx`, `apps/dash/src/lib/dash.test.ts` |
| 8. Tabela da OQ-14 | Linha dentro da tabela, com os efeitos detalhados abaixo dela | `open-questions.md` |
| 9. Convenções | Sem nomes de ferramentas externas; sem plano em `docs/implementation/`; ambiente de teste fora de `apps/api/wrangler.jsonc`; scripts de conferência com o Chrome do sistema, listados em `AGENTS.md` | `scripts/verify-media-local.mjs --withdrawal`, `apps/dash/scripts/verify-withdrawal.mjs` |

Além da revisão: as rotas de candidatura e análise respondem `503 schema_outdated` num banco sem a migration
0009 (uma decisão é recusada antes de gravar), e a retirada é recusada enquanto a exclusão da conta do
responsável estiver pendente, para que o conjunto de arquivos em descarte não mude no meio.

## O que não foi portado do PR original

- O teste "associação de terreno reintroduzida": no desenho original o registro era consultado em toda leitura
  pública; agora uma associação manual de terreno publicado a uma ONG retirada voltaria a mostrá-la. Não há
  caminho na API que faça isso (documentado no ADR).
- O plano de implementação e as anotações de tarefa do PR original; este registro os substitui.
- O ambiente `withdrawal-local` em `apps/api/wrangler.jsonc`: a prova local reaproveita
  `wrangler.reconciliation-local.jsonc`, com a bandeira ligada só no Worker da prova.

## Evidências (2026-11-12, local)

- `pnpm typecheck`, `pnpm test` e `pnpm build` passaram: **708 testes** (shared 147, API 273, jogo 189, painel
  67, servidor 23, site 9).
- Controles negativos: com o indicador contando só por estado, falham o teste das projeções públicas e o do
  indicador; com o indicador consultando `ngo_withdrawals`, falha a matriz de schemas v3 a v8; sem a regra do
  terreno no descarte e sem a guarda de exclusão pendente, falham os testes de exclusão de conta e de corrida.
  Os arquivos foram restaurados depois de cada controle.
- `node scripts/verify-media-local.mjs --progress --withdrawal`: workerd, D1 e R2 locais, dados sintéticos;
  arquivos, galeria, progresso e retirada passaram.
- `node apps/dash/scripts/verify-withdrawal.mjs`: retirada feita pelo painel em Chrome real, em tamanho de
  desktop e de celular, contra a API local; passou.

## Não verificado

- Nada contra D1 ou R2 remotos; nenhuma migration remota, deploy ou bandeira ligada.
- A tela do jogo para a candidatura retirada foi conferida por renderização no servidor, não em navegador.
- O CI ainda não rodou com o passo `--withdrawal`.

## Antes de ligar

Respostas do dono do produto à OQ-14 (e OQ-09 para missões); DEC para a liberação do terreno; migration 0009
aplicada antes da API nos ambientes com contas ligadas ([deploy](../guides/deploy.md#3-aplicar-migrations-remotas));
conferência em homologação com dados sintéticos.
