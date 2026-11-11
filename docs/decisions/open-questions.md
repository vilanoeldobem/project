# Perguntas abertas ao dono do produto

> **Status:** 4 abertas · **Atualizado em:** 2026-11-09
> **Fonte de verdade:** este arquivo; pendências oficiais em `vilanoeldobem/docs/docs/decisions/registro-de-decisoes.md`

Perguntas que o código não decide. Cada uma tem a escolha conservadora usada até a resposta. Respondida → vira ADR
(se técnica) ou DEC no repositório de documentação, e desce para "Resolvidas".

## Abertas

| ID | Pergunta | Opções | Recomendação conservadora (estado atual) | Bloqueia | Fonte |
|---|---|---|---|---|---|
| OQ-01 | A stack React + Three.js + Cloudflare está aprovada? | aprovar / trocar | Seguir com IMPL-0001 como proposta | G11, D01 | doc 23 |
| OQ-04 | Rota de entrega: A (integral) ou B (núcleo)? | A / B | Implementar B primeiro | ROADMAP | doc 23, M01 |
| OQ-05 | Ângulo, zoom e controles finais da câmera; orçamento de desempenho em celular | — | Diagonal de cima, deslocamento (0,24,21); vista opcional "Olhar o céu" (IMPL-0006) | G12 | doc 17, G12 |
| OQ-08 | Provedor de envio de e-mail (link de acesso e verificação) | Cloudflare Email Service / provedor externo | Nenhum contratado; cadastro não vai a produção sem ele | 0.4.0 (cadastro e login) | OQ-03 |

## Resolvidas

- **OQ-02** (2026-11-09, Augusto): **explorar a Vila não exige conta.** Visitante anda, joga e faz missões com
  progresso local; criar conta (P13) serve para guardar o progresso no servidor, candidatar uma ONG e, no futuro,
  doar. Ao criar conta, o progresso local é migrado uma única vez, com eventos idempotentes (DEC-038, DEC-042).
- **OQ-03** (2026-11-09, Augusto): **login por link mágico no e-mail** (sem senha). Coleta só o e-mail que o P13 já
  pede, não guarda senha e não usa login social (evita OAuth de terceiros e conta Google de menores). Link de uso
  único com validade curta; sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Depende de um provedor de envio
  de e-mail (OQ-08) e da revisão LGPD / ECA Digital.
- **OQ-07** (2026-11-09, Augusto): direção de arte **vila nevada** (substitui o estudo "Natal brasileiro de verão").
  Implementada em [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md). Falta registrar como DEC no
  repositório de documentação, onde o guia visual ainda traz o verão como PROPOSTA.
- **OQ-06** (2026-11-08, Augusto): o código fica no repositório `vilanoeldobem`, separado da documentação; o
  repositório Git `vilanoeldobem_docs` substitui a pasta `D:\VILA NOEL DO BEM` — registrado como DEC-045 no
  repositório de documentação (PR #1, aguardando revisão). **Atualização 10/11/2026:** os repositórios atuais são
  `vilanoeldobem/project` (código) e `vilanoeldobem/docs` (documentação); os nomes acima registram o contexto original.
