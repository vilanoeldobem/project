# Perguntas abertas ao dono do produto

> **Status:** 8 abertas · **Atualizado em:** 2026-11-12
> **Fonte de verdade:** este arquivo; pendências oficiais em `vilanoeldobem/docs/docs/decisions/registro-de-decisoes.md`

Perguntas que o código não decide. Cada uma tem a escolha conservadora usada até a resposta. Respondida → vira ADR
(se técnica) ou DEC no repositório de documentação, e desce para "Resolvidas".

## Abertas

| ID | Pergunta | Opções | Recomendação conservadora (estado atual) | Bloqueia | Fonte |
|---|---|---|---|---|---|
| OQ-01 | A stack React + Three.js + Cloudflare está aprovada? | aprovar / trocar | Seguir com IMPL-0001 como proposta | G11, D01 | doc 23 |
| OQ-04 | Rota de entrega: A (integral) ou B (núcleo)? | A / B | Implementar B primeiro | ROADMAP | doc 23, M01 |
| OQ-05 | Ângulo, zoom e controles finais da câmera; orçamento de desempenho em celular | — | Diagonal de cima, deslocamento (0,24,21) com zoom do jogador 0,55–1,6×; andar só por clique/toque; vista opcional "Olhar o céu" (IMPL-0006) | G12 | doc 17, G12 |
| OQ-09 | Uma missão aceita pode ser abandonada? Hoje não há essa transição. `newest-house-visit` pede a visita a uma casa publicada: se a única ONG publicada sair da Vila depois do `accept`, a missão não termina e, como só há uma missão ativa por vez, nenhuma outra pode ser aceita | permitir abandonar (volta a "disponível") / concluir ou liberar a missão automaticamente quando o objetivo deixa de existir / manter como está | Sem transição de abandono; a missão só é oferecida enquanto existe uma casa publicada; `quests-v1` desligada em produção (IMPL-0013) | Ligar `quests-v1` em produção (PEN-025) | revisão do PR #19; [IMPL-0013](0013-quests-v1-runtime.md) |
| OQ-11 | Painel administrativo: quais sanções existem e quem as aplica (DEC-037)? Consultas de admin (auditoria, lista de contas) também devem ser auditadas? As seções do painel são as certas? | — | Sem ação de sanção (só o aviso "pendente de definição"); mutações gravam `audit_events`, e a leitura de comprovantes já é auditada conforme IMPL-0017; demais consultas e menu seguem PROPOSTA | seção "Usuários" do painel; ligar as contas com o painel no ar | [IMPL-0015](0015-dash-backoffice-app.md), [IMPL-0017](0017-ngo-files-r2.md), DEC-037 |
| OQ-12 | Arquivos das candidaturas de ONG: quais documentos a organização deve enviar (PEN-019)? Por quanto tempo ficam guardados depois da decisão (aprovação ou rejeição)? Quem, além dos admins, pode lê-los? | lista fechada de documentos / só opcionais; prazo fixo depois da decisão / até a exclusão da conta | Nenhum documento obrigatório nem nomeado; até 5 opcionais; ficam até a pessoa remover ou excluir a conta; só quem enviou e admins leem, com leitura auditada; envio desligado em produção (`NGO_FILES_ENABLED`) | ligar o envio de arquivos; revisão LGPD / ECA Digital | [IMPL-0017](0017-ngo-files-r2.md), PEN-019 |
| OQ-13 | Medição com Google: desde 2026-11-12 a tag do Google (GTM) tenta enviar dados também para `analytics.google.com`, `www.google.com`, `stats.g.doubleclick.net` e `google.com.br/ads/ga-audiences` (Google Signals / públicos de anúncios). A CSP do jogo bloqueia esses destinos: cada bloqueio é um erro de console, parte da medição se perde e `verify.mjs` / `verify-live.mjs` falham. O que fazer? | desligar o Google Signals e os recursos de publicidade na propriedade do Google Analytics / liberar esses hosts na CSP | **Não liberar**: menores são público provável (ECA Digital, LGPD) e esses destinos servem a publicidade. Desligar Google Signals e personalização de anúncios no Google Analytics; a CSP fica como está | medição confiável; `verify.mjs` e `verify-live.mjs` voltarem a passar | conferência em produção de 2026-11-12; [deploy §5](../guides/deploy.md#5-site-público-e-domínios) |
| OQ-15 | Galeria institucional conciliada: ratificar quantidade, tamanho, PNG/JPEG, dimensões, direitos de imagem, consentimentos, retenção e procedimento para órfãos? Como tratar fotos depois da exclusão da conta? | Ratificar a proposta ou ajustar antes de receber arquivos reais; definir retenção por estado editorial | Galeria com revisão individual, no bucket privado `FILES`, separada de logo/comprovantes; PNG/JPEG tratados pelo parser compartilhado; `NGO_PHOTOS_ENABLED` desligada. Sem WebP nesta versão. Exclusão da conta preserva fotos aprovadas de ONG em `published` e remove as demais; leitura pública exige ainda terreno publicado | Ativar galeria e receber fotos reais; integração visual posterior | [IMPL-0021](0021-ngo-files-reconciliation.md), DEC-028/037, PEN-019 |

OQ-14 permanece reservada à retirada na branch do PR #33; OQ-13 continua sendo a questão de analytics do PR #32.

## Resolvidas

- **OQ-10** (2026-11-11, Augusto): **sem Cloudflare Access na frente de `dash.*`.** O painel administrativo usa só o
  login próprio (link mágico, sessão e papel `admin` conferidos pela API), conforme
  [IMPL-0015](0015-dash-backoffice-app.md). O Zero Trust fica para o site interno de documentação e gestão
  (`docs.*`, no repositório de documentação).

- **OQ-08** (2026-11-11, Augusto): o **Resend** envia o link de acesso (segredo `RESEND_API_KEY`, remetente
  `acesso@vilanoeldobem.com.br`, só a mensagem do link), conforme [IMPL-0012](0012-resend-transactional-email.md).
  A resposta anterior do mesmo dia (Cloudflare Email Service, [IMPL-0011](0011-accounts-magic-link-ngo-review.md))
  foi revista. Falta verificar o domínio no Resend e gravar a chave no Worker. **Continua pendente** a revisão LGPD / ECA Digital (idade mínima, consentimentos, retenção): até ela ser
  registrada, as contas ficam desligadas em produção (`ACCOUNTS_ENABLED = "false"`).

- **OQ-02** (2026-11-09, Augusto): **explorar a Vila não exige conta.** Visitante anda, joga e faz missões com
  progresso local; criar conta (P13) serve para guardar o progresso no servidor, candidatar uma ONG e, no futuro,
  doar. Ao criar conta, o progresso local é migrado uma única vez, com eventos idempotentes (DEC-038, DEC-042).
- **OQ-03** (2026-11-09, Augusto): **login por link mágico no e-mail** (sem senha). Coleta só o e-mail que o P13 já
  pede, não guarda senha e não usa login social (evita OAuth de terceiros e conta Google de menores). Link de uso
  único com validade curta; sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Depende de um provedor de envio
  de e-mail (OQ-08, resolvida) e da revisão LGPD / ECA Digital. Implementado em
  [IMPL-0011](0011-accounts-magic-link-ngo-review.md) (15 minutos, uso único; desligado em produção).
- **OQ-07** (2026-11-09, Augusto): direção de arte **vila nevada** (substitui o estudo "Natal brasileiro de verão").
  Implementada em [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md). Falta registrar como DEC no
  repositório de documentação, onde o guia visual ainda traz o verão como PROPOSTA.
- **OQ-06** (2026-11-08, Augusto): o código fica no repositório `vilanoeldobem`, separado da documentação; o
  repositório Git `vilanoeldobem_docs` substitui a pasta `D:\VILA NOEL DO BEM` — registrado como DEC-045 no
  repositório de documentação (PR #1, aguardando revisão). **Atualização 10/11/2026:** os repositórios atuais são
  `vilanoeldobem/project` (código) e `vilanoeldobem/docs` (documentação); os nomes acima registram o contexto original.
