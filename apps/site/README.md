# apps/site — Vila Noel do Bem (site público)

Página institucional em `www.vilanoeldobem.com.br` (o domínio raiz redireciona para `www`). Os botões
"Entrar na Vila" levam ao jogo em `play.vilanoeldobem.com.br` (`apps/client`). Guia:
[`docs/guides/deploy.md`](../../docs/guides/deploy.md).

```bash
pnpm --filter @vila/site dev          # http://localhost:5173
pnpm --filter @vila/site build
pnpm --filter @vila/site run deploy   # build + wrangler deploy (custom domains www + raiz)
pnpm --filter @vila/site preview      # outra aba, para a verificação
node apps/site/scripts/verify.mjs http://localhost:4173
```

## Identidade e superfície

- **"Vila Voxel Nevada"**: tokens semânticos em `oklch()` (`src/styles.css`) derivados da paleta de
  `packages/shared/src/game/world.ts`, com dois temas — **Dia Nevado** (creme e neve) e **Noite Natalina**
  (pinho profundo). O tema segue o sistema e pode ser trocado no cabeçalho (salvo em `vila.site.theme.v1`).
- **Voxel sem motor 3D**: o site não carrega Three.js (IMPL-0005). O relevo vem de SVGs com
  `shape-rendering="crispEdges"` (`src/VoxelArt.tsx`) e da neve em canvas 2D (`src/VoxelSnow.tsx`), que
  respeita `prefers-reduced-motion` (neve parada) e pode ser desligada em `vila.site.snow.v1`.
- **Provas reais**: as três cenas do "diorama" são capturas do jogo (praça ao entardecer, neve forte à noite,
  avatar com gorro e cachecol). Nenhum número, ONG ou parceira é inventado (DEC-027).
- **Relógio da Vila**: a pílula "Hora na Vila (SP)" usa `Intl` com `America/Sao_Paulo`, a mesma convenção de
  fases do jogo (IMPL-0006).
- **Texto aprovado**: DEC-021 (propósito e promessa), DEC-010..013 / DEC-026 / DEC-029 (doações), DEC-015
  (critérios de ONG), DEC-043 (prazo). Sem slogan (PEN-015); o emblema em voxel é estudo visual
  (DEC-024, ainda sem logo definitiva).

## Verificação

`scripts/verify.mjs` abre o Chrome real e confere **as duas rotas** (`/` e `/404.html`) em 320, 375, 414, 768,
1024, 1280, 1440 e 1920 px, nos temas claro e escuro: nenhum erro de console ou requisição, nenhum overflow
horizontal, todo "Entrar na Vila" em `play.*`, toda imagem carregada com dimensões, alvos de toque ≥ 44 px e
foco visível. Também testa abas do diorama (ponteiro e teclado), troca de tema persistida, botão de neve,
movimento reduzido, cores forçadas, contraste alto, zoom de texto a 200 %, conteúdo absurdo (CJK/RTL/emoji)
e impressão. `src/site.test.ts` cobre o contrato do host do jogo e o gerador determinístico de flocos.
