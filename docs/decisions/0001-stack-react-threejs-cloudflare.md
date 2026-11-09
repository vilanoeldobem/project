# IMPL-0001: Stack — React + Three.js (react-three-fiber) + Cloudflare

**Status:** Proposta — a validar (cartão G11, responsável Nicolas, 09–10/11/2026)
**Data:** 2026-11-08
**Fontes:** pedido do responsável técnico (Augusto, 2026-11-08); doc 06 (requisitos); doc 23 (G11, D01);
DEC-022/025 (3D voxel); Código: `apps/web/`

## Contexto

Nenhum documento do produto escolhe tecnologia. O doc 23 pede decisão de arquitetura e hospedagem até 10/11 com
um teste real em celular. Requisitos: web, celular primeiro, 3D voxel, acessível, custo baixo, equipe de dois
desenvolvedores full-stack e 22 dias.

## Decisão

1. Cliente **React 19 + Three.js** via **@react-three/fiber** (cena declarativa) e **@react-three/drei** (rótulos HTML).
2. Estado global em **zustand**; lógica de jogo em TypeScript puro e testável.
3. **Vite 8** para build; **TypeScript strict**.
4. Hospedagem e backend na **Cloudflare** (Workers + Static Assets + D1) — detalhado em IMPL-0003.
5. Voxels gerados por código e desenhados com `InstancedMesh` até existir pipeline de arte (MagicaVoxel → glTF).

## Alternativas consideradas

- **Babylon.js / PlayCanvas** — rejeitadas: menos integração com React; equipe já usa React.
- **Unity WebGL / Godot web** — rejeitadas: build pesado para celular, UI acessível mais difícil, ciclo lento.
- **Next.js + Vercel** — rejeitada pelo pedido do responsável de usar Cloudflare; SSR não traz ganho para uma cena 3D.
- **Supabase/Firebase** — adiada: D1 cobre a fatia atual; autenticação ainda é pendente.

## Consequências

- Positivas: um idioma (TypeScript) de ponta a ponta; deploy único; custo baixo; iteração rápida.
- Negativas: chunk Three.js ~310 kB gzip; desempenho em celulares de entrada precisa ser medido (G12).
- Verificação: `pnpm check` e `node apps/web/scripts/verify.mjs` (desktop + celular).

## Relacionados

[IMPL-0003](0003-cloudflare-workers-static-assets-d1.md) · [open-questions OQ-01](open-questions.md)
