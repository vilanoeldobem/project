# IMPL-0033: Visual de blocos — luz por face, tom por bloco e aresta de cada bloco

**Status:** Aceita — implementada (pedido do responsável técnico em 2026-11-22).
**Data:** 2026-11-22
**Fontes:** pedido do responsável técnico em 2026-11-22 ("voxels maiores, seguindo uma lógica de blocos, mais bonita")
e a escolha dele na sessão ("passada de estilo e grade maior onde continuar legível");
[IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md) (mesher com oclusão de ambiente),
[IMPL-0010](0010-seeded-procedural-voxel-content.md) (conteúdo gerado), [IMPL-0030](0030-thawed-village-and-readable-streets.md)
(paleta do chão); código: `apps/client/src/scene/mesher.ts`, `apps/client/src/scene/Voxels.tsx`,
`apps/client/src/scene/environment/materials.ts`.

## Contexto

Cada voxel tinha uma cor chapada. Blocos vizinhos da mesma cor se fundiam numa superfície lisa: a árvore da praça e
os pinheiros viravam massas verdes, e o mundo não parecia feito de blocos.

O tamanho do bloco já é grande onde importa: casas, lojas, prédios cívicos, pinheiros e a árvore usam blocos de 1 u;
o avatar e os moradores, 0,3 u. Os modelos com blocos pequenos (0,12 a 0,25 u) são objetos pequenos de verdade
(itens de missão, animais, lampiões, cercas): engrossar a grade deles apaga o próprio objeto e muda colisores e
orçamentos. Por isso a grade **não** mudou nesta fase.

## Decisão

Três efeitos, todos no mesher e nos materiais compartilhados, sem triângulo nem chamada de desenho a mais:

1. **Luz por face** (`FACE_LIGHT`): topo 1, laterais 0,93 e 0,87, base 0,78, gravada na cor do vértice. O topo de
   um bloco fica mais claro que os lados mesmo sob luz chapada.
2. **Tom por bloco** (`blockShade`): ±4,5 % (`BLOCK_JITTER`) a partir de um hash inteiro da célula. O mesmo bloco tem
   o mesmo tom em todo cliente; nada lê `Math.random`.
3. **Aresta de cada bloco** (`BLOCK_EDGE` em `materials.ts`): uma linha fina e mais escura em volta de cada face,
   desenhada no shader a partir do atributo `aFace` (canto da face, 1 ou 2 em cada eixo). A linha tem cerca de um
   pixel de perto e some onde o bloco tem poucos pixels, para não cintilar ao longe. Uma geometria sem `aFace` (lida
   como 0) não desenha linha.

Lâmpadas e outros papéis emissivos (`noAo`) mantêm a cor. O chão (`Ground.tsx`) não passa pelo mesher e não muda:
o contraste de 3:1 entre rua e quintal (IMPL-0030) segue valendo.

## Consequências

- Cada face carrega mais 32 bytes (`aFace`, 2 floats por vértice). Triângulos e chamadas de desenho não mudam, então
  o orçamento de render (150 chamadas, 250 000 triângulos) também não.
- Avatares remotos e o elenco da Vila são montados fora de `voxelGeometries` e ganham a luz por face e o tom por
  bloco, mas não a aresta. Se a diferença incomodar, basta copiar `aFace` nessas geometrias.
- Engrossar a grade de algum modelo fica para uma decisão por modelo, com colisor, orçamento e snapshot revistos
  juntos.
