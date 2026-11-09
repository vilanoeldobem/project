# Princípios de desenho

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `vilanoeldobem_docs` (DEC-001..044), `AGENTS.md`

## 1. Solidariedade visível, nunca coagida

A doação aparece desde a chegada (DEC-008), mas sem culpa nem pressão: nada de "Você precisa doar".
**No código:** a árvore central é o ponto da doação global (`scene/Props.tsx`); `ui/Donation.tsx` mostra o
destinatário antes de qualquer ação.

## 2. Honestidade sobre o que não existe

Sem parceira, não há botão que finja doar; sem fonte, não há número. **No código:** botões `disabled` com nota
(`ui/Donation.tsx`, `ui/Lot.tsx`), `value: null` em `worker/api.ts`, "—" em `ui/Indicators.tsx`.

## 3. Jogar é gratuito e separado de doar

Jogo e doação nunca se misturam (DEC-029); doação não gera XP (DEC-042). **No código:** `MISSIONS` não tem missão
de doação; `applyEvent` é idempotente.

## 4. Tudo é voxel, texto é plano

Mundo 3D voxel (DEC-022/025); texto longo em painéis HTML legíveis sobre a cena (doc 17). **No código:**
`scene/models.ts` gera modelos por blocos; `ui/Panel.tsx` é o único contêiner de texto.

## 5. Celular primeiro

Toque para andar, botões ≥ 44 px, câmera que se afasta em retrato, `dpr` limitado. **No código:** `Ground`
(`onPointerDown`), `Player` (`zoom`), `styles.css` (`@media (max-width: 640px)`, `pointer: coarse`).

## 6. Mínimo de dados, máximo de cuidado

Público provável inclui menores (ECA Digital, LGPD). **No código:** nenhum dado pessoal nesta versão; progresso
local; logs sem parâmetros; CSP estrita.

## 7. Um deploy, borda primeiro

Cliente estático + API mínima no mesmo Worker. **No código:** `wrangler.jsonc` (`run_worker_first: ["/api/*"]`).

## Ver também

[domain-model.md](domain-model.md) · [decisions/](../decisions/README.md)
