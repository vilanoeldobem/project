# IMPL-0027: O provador P08 — dez categorias, 100 itens, inventário e a compra paga fora do escopo

**Status:** Proposta — implementada, a validar. A metade gratuita (cartão **D20** do plano de desenvolvimento) está
implementada; a compra paga (cartão **D21**) **não** entra e continua bloqueada pelas decisões de pagamento
(PEN-022), sem preço, sem provedor e sem transação simulada.
**Data:** 2026-11-14
**Fontes:** pedido do responsável pelo produto em 2026-11-14 (dez categorias e um item por loja); P08
(`docs/specs/plano-de-wireframes.md` e `docs/specs/wireframes/P08_SKINS_GRATUITAS_PAGAS.png`, no repositório de
documentação); DEC-033 (itens gratuitos e pagos nas dez categorias; preço, compra e regras para menores pendentes);
especificação funcional, item 8; DEC-055 (piso de R$ 2,00 para cosmético pago, sem preço definido aqui);
IMPL-0002 (sem pagamento simulado); IMPL-0010 (camadas cosméticas e orçamento); IMPL-0026 (pranchas e aparência
local); OQ-20 (o que os lojistas dizem); código:
`packages/shared/src/game/cosmetics.ts`, `packages/shared/src/net/protocol.ts`,
`apps/client/src/scene/{models,gen/cosmetics}.ts`, `apps/client/src/ui/{Wardrobe,AvatarPanel,Village}.tsx`,
`apps/client/src/game/{store,wardrobe}.ts`, `apps/client/scripts/verify-shop.mjs`.

## Contexto

A P08 confirma **dez categorias** de aparência — capacete, blusa, calça, vestido, sapato, costas, rosto, mão
esquerda, mão direita e especial — com cartões **Grátis** e **Pago**, um provador, um inventário e ações distintas
**Equipar** e **Ver compra**. O repositório tinha um catálogo de quatro slots (`hat`, `scarf`, `sweater`, `palette`)
liberado por missão e nível, sem inventário, e as quatro lojas só diziam o nome, o tema e que estavam fechadas.

O plano de desenvolvimento separa duas entregas: **D20** (provador e itens gratuitos nas dez categorias, agora) e
**D21** (compra paga real, bloqueada por provedor, preço, reembolso e regras para menores — PEN-022). A IMPL-0002
proíbe uma compra simulada. A DEC-055 fixa apenas um piso de R$ 2,00 para o cosmético pago; nenhum preço concreto
foi definido.

## Decisão

### 1. Um catálogo de dez slots

`packages/shared/src/game/cosmetics.ts` passa a ter `Slot` = `helmet`, `blouse`, `pants`, `dress`, `shoes`, `back`,
`face`, `handLeft`, `handRight`, `special`, na ordem da prancha. Cada slot tem **dez entradas**: o padrão primeiro,
sete itens gratuitos por missão ou nível e dois cartões pagos. São **100 entradas** (80 gratuitas, 20 pagas), com
**94 modelos** e seis estados "sem item" (vestido, costas, rosto, mão esquerda, mão direita, especial). O padrão de
cada slot é o primeiro item, o que também é o índice `0` do protocolo.

Regras:
- `isUnlockedIn` (`cosmetics-v2.ts`) é sempre falso para `{ kind: "paid" }`; `unlockedIdsIn` portanto só contém o que pode ser equipado.
- `wear(look, id)` é a única regra de sobreposição: um vestido repõe blusa e calça nos padrões; vestir blusa ou calça
  tira o vestido. As demais categorias são independentes.
- `sanitizeLookIn` confere id, slot, posse e a regra acima; qualquer outro valor cai no padrão do slot.
- Os itens gratuitos liberam por missão (`explore-gifts`, `play-memory`, `causes-visit-lot`) ou nível 2; nenhum se
  liga à missão de doação. Ao concluir uma missão, o aviso resume a leva ("… e mais N") em vez de listar 20 nomes.
- O visual continua local ao navegador (`vila.look.v2`). A migração lê uma vez o `vila.look.v1`, leva `hat` para
  `helmet` e `sweater` para `blouse`, descarta `scarf`/`palette` (não existem nas dez categorias) e apaga a chave
  antiga. Um id pago no armazenamento cai no padrão.

### 2. O look na presença vai em código compacto

Dez ids longos não cabem nos 96 bytes da mensagem. A mensagem `["k", code]` leva **um caractere base36 por slot**,
na ordem de `SLOTS`, com o índice dentro do slot (0 = padrão): `["k","0000000000"]` é o visual padrão. O cliente e o
servidor usam o mesmo formato; a ordem do catálogo dentro do slot é contrato de fio. A presença continua efêmera e
sem posse: o servidor só valida que o índice existe naquele slot, como antes.

### 3. Os modelos das dez categorias

`apps/client/src/scene/gen/cosmetics.ts` ganha os modelos explícitos: capacete (as camadas de chapéu que já existiam
e cinco formas novas), blusa (pintura do torso e das mangas), calça e sapato (pintura das pernas), vestido (torso,
saia e mangas), costas, rosto, mãos e especial (camadas com âncora). `avatarParts` compõe, nesta ordem: cabeça e
aparência, blusa, calça, sapato, vestido, capacete, costas, rosto, especial e mãos; cada parte continua sendo um
`Voxel[]` e o avatar continua em cinco desenhos (corpo e quatro membros), então `Player`, `RemotePlayers`, o retrato
SVG e o contorno translúcido não mudam de forma. Cada item respeita o orçamento de 40 voxels / 140 faces por camada.

### 4. O provador, o inventário e as lojas

`ui/Wardrobe.tsx` é o mesmo componente na aba "Visuais" da aparência (as dez categorias) e no painel de cada loja
(só as categorias daquela loja, por `game/wardrobe.ts`):

| Loja | Categorias |
|---|---|
| Ateliê de Enfeites (`shop-01`) | capacete, costas, rosto |
| Oficina de Brinquedos (`shop-02`) | mão esquerda, mão direita |
| Alfaiataria de Inverno (`shop-03`) | blusa, calça, vestido, sapato |
| Empório da Lareira (`shop-04`) | especial |

O provador tem o retrato grande no centro, as categorias em filtros (horizontais no celular), dez cartões por
categoria, prévia no retrato, o inventário ("No inventário: X de 80 visuais gratuitos"), o filtro "Só o que eu
tenho", o estado "Em uso", o requisito exato dos itens fechados e "Equipar". No celular a prévia fica fixa e o
inventário rola com o corpo. **A loja continua fechada** e o painel diz isso; o provador é grátis. Os textos das
personagens ("A loja está fechada.", "Nada é vendido na Vila.") e a OQ-20 não mudam.

O cartão pago mostra o selo "Pago" e o botão "Ver compra"; o clique revela **"A compra de visuais não está
disponível."** e não altera o visual. Não há preço, moeda, desconto, contagem regressiva ou pagamento. A nota
"Visuais pagos são compras de aparência. Doações são separadas." separa a loja da doação.

### 5. O que a entrega não faz

Compra paga real, preço concreto, provedor, reembolso, posse no servidor, regras para menores (D21/PEN-022), chat,
emoji e qualquer efeito de jogo. A metade gratuita é equipável e o inventário é derivado do progresso já existente;
não há tabela nova, bandeira nova nem migração de D1.

### Ajuste de 14/11/2026: prévias pagas ocultas

Na revisão do PR #48, o responsável decidiu **ocultar as prévias pagas** até a PEN-022 (o que mostrar sobre visuais
pagos a um público que provavelmente inclui menores) ser respondida: a loja diz "Nada é vendido na Vila." e o
AGENTS.md não admite oferta nem botão de compra numa loja. O catálogo mantém as 20 entradas pagas, mas o provador
mostra só os 80 itens gratuitos (8 por categoria), sem selo "Pago", sem "Ver compra" e sem a nota sobre compras
(`SHOW_PAID_PREVIEWS = false` em `ui/Wardrobe.tsx`). A presença também recusa um visual com item pago
(`parseLook`), então nenhum visitante vê um item pago, mesmo vindo de um cliente modificado.

## Consequências

- As quatro lojas deixam de ser apenas um texto e passam a abrir o provador; o painel ganhou controles (antes só
  tinha "Fechar").
- O visual de quem já jogava migra uma vez; quem usava cachecol ou paleta perde essas duas escolhas (as dez
  categorias da P08 não as têm).
- A presença usa um código de dez caracteres; cliente e servidor precisam ser publicados juntos (o look é efêmero,
  nada é gravado).
- O orçamento de desenho não muda de forma: dez itens são pintados no mesmo avatar de cinco desenhos; o custo por
  quadro é medido pelo `verify.mjs` (o padrão acrescenta poucos voxels).
- A compra paga continua sendo D21, com o piso da DEC-055 e as pendências da PEN-022.

## Alternativas

- **Todos os 100 itens pagos**: a leitura do responsável ("quase certeza que são todos pagos") não corresponde à
  DEC-033 nem à P08, que confirmam itens gratuitos e pagos, e deixaria o teste de vestir impossível sem o D21.
  Rejeitada; a divisão 80/20 fica explícita para ser ajustada pelo dono do produto.
- **Moeda da Vila ganha jogando**: não existe moeda no jogo (DEC-042/IMPL-0024) e a P08 não pede uma; seria uma
  mecânica nova, não uma correção do provador. Rejeitada.
- **Compra simulada atrás de bandeira**: violaria a IMPL-0002 e o plano ("não marcar como concluído… uma compra
  simulada de skin"). Rejeitada.
- **Manter cachecol e paleta como slots extras**: a prancha fixa dez categorias; um décimo primeiro slot seria uma
  decisão de produto nova. A migração descarta os dois e a perda fica registrada.

## Verificação

`pnpm typecheck`, `pnpm test`, `pnpm build`; `node apps/client/scripts/verify-shop.mjs http://localhost:8799` abre as
quatro lojas em 1440×900 e 390×844, confere 10 itens por categoria (8 grátis e 2 pagos), o inventário de 30 de 80,
prévia sem equipar, equipar com persistência em `vila.look.v2`, a troca de capacete, a regra vestido ↔ blusa/calça,
o cartão pago sem preço, o item fechado com requisito e sem equipar, o alvo de 44 px e a ausência de rolagem
horizontal da página. `verify.mjs` cobre o painel da loja e o orçamento de desenho; `verify-boards.mjs` captura a P08
nas duas larguras. O ensaio de cada **uma** das quatro lojas está no script.
