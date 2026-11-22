# IMPL-0035: Malha gulosa, prédios refinados e detalhes no chão

**Status:** Aceita — implementada (pedido do responsável técnico em 2026-11-22: "modelos melhores, voxels melhores,
seguindo as boas práticas dos jogos de voxel; casas e ambiente mais detalhados").
**Data:** 2026-11-22
**Fontes:** [IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md) (mesher), [IMPL-0010](0010-seeded-procedural-voxel-content.md)
(conteúdo gerado), [IMPL-0024](0024-village-expansion-and-zoning.md) (orçamento de render), [IMPL-0033](0033-block-look.md)
(visual de blocos); código: `apps/client/src/scene/{mesher.ts,Voxels.tsx,groundDecor.ts,GroundDetail.tsx}`,
`apps/client/src/scene/gen/refine.ts`, `apps/client/src/scene/environment/materials.ts`.

## Contexto

As casas eram feitas de blocos de 1 u, sem moldura de janela, sem telha, com a neve em cubos inteiros. O chão era
tinta chapada. Mais detalhe custa triângulos, e o orçamento é de 150 chamadas e 250 000 triângulos por quadro. O
mesher emitia um quadrado por face de voxel.

## Decisão

1. **Malha gulosa.** Faces coplanares do mesmo grupo, da mesma cor e com a mesma oclusão de ambiente viram um
   retângulo, a prática dos jogos de voxel. Grupos animados (folhagem que balança, luzes que piscam, seres vivos)
   continuam com um quadrado por voxel, porque cada voxel se move sozinho.
2. **Visual de blocos no shader.** O tom por bloco e a aresta saem do atributo `aGrid` (posição em unidades de voxel
   e eixo da face), por pixel; um retângulo fundido continua parecendo blocos. A aresta só aparece em blocos de
   0,5 u ou mais (`EDGE_MIN_SIZE`): em blocos finos ela vira papel quadriculado.
3. **Prédios refinados.** Os geradores continuam desenhando a massa em blocos de 1 u (todas as regras de terreno,
   colisor e nível de ONG seguem nela). Antes de desenhar, `refineBuilding` divide cada bloco em 3 × 3 × 3 e
   detalha cada parte pelo que ela é: vidro recuado com verga e peitoril brancos, porta recuada com bandeira de vidro
   e maçaneta, telhas em fiadas, tijolos na fundação, neve como camada fina, pingentes de gelo, chapéu e boca da
   chaminé, guirlanda em anel. O interior oculto não é dividido (`HIDDEN` só ocupa espaço). Três e não dois: as células
   ficam centradas na grade grossa, sem deslocamento, e a pegada no mundo não muda. Prédios refinados não usam oclusão
   de ambiente: nessa escala ela parte cada superfície em faces soltas (quatro vezes os triângulos) por um sombreado
   que as sombras em tempo real já dão.
4. **Detalhes no chão.** Tufos de grama, flores, pedrinhas e montinhos de neve, escolhidos por célula com um hash
   inteiro (o mesmo chão para todos), só em chão sem pavimento (`YARD_KINDS`), no máximo 0,6 u de altura: não
   bloqueiam o avatar, não precisam de colisor e não escondem rua. Uma malha por pedaço do chão, sem sombra.

## Medições (Chrome local, `villageDemo=full`, preset médio; `apps/client/scripts/verify-budget.mjs`)

| Vista | Antes | Malha gulosa | Com prédios refinados e chão |
|---|---|---|---|
| Praça, zoom padrão | 96 chamadas · 149 506 triângulos | 96 · 117 164 | 103 · 174 446 |
| Segunda rua, longe, casa em todo terreno | 102 · 161 874 | 102 · 125 340 | 111 · 202 906 |

O elenco da Vila caiu de 12 516 para 7 766 triângulos.

## Consequências

- Cada vértice carrega `aGrid` (16 bytes); `aFace` deixou de existir.
- Uma geometria montada fora de `voxelGeometries` (avatares remotos, elenco) recebe a luz por face, mas não o visual
  de blocos.
- Ficam para uma próxima fase: os enfeites das fileiras residenciais (pilares, sebes), postes e bancos, os pinheiros e
  os avatares.
