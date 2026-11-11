# IMPL-0010: Conteúdo voxel procedural por semente (geradores por partes, orçamento por categoria)

**Status:** Proposta — fases 0–1 implementadas; fases 2–5 em andamento (plano aprovado pelo responsável técnico em
2026-11-10)
**Data:** 2026-11-10
**Fontes:** pedido do responsável técnico (2026-11-10) "seeded, procedural content system"; plano em
`tasks/todo.md` (Tarefa 8); código: `apps/client/src/scene/gen/`, `apps/client/src/gallery/`

## Contexto

Os modelos da Vila (árvore, pinheiro, chalé, boneco de neve, rena, avatar) são escritos à mão em `models.ts`. Para
ter variedade (casas, moradores, animais, adereços, cosméticos) sem desenhar cada peça e sem pesar no quadro, é
preciso um sistema que gere modelos coerentes com os existentes, igual para todos os visitantes, e com custo
controlado.

## Decisão

1. **Geradores puros por semente:** `(semente: string | number) → GenModel` (`voxels`, `size`, papéis por cor,
   âncoras nomeadas). PRNG `Rng` (FNV-1a da semente → Mulberry32 do pacote compartilhado). Proibido `Math.random`
   (teste varre o código-fonte dos geradores).
2. **Receitas de partes:** `parts.ts` (caixa, paredes, disco, rotação, neve no topo, aterramento, deduplicação) e
   `palette.ts` (só `PALETTE` + variações nomeadas via `shade`). Cada categoria em um arquivo; registro único em
   `catalog.ts`.
3. **Mesmo pipeline de renderização:** saída inteira, base em y = 0 → `meshVoxels` (faces escondidas removidas, AO)
   → `<Voxels>`; repetições usam `placements` (uma chamada por papel de material para todas as cópias).
4. **Orçamento por categoria** (voxels e faces após remoção) testado em 12 sementes por gerador; snapshot de hash
   para sementes fixas.
5. **Galeria só de desenvolvimento** (`?gallery`, carregada sob demanda, inacessível em host público), com contagens
   contra o orçamento e custo de renderização; `scripts/gallery.mjs` e `verify.mjs` fotografam.
6. **Regras de produto:** sem texto, logo ou marca em modelos; nenhuma ONG/parceiro inventado; casas de terreno de
   ONG usam o id do terreno como semente (fase 2); cosméticos só por missão/nível, catálogo e desbloqueio PROPOSTA,
   sem compra, sorteio ou recompensa por tempo online (fase 5).

## Alternativas consideradas

- **Modelos .vox desenhados à mão:** mais controle artístico, mas sem variedade por semente e com arquivos a baixar.
- **Ruído/gramáticas genéricas (WFC, L-systems):** variedade maior, coerência visual menor e custo difícil de
  limitar; receitas por partes cabem no estilo existente.
- **Gerar no servidor e enviar voxels:** desnecessário: com geradores determinísticos, a semente basta.

## Consequências

- Medido (verify.mjs, Média, "dia-neve"): presentes gerados trocam 3 modelos de 2 voxels por modelos de até 130
  voxels; a cena foi de 56 → 55 chamadas e 108,1 mil → 109,0 mil triângulos (+0,8%).
- Galeria de adereços (9 geradores × 8 sementes): 100 chamadas, ~27,6 mil triângulos (renderização por software).
- Mudar a arte de um gerador muda o snapshot: revisar na galeria e atualizar com `vitest -u`.

## Relacionados

[content.md](../reference/content.md) · [IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md) · DEC-042 · PEN-017
