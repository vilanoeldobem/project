# IMPL-0013: Runtime das quests `quests-v1`: duas bandeiras, máquina de estados e gravação só de transições válidas

**Status:** Proposta — implementada e testada; **desligada em produção** (`QUESTS_V1_ENABLED = "false"` na API e build
do jogo sem `VITE_QUESTS_V1_ENABLED`). O catálogo, os XP, os moradores e as regras de jogo das quests são **PROPOSTA**
(PEN-025) e **não foram aprovados pelo dono do produto**; este ADR registra só as escolhas técnicas do runtime
**Data:** 2026-11-11
**Fontes:** revisão do PR #19 (`feat/quests-v1`, commit `ca587f7`) e autorização do responsável do repositório para
corrigir os achados dessa revisão; `vilanoeldobem/docs`: DEC-026, DEC-039 a DEC-042, PEN-017, PEN-023, PEN-025;
conteúdo em `content/proposals/quests-v1/`; código: `packages/shared/src/game/{quests,progress,world}.ts`,
`apps/api/src/progress.ts`, `apps/client/src/game/questsFlag.ts`, `apps/client/src/lib/account.ts`,
`apps/client/src/scene/{World,Player,Props}.tsx`

## Contexto

O PR #19 leva ao jogo as 15 missões narrativas da proposta `quests-v1` (cinco cadeias de três missões, cinco moradores
fictícios, um atril de doação global). Nada disso é decisão de produto: o conteúdo segue pendente em PEN-025 e o
layout em PEN-017/PEN-023. A regra do repositório é não entregar proposta como se fosse aprovada, então o runtime
precisa ficar atrás de bandeira e, desligado, não pode mudar nada para quem joga.

A revisão do PR encontrou quatro problemas que são de arquitetura, não de detalhe:

1. Com as bandeiras desligadas, os obstáculos dos cinco moradores continuavam no mapa (invisíveis) e o atril de
   doação aparecia sempre.
2. As quests são uma máquina de estados que **depende da ordem** dos eventos (uma missão ativa por vez; `accept`,
   depois os objetivos, depois `turn-in`), mas a API gravava todo evento conhecido com `INSERT OR IGNORE` e refazia o
   progresso na ordem de gravação. Um evento gravado quando ainda não valia ficava gravado para sempre e o mesmo id
   nunca mais podia ser aplicado: a missão travava.
3. Com a bandeira da API desligada, um único evento de quest fazia o lote inteiro falhar (`400 bad_events`), junto
   com os eventos das quatro missões rápidas.
4. O cliente não lia a bandeira da API, embora a documentação dissesse que lia.

## Decisão

1. **Duas bandeiras, e as duas precisam estar ligadas.** O cliente só liga as quests quando a bandeira dele
   (`VITE_QUESTS_V1_ENABLED=true` no build, ou `?quests=1` em localhost/build de desenvolvimento) **e** o campo
   `quests` de `GET /config` (`QUESTS_V1_ENABLED = "true"` na API) são verdadeiros. Enquanto `/config` não responde,
   ou sem API, as quests ficam desligadas.
2. **Desligado é igual ao `main`.** Moradores, itens, atril de doação, rótulos, obstáculos (`QUEST_OBSTACLES`, fora de
   `OBSTACLES`), alvos do botão de ação e o Caderno de cadeias só existem com as quests ligadas. Com as quests
   desligadas o cliente não enfileira nem envia eventos de quest.
3. **A máquina de estados depende da ordem, e isso é assumido.** `applyEvent` garante: a mesma lista na mesma ordem dá
   o mesmo progresso; repetir um evento não muda nada; nenhuma ordem concede mais XP do que o catálogo tem. Não
   garante que ordens diferentes deem o mesmo resultado: um evento que não é transição válida na posição em que
   aparece é ignorado.
4. **O servidor grava só transições válidas.** Em `POST /progress/events` a API refaz o progresso gravado, aplica o
   lote na ordem recebida e grava um evento de quest apenas quando ele muda o estado. Evento ainda inválido recebe
   `200`, não é gravado e pode ser reenviado depois. Uma transição válida vai para o fim do log
   (`INSERT OR REPLACE`), o que também move uma linha gravada antes da hora. As quatro missões rápidas não dependem
   de ordem e continuam como antes (`INSERT OR IGNORE` de todo evento conhecido, mesma resposta).
5. **Bandeira da API desligada: eventos de quest ignorados, não recusados.** O resto do lote é gravado. Id de missão
   ou de evento que o jogo não produz continua dando `400 bad_events` para o lote inteiro, com ou sem bandeira.
6. **Modelo de confiança (risco aceito e documentado).** O servidor confere os ids e a ordem das transições, mas
   confia que a ação aconteceu: não prova que o item foi recolhido, que o morador foi visitado ou que o painel foi
   lido. Uma conta consegue forjar, chamando a API direto, no máximo o XP do catálogo: **575 XP** (465 das quests +
   110 das missões rápidas; antes das quests eram 110). O risco é aceito porque XP não dá nada que dinheiro compre e
   doação não dá XP (DEC-042).

## Alternativas consideradas

- **Gravar todo evento conhecido e resolver no replay** (o que o PR fazia): recusado, é a causa das missões travadas.
- **Recusar o lote (`400`/`409`) quando um evento não é transição válida:** recusado. O cliente envia lotes que
  misturam missões e quests (migração do progresso de visitante, fila de reenvio); um evento atrasado de uma aba
  antiga bloquearia a sincronização inteira.
- **Tornar a máquina independente de ordem** (várias missões ativas, ou reordenar os eventos no replay): recusado
  aqui porque muda a regra "uma missão ativa por vez", que é conteúdo PROPOSTA; não cabe a um ADR técnico.
- **Uma bandeira só** (só no cliente ou só na API): recusado. Com os lados em desacordo, ou o cliente mostrava quests
  que o servidor não grava, ou o servidor aceitava quests de um cliente que não deveria mostrá-las.
- **Provar a ação no servidor** (por exemplo, conferir a posição pelo servidor de presença): fora do escopo. A sala de
  presença guarda só estado efêmero em memória (IMPL-0008) e o XP não tem valor que justifique o custo.
- **Ler e gravar numa transação só:** o D1 oferece `batch` (transação sem leitura no meio), não transação interativa.
  Duas requisições simultâneas ainda podem gravar uma linha antes da hora; o `INSERT OR REPLACE` do item 4 faz essa
  linha voltar a valer quando o evento é reenviado.

## Consequências

- Nenhuma migration, tabela ou coluna nova: continua a tabela `progress_events` (schema D1 inalterado).
- Um evento de quest respondido com `200` e não gravado deixa a tela daquela aba adiantada em relação ao servidor até
  a página ser recarregada (o cliente adota o progresso do servidor ao entrar). O cliente não reconcilia durante a
  sessão; a missão não trava mais, mas o passo pode precisar ser refeito.
- Se as quests forem desligadas depois de ligadas, eventos de quest que estavam na fila de reenvio são descartados e o
  progresso de quest de visitante não é migrado para a conta enquanto a bandeira estiver desligada.
- Testes: `packages/shared/src/game/motion.test.ts` (obstáculos de quest fora de `OBSTACLES`),
  `apps/api/src/accounts.test.ts` (aba desatualizada, objetivo antes do `accept`, linha gravada antes da hora, bandeira
  desligada) e `apps/client/src/lib/account.test.ts` (as duas bandeiras; nada de quest na fila ou no envio).
- Para ligar em produção faltam: aprovação do catálogo e das regras pelo dono do produto (PEN-025), resposta à
  pergunta OQ-09 (abandonar uma missão), verificação em navegador e em aparelho real, e ligar **as duas** bandeiras
  (decisão do responsável; nenhuma delas é ligada por este ADR).

## Relacionados

[quests.md](../reference/quests.md) · [api.md](../reference/api.md) · [open-questions.md](open-questions.md) (OQ-09) ·
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) · [IMPL-0011](0011-accounts-magic-link-ngo-review.md) ·
DEC-026 · DEC-039 · DEC-040 · DEC-041 · DEC-042 · PEN-017 · PEN-023 · PEN-025
