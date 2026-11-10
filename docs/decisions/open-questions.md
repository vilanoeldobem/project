# Perguntas abertas ao dono do produto

> **Status:** 6 abertas · **Atualizado em:** 2026-11-09
> **Fonte de verdade:** este arquivo; pendências oficiais em `vilanoeldobem_docs/docs/decisions/registro-de-decisoes.md`

Perguntas que o código não decide. Cada uma tem a escolha conservadora usada até a resposta. Respondida → vira ADR
(se técnica) ou DEC no repositório de documentação, e desce para "Resolvidas".

## Abertas

| ID | Pergunta | Opções | Recomendação conservadora (estado atual) | Bloqueia | Fonte |
|---|---|---|---|---|---|
| OQ-01 | A stack React + Three.js + Cloudflare está aprovada? | aprovar / trocar | Seguir com IMPL-0001 como proposta | G11, D01 | doc 23 |
| OQ-02 | Explorar a Vila exige conta? | visitante livre / conta obrigatória | Visitante livre; progresso local | D06, P13 | DEC-038 |
| OQ-03 | Método de login | e-mail mágico / senha / Google | Nenhum implementado | D06 | doc 19 |
| OQ-04 | Rota de entrega: A (integral) ou B (núcleo)? | A / B | Implementar B primeiro | ROADMAP | doc 23, M01 |
| OQ-05 | Ângulo, zoom e controles finais da câmera; orçamento de desempenho em celular | — | Diagonal de cima, deslocamento (0,24,21); vista opcional "Olhar o céu" (IMPL-0006) | G12 | doc 17, G12 |
| OQ-07 | Direção de arte: vila nevada ou Natal brasileiro de verão? | nevada / verão / verão com neve mágica | Vila nevada, escolhida pelo responsável técnico em 2026-11-09 (IMPL-0006); falta registrar como DEC — o guia visual ainda traz o verão como PROPOSTA | Identidade visual (DEC-023) | guia-identidade-visual-voxel.md |

## Resolvidas

- **OQ-06** (2026-11-08, Augusto): o código fica no repositório `vilanoeldobem`, separado da documentação; o
  repositório Git `vilanoeldobem_docs` substitui a pasta `D:\VILA NOEL DO BEM` — registrado como DEC-045 no
  repositório de documentação (PR #1, aguardando revisão).
