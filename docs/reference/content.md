# Conteúdo procedural (voxels gerados por semente)

> **Status:** Fases 0–1 implementadas (núcleo, galeria, adereços) · **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/client/src/scene/gen/`, testes em `gen.test.ts`
> ([IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md))

## 1. Regras

- **Determinístico.** Cada gerador é uma função pura `(semente) → modelo`. Mesma semente, mesmo modelo, em qualquer
  aparelho e no servidor. Sem `Math.random` (um teste varre o código), sem relógio.
- **Por partes.** Receita de peças reutilizáveis (`parts.ts`: caixa, paredes, disco, neve no topo, rotação) e
  escolhas de paleta (`palette.ts`). Cores só da `PALETTE` ou de variações nomeadas dela (`shade`), nunca hex solto.
- **Mesmo renderizador.** Saída é `Voxel[]` inteiro, base em y = 0, pronta para `<Voxels>` (malha com AO, IMPL-0007).
  Papéis de material por cor: `emissive` (lâmpadas), `glow` (janelas), `sway` (folhagem).
- **Orçamento por categoria**, verificado em teste para 12 sementes de cada gerador.
- **Sem texto, logotipo ou marca** em nenhum modelo (placas são tábuas lisas). Nenhuma ONG, doador ou parceiro
  inventado.

## 2. Orçamentos

| Categoria | Voxels máx. | Faces máx. (após remoção) |
|---|---:|---:|
| Adereços (`props`) | 220 | 600 |
| Casas (`houses`) | 900 | 1.800 |
| Personagens (`characters`) | 160 | 420 |
| Animais (`animals`) | 140 | 380 |
| Cosméticos (`cosmetics`, por camada) | 40 | 140 |

## 3. Geradores

| Id | Nome | Categoria | Variação (por semente) | Máx. voxels / faces (8 sementes da galeria) |
|---|---|---|---|---|
| `gift` | Presente | props | papel (6 pares), padrão (listras, bolinhas, xadrez, liso), fita, laço, tamanho | 130 / 166 |
| `lantern` | Lanterna | props | moldura, altura do poste, largura, telhado, ponteira | 85 / 216 |
| `fence` | Cerca | props | tinta, comprimento, altura, estilo (trilhos, ripas, cruzada) | 49 / 166 |
| `sled` | Trenó | props | patins, assento, comprimento, encosto, carga | 80 / 250 |
| `mailbox` | Caixa de correio | props | cor, poste, altura, bandeira | 64 / 146 |
| `signpost` | Placa | props | 1–3 tábuas, direção, cores (sem texto) | 25 / 102 |
| `garland` | Guirlanda | props | comprimento, curvatura, lâmpadas, laços | 44 / 154 |
| `market-stall` | Barraca | props | toldo listrado, madeira, largura, mercadorias | 111 / 318 |
| `panettone-stand` | Barraca de panetone | props | toldo, madeira, largura (toque brasileiro) | 110 / 322 |

Na Vila: os presentes escondidos usam `gift` com a semente = id do presente (`gift-palm`, `gift-bench`,
`gift-street`). Os demais adereços ainda não têm lugar no mapa (layout é PEN-017/PEN-023).

## 4. Testes (contrato de todo gerador)

Determinismo por semente · orçamento · ≥ 6 variantes distintas em 12 sementes · coordenadas inteiras · base em
y = 0 · hash de saída para sementes fixas em snapshot (`__snapshots__/gen.test.ts.snap`): mudar a arte aparece
como diff a revisar (`vitest -u` depois de revisar na galeria).

## 5. Galeria (só desenvolvimento)

`?gallery` (localhost ou build de desenvolvimento) mostra cada categoria em 8 sementes girando, com voxels/faces
máximos contra o orçamento e custo de renderização. `?gallery&cat=props` abre uma categoria.
`node apps/client/scripts/gallery.mjs http://localhost:8799 [categoria…]` fotografa; `verify.mjs` também.

## Ver também

[IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md) · [IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md) ·
[architecture.md](architecture.md)
