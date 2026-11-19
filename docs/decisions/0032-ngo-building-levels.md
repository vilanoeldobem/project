# IMPL-0032: Casa da ONG em cinco níveis, conforme as doações confirmadas

**Status:** Proposta — implementada, **desligada em produção e homologação** (`NGO_LEVELS_ENABLED = "false"`; depende
também de `DONATIONS_ENABLED`, que segue desligada). Pedido do responsável técnico em 2026-11-19. **Nenhuma decisão
de produto cobre níveis de ONG**: a DEC-041 liga a evolução pelo valor doado aos Títulos de **quem doa**, não à casa
da organização. A política fica com o dono do produto (OQ-23).
**Data:** 2026-11-19
**Fontes:** pedido do responsável técnico em 2026-11-19 ("criar layouts diferentes de casinhas das ONGs para ela
evoluir o nível da construção de acordo com as doações recebidas") e a escolha dele na sessão de planejamento ("por
valor, com bandeira desligada"); DEC-027 e PEN-018 (indicadores públicos precisam de definição, fonte e
comprovação), DEC-028 (a casa da ONG), DEC-041 e DEC-042 (Títulos e progressão), DEC-054 (a ONG pode usar página de
pagamento própria); [IMPL-0023](0023-donations-abacatepay.md) (doações, soma de `donations`),
[IMPL-0031](0031-village-rings-zoning-civic-buildings-and-boards.md) (os 97 terrenos, chalés assados em blocos);
código: `packages/shared/src/game/ngo-level.ts`, `apps/api/src/api.ts` (`lots`, `ngoLevelsEnabled`),
`apps/client/src/scene/gen/ngoBuilding.ts`, `apps/client/src/scene/{Props.tsx,sceneColliders.ts}`.

## Contexto

Toda ONG publicada recebia o mesmo tipo de chalé, sorteado pela semente do terreno. O pedido é que a construção
"evolua" com as doações recebidas.

O que existe para apoiar isso:

- A soma das doações confirmadas por ONG já é pública com as doações ligadas: `GET /ngos/:id/donation-info` responde
  `confirmedAmountCents` (soma de `donations.amount_cents` com `status = 'paid'`).
- As doações estão **desligadas em produção** (`DONATIONS_ENABLED = "false"`; PEN-004, PEN-006, PEN-026).

O que os documentos de produto dizem que pede cuidado:

- "Cuidado especial com menores, rankings, competições e incentivos" e "Não gamificar pressão financeira"
  (experiência virtual e dossiê da fase 1, ambos PROPOSTA).
- A base dos indicadores por ONG não está definida (PEN-018: valor bruto ou líquido, estornos, links externos).
- Uma ONG que recebe doações pela própria página (DEC-054) não tem pagamento verificável: só uma comprovação
  lançada por administrador conta.

## Decisão

1. **Cinco níveis, do total confirmado.** `ngoLevel(centavos)` em `packages/shared/src/game/ngo-level.ts`. Os
   limites são **marcadores do responsável técnico**, não decisão de produto:

   | Nível | A partir de | Construção |
   |---:|---:|---|
   | 1 | R$ 0 | cabana de 5 × 5, um andar |
   | 2 | R$ 500 | chalé de 7 × 5, um andar, com varanda |
   | 3 | R$ 2.500 | casa de 7 × 7, dois andares |
   | 4 | R$ 10.000 | a mesma, com torre de pedra e um fio de luzes sob o beiral da frente |
   | 5 | R$ 50.000 | três andares, torre mais alta com estrela dourada e luzes em três lados |

2. **A base é a soma que já existe:** `SUM(amount_cents)` das doações `paid` daquela ONG, a mesma de
   `donation-info`. Não há contador paralelo (como na IMPL-0023): repetir um webhook não muda o nível, e um estorno
   ou uma disputa perdida **baixa** o nível.
3. **`GET /lots` ganha `ngo_level`** (1 a 5, ou `null`). **O valor nunca sai por essa rota**, só o nível. É `null`
   com qualquer uma das duas bandeiras desligada, em terreno sem ONG publicada e em banco sem a tabela `donations`
   (a rota pública continua respondendo em todo schema, de v3 a v15, sem ler tabela de migration posterior com a
   bandeira desligada; a matriz de bandeiras ganhou um bit).
4. **Bandeira própria, `NGO_LEVELS_ENABLED`,** desligada em produção e homologação, ligada só no script local.
   `GET /config` responde `ngoLevels` (verdadeiro só com as duas bandeiras).
5. **O jogo desenha `null` como nível 1.** Com a função desligada, toda casa publicada é a cabana do nível 1. Isso
   muda o que se vê hoje numa casa publicada: antes era um chalé de tamanho sorteado (5 a 7 voxels de lado, um ou
   dois andares).
6. **A ONG mantém as suas cores de um nível para o outro.** Os cinco níveis usam a semente do próprio terreno: cor
   de parede, de telhado e de porta, forma do telhado e lado da chaminé são os mesmos; mudam o tamanho, os andares
   e os acréscimos. Nenhum nível tem texto, logo ou marca.
7. **Todos os níveis cabem no terreno** (`HOUSE_ENVELOPE`: paredes até ±3,5 u e varanda até 4,5 u à frente do
   centro). O colisor de cada casa é o do seu nível; a auditoria de colisores confere os cinco em todos os terrenos.
8. **Nada além do prédio mostra o nível.** O painel da casa não diz "nível 3", não há lista nem comparação entre
   ONGs, o nível não libera nada e não dá XP (DEC-042).

## Alternativas consideradas

- **Nível pelo número de doações confirmadas**, em vez do valor: menos parecido com um ranking de dinheiro.
  Oferecida ao responsável e não escolhida.
- **Só os cinco modelos, sem ligar a dado nenhum:** oferecida e não escolhida.
- **Calcular o nível no jogo a partir de `donation-info`:** uma requisição por ONG (até 97) e o valor trafegando
  para todo visitante. Rejeitada: o servidor entrega só o nível.
- **Sem bandeira própria** (ligar junto com as doações): a decisão "a casa cresce com dinheiro" é outra decisão de
  produto, com riscos próprios. Rejeitada.
- **Nível que nunca desce:** exigiria guardar o maior total já visto, um número novo sem fonte auditável.
  Rejeitada; fica como pergunta (OQ-23).

## Consequências

- **Hoje, em produção, nada muda no dado:** as duas bandeiras estão desligadas e `ngo_level` é sempre `null`. O que
  muda é o desenho: uma casa publicada passa a ser a cabana do nível 1. Em produção as contas seguem desligadas,
  então nenhuma ONG pode ter sido publicada pelo fluxo de candidatura; o banco de produção não foi consultado
  nesta mudança.
- **Comparação pública entre ONGs.** Com a função ligada, quem anda pela Vila vê quais organizações arrecadaram
  mais. Isso é uma forma de ranking por dinheiro, diante de um público que provavelmente inclui crianças e
  adolescentes. É a principal pergunta da OQ-23.
- **Desigualdade entre formas de pagamento.** A ONG que usa página própria só sobe de nível quando um administrador
  lança uma comprovação; a que usa o Pix da Vila sobe sozinha.
- **Valor bruto.** A soma usa `amount_cents` (o que o doador pagou), não a parcela da ONG; e inclui comprovações
  externas lançadas por administrador. A base dos indicadores segue pendente (PEN-018, PEN-026).
- **Orçamento de desenho** (150 chamadas, 250 000 triângulos), medido pelo `verify.mjs` com uma casa em cada um
  dos 97 terrenos e os cinco níveis alternados (`?villageDemo=full`): 133 chamadas e 186 390 triângulos na praça
  com o zoom todo para fora às 06h20; 131 e 207 262 na segunda rua. As luzes dos níveis 4 e 5 são um papel de
  material a mais: com um bloco de janelas e um de luzes por bloco de chalés a segunda rua chegou a **148
  chamadas**. As janelas e as luzes de todos os chalés passaram a ser duas malhas para a Vila inteira
  (`joinLitRoles`, como nas fileiras de casas), o que também baixou os números da IMPL-0031 (eram 139 e 217 480).
- **Para ligar:** resposta à OQ-23, doações ligadas (PEN-004, PEN-006) e as duas bandeiras; nenhuma migration.
